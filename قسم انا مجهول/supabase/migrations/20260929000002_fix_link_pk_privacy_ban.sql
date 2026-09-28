-- =========================================================
-- إصلاحات ما بعد ربط الهوية:
--  1) تعارض PK في device_fingerprints أثناء نقل المعرّف الجديد
--     (device_id, ip_hash) — كان UPDATE يرمي 23505 فيقفل الربط.
--  2) الخصوصية: get_device_name وقراءة blocked_devices كانت متاحة
--     لكل زائر، أي تسريب أسماء المستخدمين وقائمة المحظورين.
--  3) قاعدة الحظر: كانت ua تكفي مع screen → حظر خاطئ لناس عاديين.
-- =========================================================

-- -------------------------------------------------------------
-- 1) دالة آمنة لوجود ميزة الأسماء (بدل كشف الاسم للزائر)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.device_name_feature()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_regclass('public.device_names') IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.device_name_feature() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.device_name_feature() TO anon, authenticated;

-- -------------------------------------------------------------
-- 2) منع تسريب الأسماء: لم تعد متاحة للزوار
--    (تبقى تعمل داخلياً لأن الدوال المستدعية SECURITY DEFINER)
-- -------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_device_name(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_device_name(text) TO service_role;

-- -------------------------------------------------------------
-- 3) منع تسريب قائمة المحظورين (الزائر لا يحتاج إلا check_visitor_banned)
-- -------------------------------------------------------------
REVOKE SELECT ON public.blocked_devices FROM anon;
DROP POLICY IF EXISTS "anyone can check blocks" ON public.blocked_devices;

-- -------------------------------------------------------------
-- 4) إعادة تعريف record_visitor_fingerprint بالاتجاهات الثلاثة
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(
  p_device_id text, p_ip_hash text, p_ua_hash text, p_canvas_hash text,
  p_webgl_hash text, p_audio_hash text, p_fonts_hash text,
  p_screen_hash text, p_fp_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.blocked_devices;
  match_reason text;
  strong_hits int;
  has_hard_sig boolean;
  w jsonb;
  my_name text;
  linked_id text;
  new_id text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  -- ربط الهوية عبر الدومين/المتصفح: نفس الجهاز بمعرّف جديد
  -- نرجّعه لمعرّفه الأصلي حتى لا يفقد اسمه ولا رقمه ولا سجلّه.
  -- الشرط: تطابق بصمتين قويتين على الأقل (canvas/fp/screen).
  SELECT ds.device_id INTO linked_id
    FROM public.device_signatures ds
    JOIN (VALUES
      ('canvas'::text, p_canvas_hash),
      ('fp',           p_fp_hash),
      ('screen',       p_screen_hash)
    ) v(t, val) ON ds.sig_type = v.t AND ds.sig_value = v.val
   WHERE ds.device_id <> p_device_id
     AND v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
   GROUP BY ds.device_id
  HAVING count(DISTINCT v.t) >= 2
   ORDER BY count(DISTINCT v.t) DESC, max(ds.last_seen) DESC
   LIMIT 1;

  IF linked_id IS NOT NULL THEN
    new_id := p_device_id;

    -- نقل بصمات الشبكة بلا تعارض: ندمج الصفوف ثم نحذف المعرّف المزدوج.
    -- (UPDATE مباشر كان يرمي unique violation على (device_id, ip_hash))
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash, first_seen, last_seen, hits)
    SELECT linked_id, df.ip_hash, df.ua_hash, df.first_seen, df.last_seen, df.hits
      FROM public.device_fingerprints df
     WHERE df.device_id = new_id
    ON CONFLICT (device_id, ip_hash) DO UPDATE
       SET last_seen = GREATEST(public.device_fingerprints.last_seen, EXCLUDED.last_seen),
           hits     = public.device_fingerprints.hits + EXCLUDED.hits,
           ua_hash  = EXCLUDED.ua_hash;
    DELETE FROM public.device_fingerprints WHERE device_id = new_id;

    -- الاسم: لو المعرّف الأصلي بلا اسم وكان الجديد له اسم، ننقله
    IF NOT EXISTS (SELECT 1 FROM public.device_names WHERE device_id = linked_id) THEN
      INSERT INTO public.device_names(device_id, name)
      SELECT linked_id, dn.name FROM public.device_names dn WHERE dn.device_id = new_id
      ON CONFLICT (device_id) DO NOTHING;
    END IF;

    -- تحذيرات غير مقروءة تنتقل معه
    UPDATE public.device_warnings dw
       SET device_id = linked_id
     WHERE dw.device_id = new_id
       AND dw.seen_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.device_warnings x
          WHERE x.device_id = linked_id AND x.message = dw.message AND x.seen_at IS NULL
       );

    DELETE FROM public.device_warnings   WHERE device_id = new_id;
    DELETE FROM public.device_signatures WHERE device_id = new_id;
    p_device_id := linked_id;
  END IF;

  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

  my_name := public.get_device_name(p_device_id);

  -- الحظر اليدوي فقط
  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
      DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    ELSE
      RETURN jsonb_build_object(
        'banned', true,
        'reason', COALESCE(b.reason, 'محظور'),
        'expires_at', b.expires_at,
        'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END,
        'device_name', my_name,
        'device_id', p_device_id,
        'linked', linked_id IS NOT NULL
      ) || COALESCE(w, '{}'::jsonb);
    END IF;
  END IF;

  -- تسجيل البصمات (للعرض والربط فقط — لا يُمنع على أساسها)
  INSERT INTO public.device_signatures(device_id, sig_type, sig_value)
  SELECT p_device_id, v.t, v.val
    FROM (VALUES
      ('ip'::text,     p_ip_hash),
      ('ua',           p_ua_hash),
      ('canvas',       p_canvas_hash),
      ('webgl',        p_webgl_hash),
      ('audio',        p_audio_hash),
      ('fonts',        p_fonts_hash),
      ('screen',       p_screen_hash),
      ('fp',           p_fp_hash)
    ) AS v(t, val)
   WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  ON CONFLICT (device_id, sig_type, sig_value) DO UPDATE
    SET last_seen = now();

  IF p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown' THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;
  END IF;

  -- الحظر التلقائي: إشارتان مطابقتان على الأقل، مع اشتراط
  -- بصمة صعبة (canvas أو fp). الجمع بين ua و screen وحده لا يكفي.
  strong_hits := (
    SELECT count(*)::int
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('fp',           p_fp_hash),
        ('ua',           p_ua_hash),
        ('screen',       p_screen_hash)
      ) v(t, val)
     JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
    WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  );

  has_hard_sig := EXISTS (
    SELECT 1
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('fp',           p_fp_hash)
      ) v(t, val)
     JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
    WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  );

  IF strong_hits >= 2 AND has_hard_sig THEN
    SELECT bs.reason INTO match_reason
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('fp',           p_fp_hash),
        ('ua',           p_ua_hash),
        ('screen',       p_screen_hash)
      ) v(t, val)
     JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
    WHERE v.val IS NOT NULL AND length(v.val) >= 8
    LIMIT 1;

    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (p_device_id, 'fingerprint match: ' || COALESCE(match_reason, 'device ban'))
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('banned', true, 'reason', match_reason, 'device_name', my_name,
                              'device_id', p_device_id, 'linked', linked_id IS NOT NULL)
      || COALESCE(w, '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object('banned', false, 'device_name', my_name,
                            'device_id', p_device_id, 'linked', linked_id IS NOT NULL)
    || COALESCE(w, '{}'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;
