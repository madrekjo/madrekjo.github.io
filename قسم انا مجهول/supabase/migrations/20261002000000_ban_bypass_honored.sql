-- ============================================================================
-- Migration: جعل فك الحظر بالرمز يدوم فعلاً بعد نظام النقاط
-- ============================================================================
-- المشكلة:
--   bypass_ban_with_code كانت تحذف سطر الحظر من blocked_devices فقط.
--   لكن record_visitor_fingerprint تعيد الحساب في كل زيارة:
--     الخطوة 4 تفحص blocked_devices  -> لا شيء بعد الحذف
--     الخطوة 6 تحسب النقاط على ban_fingerprint_profiles -> نفس البصمة = BLOCK
--     فتُعاد كتابة سطر الحظر في نفس اللحظة.
--   النتيجة: المستخدم يُدخل الرمز، يرى "تم رفع الحظر"، ويُحظر فوراً.
--   وفي المتصفح الخفي (device_id جديد) الأمر أسوأ: بصمة جديدة كل مرة.
--
-- الحل:
--   جدول ban_bypasses يستثني الجهاز من مطابقة البصمات، وban_score_visitor
--   يحترم هذا الاستثناء. صفحة الجهاز الأصلي المحظور تبقى نشطة، فشخص آخر
--   يطابق نفس البصمة ما زال ينحظر.
--
-- قرار متعمد: الاستثناء بمعرّف الجهاز وليس ببصمة fp.
--   لو استثنينا بـ fp، جهاز واحد برمز الاستثناء يفتح الباب لشلّة كاملة تشترك
--   بنفس fp (نفس المتصفح/الخطوط/الشاشة) — وهو بالضبط خطأ الحجب على
--   الشبكات المشتركة الذي النظام كله مبني لتفاديه.
--   الثمن: الاستثناء لا ينتقل لمتصفح خفي (device_id جديد). هذا سلوك
--   متوقّع: البصمة تتبع الهوية، والزائر يقدر يسأل الإدارة.
--
-- الرموز:
--   ما في أي رمز سري جوّا هذا الملف. الرمز يُخزَّن كـ hash داخل
--   ban_scoring_config تحت المفتاح 'bypass_code_hash' (انظر bp_crypt).
--   لتغييره: scripts/set_bypass_code.sql  (مستثنى من git).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) pgcrypto: نلفّها بدالة مستقرة بدل الاعتماد على مسار pgcrypto
--    (Supabase يضعها في extensions، لكن بعض التركيبات تضعها في public).
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  ext text;
BEGIN
  SELECT n.nspname INTO ext
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'crypt' AND p.prokind = 'f'
   ORDER BY (n.nspname = 'extensions') DESC, (n.nspname = 'public') DESC
   LIMIT 1;

  IF ext IS NULL THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      ext := 'extensions';
    EXCEPTION WHEN OTHERS THEN
      ext := 'public';
    END;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.bp_crypt(p_code text)
       RETURNS text LANGUAGE sql VOLATILE AS %L',
    format('SELECT encode(%1$I.crypt(p_code, %1$I.gen_salt(''bf'')), ''hex'')', ext)
  );

  -- التحقق لازم يستخدم الهاش المخزّن نفسه كـ salt.
  -- bcrypt لا يقارن بهاش جديد: كل نداء لـ bp_crypt يطلع salt مختلف،
  -- فالمقارنة تفشل دائماً. الصيغة الصحيحة هي crypt(code, stored) = stored.
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.bp_verify(p_code text, p_hash text)
       RETURNS boolean LANGUAGE sql STABLE AS %L',
    format('SELECT coalesce(%1$I.crypt(p_code, p_hash) = p_hash, false)', ext)
  );
END $do$;

COMMENT ON FUNCTION public.bp_verify(text,text) IS
  'مقارنة الرمز بالهاش المخزّن — bp_crypt للتخزين فقط، bp_verify للتحقق';

COMMENT ON FUNCTION public.bp_crypt(text) IS
  'bcrypt hash للرمز — تُستدعى عند تعيين رمز فك الحظر فقط';

-- ---------------------------------------------------------------------------
-- 2) جدول الاستثناءات
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ban_bypasses (
  device_id  text PRIMARY KEY,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

GRANT ALL ON public.ban_bypasses TO service_role;
ALTER TABLE public.ban_bypasses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ban bypasses" ON public.ban_bypasses
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- لا كتابة من الواجهة إطلاقاً: الجدول للإدارة عبر دوال SECURITY DEFINER فقط،
-- وإلا استطاع أي زائر أن يمنح نفسه استثناء.
REVOKE ALL ON public.ban_bypasses FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS ban_bypasses_active_idx
  ON public.ban_bypasses(device_id) WHERE expires_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3) احترام الاستثناء داخل محرك النقاط
--    تعديل واحد فقط: شرط NOT EXISTS داخل cand. لا مساس بالأوزان ولا
--    بالعتبات ولا طريقة "أفضل تطابق منطقي واحد".
--    (لأنها SECURITY DEFINER, الوصول للجدول يتم ضمنياً.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ban_score_visitor(
  p_device_id text, p_fp text, p_canvas text, p_webgl text,
  p_audio text, p_fonts text, p_screen text, p_ua text, p_ip text
)
RETURNS TABLE (
  profile_id        uuid,
  ban_id            uuid,
  profile_device_id text,
  score             int,
  strong_count      int,
  matched           text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb := public.ban_scoring_settings();
  wt  jsonb := cfg -> 'weights';
  st  jsonb := cfg -> 'strong_signals';
BEGIN
  RETURN QUERY
  WITH cand AS (
    SELECT pr.*
      FROM public.ban_fingerprint_profiles pr
     WHERE pr.active
       AND NOT EXISTS (
             SELECT 1
               FROM public.ban_bypasses bb
              WHERE bb.device_id = p_device_id
                AND (bb.expires_at IS NULL OR bb.expires_at > now())
           )
       AND (
             pr.device_id = p_device_id
          OR (p_fp     IS NOT NULL AND pr.fp     = p_fp)
          OR (p_canvas IS NOT NULL AND pr.canvas = p_canvas)
          OR (p_webgl  IS NOT NULL AND pr.webgl  = p_webgl)
          OR (p_audio  IS NOT NULL AND pr.audio  = p_audio)
        )
  ),
  scored AS (
    SELECT pr.profile_id,
           pr.ban_id,
           pr.device_id AS profile_device_id,
           ARRAY_REMOVE(ARRAY[
             CASE WHEN pr.device_id = p_device_id  THEN 'device_id' END,
             CASE WHEN p_fp     IS NOT NULL AND pr.fp     = p_fp     THEN 'fp'     END,
             CASE WHEN p_canvas IS NOT NULL AND pr.canvas = p_canvas THEN 'canvas' END,
             CASE WHEN p_webgl  IS NOT NULL AND pr.webgl  = p_webgl  THEN 'webgl' END,
             CASE WHEN p_audio  IS NOT NULL AND pr.audio  = p_audio  THEN 'audio' END,
             CASE WHEN p_fonts  IS NOT NULL AND pr.fonts  = p_fonts  THEN 'fonts' END,
             CASE WHEN p_ip     IS NOT NULL AND pr.ip     = p_ip     THEN 'ip'     END,
             CASE WHEN p_screen IS NOT NULL AND pr.screen = p_screen THEN 'screen' END,
             CASE WHEN p_ua     IS NOT NULL AND pr.ua     = p_ua     THEN 'ua'     END
           ], NULL) AS matched,
           (CASE WHEN pr.device_id = p_device_id  THEN public.cfg_num(wt,'device_id',100) ELSE 0 END
          + CASE WHEN p_fp     IS NOT NULL AND pr.fp     = p_fp     THEN public.cfg_num(wt,'fp',55)     ELSE 0 END
          + CASE WHEN p_canvas IS NOT NULL AND pr.canvas = p_canvas THEN public.cfg_num(wt,'canvas',15) ELSE 0 END
          + CASE WHEN p_webgl  IS NOT NULL AND pr.webgl  = p_webgl  THEN public.cfg_num(wt,'webgl',15)  ELSE 0 END
          + CASE WHEN p_audio  IS NOT NULL AND pr.audio  = p_audio  THEN public.cfg_num(wt,'audio',10)  ELSE 0 END
          + CASE WHEN p_fonts  IS NOT NULL AND pr.fonts  = p_fonts  THEN public.cfg_num(wt,'fonts',5)   ELSE 0 END
          + CASE WHEN p_ip     IS NOT NULL AND pr.ip     = p_ip     THEN public.cfg_num(wt,'ip',5)      ELSE 0 END
          + CASE WHEN p_screen IS NOT NULL AND pr.screen = p_screen THEN public.cfg_num(wt,'screen',3)  ELSE 0 END
          + CASE WHEN p_ua     IS NOT NULL AND pr.ua     = p_ua     THEN public.cfg_num(wt,'ua',2)     ELSE 0 END
           )::int AS raw_score
      FROM cand pr
  ),
  final AS (
    SELECT s.*,
           (SELECT count(*)::int FROM unnest(s.matched) m
             WHERE m IN (SELECT jsonb_array_elements_text(st))) AS strong_count
      FROM scored s
  )
  SELECT f.profile_id,
         f.ban_id,
         f.profile_device_id,
         LEAST(100, f.raw_score)::int,
         f.strong_count,
         f.matched
    FROM final f
   WHERE f.raw_score > 0
   ORDER BY LEAST(100, f.raw_score) DESC, f.strong_count DESC, f.profile_device_id
   LIMIT 5;
END $$;
REVOKE EXECUTE ON FUNCTION public.ban_score_visitor(text,text,text,text,text,text,text,text,text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4) فك الحظر بالرمز — النسخة المصحّحة
--    لا نلمح profile الجهاز المحظور الأصلي: نرفع الحظر عن هذا الزائر فقط.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bypass_ban_with_code(p_device_id text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid device');
  END IF;

  SELECT value #>> '{}' INTO stored_hash
    FROM public.ban_scoring_config
   WHERE key = 'bypass_code_hash';

  IF stored_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not configured');
  END IF;

  IF p_code IS NULL OR NOT public.bp_verify(p_code, stored_hash) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad code');
  END IF;

  -- 1) استثناء من مطابقة البصمات — هذا ما يجعل الرفع يدوم
  INSERT INTO public.ban_bypasses(device_id, reason)
  VALUES (p_device_id, 'bypass code')
  ON CONFLICT (device_id) DO UPDATE
    SET reason = EXCLUDED.reason, created_at = now(), expires_at = NULL;

  -- 2) إزالة سجل الحظر الفعّال لهذا الجهاز
  DELETE FROM public.blocked_devices WHERE device_id = p_device_id;

  -- 3) إغلاق أي تحديات مفتوحة حتى لا تُرقّى إلى حظر بعد 3 مرات
  UPDATE public.ban_challenges
     SET status = 'LIFTED', resolved_at = now()
   WHERE device_id = p_device_id
     AND status = 'OPEN';

  RETURN jsonb_build_object('ok', true, 'device_id', p_device_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) الأدمن يستطيع إزالة استثناء (نسيان الرمز لا يبقى أحداً محظوراً للأبد)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_clear_ban_bypass(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.ban_bypasses WHERE device_id = p_device_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_clear_ban_bypass(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_ban_bypass(text) TO authenticated;

COMMIT;
