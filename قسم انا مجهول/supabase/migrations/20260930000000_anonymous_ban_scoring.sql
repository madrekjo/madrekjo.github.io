-- ============================================================================
--  Anonymous Ban Scoring System  —  نظام الحظر بالإشارات المتعددة
-- ============================================================================
--  المشكلة التي يحلّها هذا الملف:
--    كان الحظر التلقائي مبنياً على جدول مسطّح (banned_signatures) يجمع
--    البصمات من *كل* الأجهزة المحظورة، والقرار كان:
--        strong_hits >= 2  AND (canvas OR fp مطابق)
--    => false positives كثيرة:
--       • canvas + ua لنفس المتصفح/الجهاز المتشابه
--       • screen + ua على شبكة مدرسة (نفس الشاشة ونفس المتصفح) => حظر جماعي
--       • ونقاط الإشارات كانت تُجمع من أجهزة محظورة مختلفة كأنها جهاز واحد.
--
--  الحل: Anonymous Ban Scoring System
--    1) كل جهاز محظور له "fingerprint profile" واحد (ban_fingerprint_profiles).
--    2) النقاط تُحسب لكل profile على حدة، ثم يُؤخذ *أعلى* تطابق منطقي فقط.
--       لا تُجمع نقاط من أجهزة مختلفة.
--    3) أوزان الإشارات (weights):
--         device_id = 100 | fp = 55 | canvas = 15 | webgl = 15
--         audio = 10 | fonts = 5 | ip = 5 | screen = 3 | ua = 2
--    4) مستويات القرار:
--         score >= 100                          => BLOCK
--         90..99  مع 3+ إشارات قوية             => BLOCK
--         70..89  مع 2+ إشارات قوية             => CHALLENGE (تسجيل، لا حظر)
--         < 70                                  => ALLOW
--       => لا يمكن لأي إشارة مفردة أن تبلغ الحظر.
--    5) لا يوجد "اكتشاف Incognito": الاعتماد على عدة إشارات معاً.
--    6) الخادم (هذه الدوال SECURITY DEFINER) هو من يحسب النقاط ويقرر.
--       العميل يرسل إشارات (hashes) فقط ولا يستطيع تعديل score/ban_status.
--
--  ملاحظة مهمة: banned_signatures / banned_fingerprints لم تُحذف (قد يحتاجها
--  الأدمن للتشخيص، وتُهاجَر بياناتها إلى الـ profiles في القسم 6) لكنها لم
--  تعد تُستخدم في اتخاذ قرار الحظر إطلاقاً.
-- ============================================================================


-- ============================================================================
-- 1) إعدادات النظام (weights / strong signals / thresholds / escalation)
--    قابلة للضبط من الأدمن بدون migration جديد.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ban_scoring_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT ALL ON public.ban_scoring_config TO service_role;
ALTER TABLE public.ban_scoring_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ban scoring config" ON public.ban_scoring_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ban_scoring_config(key, value) VALUES
  ('weights', '{"device_id":100,"fp":55,"canvas":15,"webgl":15,"audio":10,"fonts":5,"screen":3,"ua":2,"ip":5}'::jsonb),
  ('strong_signals', '["fp","canvas","webgl","audio"]'::jsonb),
  ('thresholds', '{"block":100,"block_soft":90,"block_soft_min_strong":3,"challenge":70,"challenge_min_strong":2}'::jsonb),
  ('escalate_after', '3'::jsonb),
  ('link_identity_min_strong', '2'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- قارئ الأرقام مع قيمة افتراضية آمنة
CREATE OR REPLACE FUNCTION public.cfg_num(src jsonb, k text, def numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(src ->> k, '')::numeric, def)
$$;
REVOKE EXECUTE ON FUNCTION public.cfg_num(jsonb,text,numeric) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ban_scoring_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'weights', COALESCE(
      (SELECT value FROM public.ban_scoring_config WHERE key = 'weights'),
      '{"device_id":100,"fp":55,"canvas":15,"webgl":15,"audio":10,"fonts":5,"screen":3,"ua":2,"ip":5}'::jsonb),
    'strong_signals', COALESCE(
      (SELECT value FROM public.ban_scoring_config WHERE key = 'strong_signals'),
      '["fp","canvas","webgl","audio"]'::jsonb),
    'thresholds', COALESCE(
      (SELECT value FROM public.ban_scoring_config WHERE key = 'thresholds'),
      '{"block":100,"block_soft":90,"block_soft_min_strong":3,"challenge":70,"challenge_min_strong":2}'::jsonb),
    'escalate_after', COALESCE(
      (SELECT value FROM public.ban_scoring_config WHERE key = 'escalate_after'),
      '3'::jsonb),
    'link_identity_min_strong', COALESCE(
      (SELECT value FROM public.ban_scoring_config WHERE key = 'link_identity_min_strong'),
      '2'::jsonb)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.ban_scoring_settings() FROM PUBLIC;


-- ============================================================================
-- 2) توسيع blocked_devices (الجدول القائم يُطوَّر — لا جدول بديل)
--    ban_id / user_id / ban_status / decision / confidence_score / matched_signals
--    ban_expires_at + ban_created_at كأعمدة مولّدة من expires_at / created_at
--    حتى يبقى هناك مصدر واحد للحقيقة.
-- ============================================================================
ALTER TABLE public.blocked_devices
  ADD COLUMN IF NOT EXISTS ban_id          uuid,
  ADD COLUMN IF NOT EXISTS user_id         uuid,
  ADD COLUMN IF NOT EXISTS ban_status      text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS decision        text,
  ADD COLUMN IF NOT EXISTS confidence_score integer,
  ADD COLUMN IF NOT EXISTS matched_signals text[],
  ADD COLUMN IF NOT EXISTS matched_profile_device_id text,
  ADD COLUMN IF NOT EXISTS match_reason    text,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen       timestamptz,
  ADD COLUMN IF NOT EXISTS unbanned_at     timestamptz,
  ADD COLUMN IF NOT EXISTS unbanned_by     uuid;

-- الصفوف القديمة تبقى ACTIVE (لا حذف لأي بيانات حظر قائمة)
UPDATE public.blocked_devices
   SET ban_id = gen_random_uuid()
 WHERE ban_id IS NULL;

ALTER TABLE public.blocked_devices
  ALTER COLUMN ban_id SET DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blocked_devices_ban_id_uniq') THEN
    ALTER TABLE public.blocked_devices
      ADD CONSTRAINT blocked_devices_ban_id_uniq UNIQUE (ban_id);
  END IF;
END $$;

-- أعمدة مولّدة (مصدر واحد للحقيقة مع expires_at / created_at)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='blocked_devices' AND column_name='ban_expires_at') THEN
    ALTER TABLE public.blocked_devices
      ADD COLUMN ban_expires_at timestamptz GENERATED ALWAYS AS (expires_at) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='blocked_devices' AND column_name='ban_created_at') THEN
    ALTER TABLE public.blocked_devices
      ADD COLUMN ban_created_at timestamptz GENERATED ALWAYS AS (created_at) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blocked_devices_ban_status_chk') THEN
    ALTER TABLE public.blocked_devices
      ADD CONSTRAINT blocked_devices_ban_status_chk
      CHECK (ban_status IN ('ACTIVE','UNBANNED','REVOKED','EXPIRED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blocked_devices_decision_chk') THEN
    ALTER TABLE public.blocked_devices
      ADD CONSTRAINT blocked_devices_decision_chk
      CHECK (decision IS NULL OR decision IN
        ('MANUAL','AUTO_BLOCK','CHALLENGE_ESCALATED','LEGACY_AUTO'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS blocked_devices_status_idx
  ON public.blocked_devices(ban_status, created_at DESC);
CREATE INDEX IF NOT EXISTS blocked_devices_profile_idx
  ON public.blocked_devices(matched_profile_device_id) WHERE ban_status = 'ACTIVE';


-- ============================================================================
-- 3) fingerprint profile لكل حظر (الوحدة التي تُقارَن عليها النقاط)
--    profile واحد لكل ban — قيم hash فقط، لا بيانات خام.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ban_fingerprint_profiles (
  profile_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ban_id       uuid NOT NULL UNIQUE
                 REFERENCES public.blocked_devices(ban_id) ON DELETE CASCADE,
  device_id    text NOT NULL,
  fp           text,
  canvas       text,
  webgl        text,
  audio        text,
  fonts        text,
  screen       text,
  ua           text,
  ip           text,
  signal_count int NOT NULL DEFAULT 0,
  strong_count int NOT NULL DEFAULT 0,
  source       text NOT NULL DEFAULT 'device_signatures',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ban_fingerprint_profiles TO service_role;
ALTER TABLE public.ban_fingerprint_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ban profiles" ON public.ban_fingerprint_profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- فهارس جزئية على الإشارات القوية فقط: الاستعلام الساخن لا يلمس إلا الـ profiles النشطة
CREATE INDEX IF NOT EXISTS ban_profiles_fp_idx     ON public.ban_fingerprint_profiles(fp)     WHERE active;
CREATE INDEX IF NOT EXISTS ban_profiles_canvas_idx ON public.ban_fingerprint_profiles(canvas) WHERE active;
CREATE INDEX IF NOT EXISTS ban_profiles_webgl_idx  ON public.ban_fingerprint_profiles(webgl)  WHERE active;
CREATE INDEX IF NOT EXISTS ban_profiles_audio_idx  ON public.ban_fingerprint_profiles(audio)  WHERE active;
CREATE INDEX IF NOT EXISTS ban_profiles_device_idx ON public.ban_fingerprint_profiles(device_id);


-- ============================================================================
-- 4) سجل التدقيق + جدول التحديات (CHALLENGE)
--    لا تُسجَّل بيانات خام: فقط مؤشرات/هاشات ومعرّفات.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ban_audit_log (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id                 text NOT NULL,
  ban_id                    uuid,
  ban_status                text,
  decision                  text NOT NULL,
  score                     int  NOT NULL DEFAULT 0,
  strong_count              int  NOT NULL DEFAULT 0,
  matched_signals           text[] NOT NULL DEFAULT '{}',
  matched_profile_device_id text,
  matched_profile_id        uuid,
  reason                    text,
  actor                     text NOT NULL DEFAULT 'system',
  created_at                timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ban_audit_log TO service_role;
ALTER TABLE public.ban_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ban audit" ON public.ban_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS ban_audit_device_idx ON public.ban_audit_log(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ban_audit_time_idx   ON public.ban_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS ban_audit_ban_idx    ON public.ban_audit_log(ban_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ban_challenges (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id                 text NOT NULL,
  score                     int  NOT NULL DEFAULT 0,
  strong_count              int  NOT NULL DEFAULT 0,
  matched_signals           text[] NOT NULL DEFAULT '{}',
  matched_profile_device_id text,
  matched_profile_id        uuid,
  reason                    text,
  status                    text NOT NULL DEFAULT 'OPEN',
  created_at                timestamptz NOT NULL DEFAULT now(),
  resolved_at               timestamptz,
  resolved_by               uuid
);
GRANT ALL ON public.ban_challenges TO service_role;
ALTER TABLE public.ban_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ban challenges" ON public.ban_challenges
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS ban_challenges_device_idx ON public.ban_challenges(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ban_challenges_open_idx   ON public.ban_challenges(device_id) WHERE status = 'OPEN';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ban_challenges_status_chk') THEN
    ALTER TABLE public.ban_challenges
      ADD CONSTRAINT ban_challenges_status_chk
      CHECK (status IN ('OPEN','CLEARED','ESCALATED'));
  END IF;
END $$;


-- ============================================================================
-- 5) بناء/تحديث الـ profile تلقائياً عند الحظر
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ban_sync_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st  jsonb := public.ban_scoring_settings();
  sig text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT s.sig_type), '{}')
    INTO sig
    FROM public.device_signatures s
   WHERE s.device_id = NEW.device_id;

  INSERT INTO public.ban_fingerprint_profiles AS p
    (ban_id, device_id, fp, canvas, webgl, audio, fonts, screen, ua, ip,
     signal_count, strong_count, source, active, created_at, updated_at)
  SELECT NEW.ban_id,
         NEW.device_id,
         max(s.sig_value) FILTER (WHERE s.sig_type = 'fp'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'canvas'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'webgl'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'audio'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'fonts'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'screen'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'ua'),
         (SELECT df.ip_hash FROM public.device_fingerprints df
           WHERE df.device_id = NEW.device_id ORDER BY df.last_seen DESC LIMIT 1),
         count(*),
         (SELECT count(*) FROM unnest(sig) t
           WHERE t IN (SELECT jsonb_array_elements_text(st))),
         'device_signatures',
         (NEW.ban_status = 'ACTIVE'),
         now(), now()
    FROM public.device_signatures s
   WHERE s.device_id = NEW.device_id
     AND s.sig_value IS DISTINCT FROM 'unknown'
  ON CONFLICT (ban_id) DO UPDATE SET
    fp       = COALESCE(EXCLUDED.fp,       p.fp),
    canvas   = COALESCE(EXCLUDED.canvas,   p.canvas),
    webgl    = COALESCE(EXCLUDED.webgl,    p.webgl),
    audio    = COALESCE(EXCLUDED.audio,    p.audio),
    fonts    = COALESCE(EXCLUDED.fonts,    p.fonts),
    screen   = COALESCE(EXCLUDED.screen,   p.screen),
    ua       = COALESCE(EXCLUDED.ua,       p.ua),
    ip       = COALESCE(EXCLUDED.ip,       p.ip),
    signal_count = GREATEST(p.signal_count, EXCLUDED.signal_count),
    strong_count = GREATEST(p.strong_count, EXCLUDED.strong_count),
    active   = EXCLUDED.active,
    updated_at = now();

  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.ban_sync_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS blocked_devices_sync_profile ON public.blocked_devices;
CREATE TRIGGER blocked_devices_sync_profile
  AFTER INSERT OR UPDATE OF ban_status ON public.blocked_devices
  FOR EACH ROW EXECUTE FUNCTION public.ban_sync_profile();


-- ============================================================================
-- 6) هجرة البيانات القديمة: بناء profile لكل حظر قائم
--    لا حذف — فقط إضافة الـ profiles حتى يستمر النظام الجديد بالمقارنة معها.
--    6.a) من device_signatures (المصدر الأدق)
-- ============================================================================
INSERT INTO public.ban_fingerprint_profiles AS p
  (ban_id, device_id, fp, canvas, webgl, audio, fonts, screen, ua, ip,
   signal_count, source, active)
SELECT bd.ban_id,
       bd.device_id,
       max(s.sig_value) FILTER (WHERE s.sig_type = 'fp'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'canvas'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'webgl'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'audio'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'fonts'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'screen'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'ua'),
       (SELECT df.ip_hash FROM public.device_fingerprints df
         WHERE df.device_id = bd.device_id ORDER BY df.last_seen DESC LIMIT 1),
       count(*),
       'device_signatures',
       (bd.ban_status = 'ACTIVE')
  FROM public.blocked_devices bd
  JOIN public.device_signatures s ON s.device_id = bd.device_id
 WHERE s.sig_value IS DISTINCT FROM 'unknown'
 GROUP BY bd.ban_id, bd.device_id
ON CONFLICT (ban_id) DO NOTHING;

-- 6.b) من banned_signatures (يغطّي الحالات القديمة التي فُقدت منها device_signatures)
INSERT INTO public.ban_fingerprint_profiles AS p
  (ban_id, device_id, fp, canvas, webgl, audio, fonts, screen, ua, ip,
   signal_count, source, active)
SELECT bd.ban_id,
       bs.origin_device_id,
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'fp'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'canvas'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'webgl'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'audio'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'fonts'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'screen'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'ua'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'ip'),
       count(*),
       'banned_signatures',
       (bd.ban_status = 'ACTIVE')
  FROM public.banned_signatures bs
  JOIN public.blocked_devices bd ON bd.device_id = bs.origin_device_id
 WHERE bs.origin_device_id IS NOT NULL
   AND bd.ban_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.ban_fingerprint_profiles x WHERE x.ban_id = bd.ban_id)
 -- ban_status لازم يكون في GROUP BY: ban_id_constraint UNIQUE وليس PRIMARY KEY،
 -- فـ Postgres ما بيستنتج الاعتماد الوظيفي تلقائياً مثل ما يفعل مع PK حقيقي.
 -- ban_id واحد = ban_status واحد، فإضافة العمود لا تغيّر التقسيم.
 GROUP BY bd.ban_id, bd.ban_status, bs.origin_device_id
ON CONFLICT (ban_id) DO UPDATE SET
  fp     = COALESCE(p.fp,     EXCLUDED.fp),
  canvas = COALESCE(p.canvas, EXCLUDED.canvas),
  webgl  = COALESCE(p.webgl,  EXCLUDED.webgl),
  audio  = COALESCE(p.audio,  EXCLUDED.audio),
  fonts  = COALESCE(p.fonts,  EXCLUDED.fonts),
  screen = COALESCE(p.screen, EXCLUDED.screen),
  ua     = COALESCE(p.ua,     EXCLUDED.ua),
  ip     = COALESCE(p.ip,     EXCLUDED.ip);

-- 6.c) الحظر التلقائي القديم (reason يبدأ بـ 'fingerprint match:') كان مبنياً على
--      قاعدة معيبة => نعلّمه للمراجعة اليدوية بدل إبقائه مطمئناً. لا حذف.
UPDATE public.blocked_devices
   SET requires_review = true,
       decision = COALESCE(decision, 'LEGACY_AUTO')
 WHERE decision IS NULL
   AND reason LIKE 'fingerprint match:%';


-- ============================================================================
-- 7) محرّك النقاط: ban_score_visitor
--    يرجع أفضل profile محظور مطابق (score + matched) — مرة واحدة لكل visit.
--    Candidate selection = الـ profiles النشطة التي تطابق إشارة قوية واحدة
--    على الأقل (fp/canvas/webgl/audio/device_id). بدون إشارة قوية أقصى score
--    هو 15 فقط، وهو أقل من عتبة CHALLENGE (70) => لا حاجة لفحصها أصلاً.
-- ============================================================================
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
             CASE WHEN p_webgl  IS NOT NULL AND pr.webgl  = p_webgl  THEN 'webgl'  END,
             CASE WHEN p_audio  IS NOT NULL AND pr.audio  = p_audio  THEN 'audio'  END,
             CASE WHEN p_fonts  IS NOT NULL AND pr.fonts  = p_fonts  THEN 'fonts'  END,
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
          + CASE WHEN p_ua     IS NOT NULL AND pr.ua     = p_ua     THEN public.cfg_num(wt,'ua',2)      ELSE 0 END
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


-- ============================================================================
-- 8) دالة القرار: من score إلى BLOCK / CHALLENGE / ALLOW
--    >= 100                    => BLOCK
--    >= 90 و 3+ إشارات قوية    => BLOCK
--    >= 70 و 2+ إشارات قوية    => CHALLENGE
--    < 70                      => ALLOW
--    (شرط 2+ إشارة قوية لـ CHALLENGE يمنع أخطاء الحجب على شبكات المدارس:
--    أجهزة حاسوب متطابقة داخل معمل واحد قد تتطابق في fp مع شاشة وخطوط
--    ومتصفح وIP مشتركة = 70 نقطة بالضبط، وهي غير كافية للحظر أو للتحقق.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ban_decide(p_score int, p_strong_count int)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (SELECT public.ban_scoring_settings() c),
       t AS (SELECT c -> 'thresholds' th FROM s)
  SELECT CASE
           WHEN COALESCE(p_score,0) >= public.cfg_num(th,'block',100) THEN 'BLOCK'
           WHEN COALESCE(p_score,0) >= public.cfg_num(th,'block_soft',90)
             AND COALESCE(p_strong_count,0) >= public.cfg_num(th,'block_soft_min_strong',3) THEN 'BLOCK'
           WHEN COALESCE(p_score,0) >= public.cfg_num(th,'challenge',70)
             AND COALESCE(p_strong_count,0) >= public.cfg_num(th,'challenge_min_strong',2) THEN 'CHALLENGE'
           ELSE 'ALLOW'
         END
    FROM t
$$;
REVOKE EXECUTE ON FUNCTION public.ban_decide(int,int) FROM PUBLIC;


-- ============================================================================
-- 9) سجل التدقيق
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ban_log_audit(
  p_device_id text, p_ban_id uuid, p_ban_status text,
  p_decision text, p_score int, p_strong_count int,
  p_matched text[], p_profile_device_id text, p_profile_id uuid,
  p_reason text, p_actor text DEFAULT 'system'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ban_audit_log(
    device_id, ban_id, ban_status, decision, score, strong_count,
    matched_signals, matched_profile_device_id, matched_profile_id, reason, actor)
  VALUES (
    p_device_id, p_ban_id, p_ban_status, p_decision, COALESCE(p_score,0),
    COALESCE(p_strong_count,0), COALESCE(p_matched,'{}'::text[]),
    p_profile_device_id, p_profile_id,
    left(COALESCE(p_reason,''), 500), COALESCE(p_actor,'system'));
END $$;
REVOKE EXECUTE ON FUNCTION public.ban_log_audit(text,uuid,text,text,int,int,text[],text,uuid,text,text)
  FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 10) الحظر الفعّال فقط: device_is_blocked (تستخدمه سياسات RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.device_is_blocked(p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_devices
     WHERE device_id = p_device_id
       AND ban_status = 'ACTIVE'
       AND (expires_at IS NULL OR expires_at > now())
  )
$$;
REVOKE EXECUTE ON FUNCTION public.device_is_blocked(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.device_is_blocked(text) TO anon, authenticated;

-- التحديات المفتوحة: تقييد خفيف (منع الإبلاغ فقط) — ليست حظراً
CREATE OR REPLACE FUNCTION public.device_has_open_challenge(p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ban_challenges
     WHERE device_id = p_device_id
       AND status = 'OPEN'
       AND created_at > now() - interval '7 days'
  )
$$;
REVOKE EXECUTE ON FUNCTION public.device_has_open_challenge(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.device_has_open_challenge(text) TO anon, authenticated;


-- ============================================================================
-- 11) check_visitor_banned — الحظر النشط فقط + انتهاء المدة
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_visitor_banned(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.blocked_devices;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false, 'decision', 'ALLOW', 'score', 0);
  END IF;

  -- إنهاء الحظر المؤقت: تغيير حالة (لا حذف) حتى يبقى سجل التدقيق
  UPDATE public.blocked_devices
     SET ban_status = 'EXPIRED'
   WHERE device_id = p_device_id
     AND ban_status = 'ACTIVE'
     AND expires_at IS NOT NULL
     AND expires_at <= now();

  SELECT * INTO b FROM public.blocked_devices
   WHERE device_id = p_device_id AND ban_status = 'ACTIVE' LIMIT 1;
  IF b.device_id IS NULL THEN
    RETURN jsonb_build_object('banned', false, 'decision', 'ALLOW', 'score', 0);
  END IF;

  RETURN jsonb_build_object(
    'banned', true,
    'decision', 'BLOCK',
    'reason', COALESCE(b.reason, 'محظور'),
    'expires_at', b.expires_at,
    'ban_expires_at', b.ban_expires_at,
    'score', COALESCE(b.confidence_score, 100),
    'matched', COALESCE(b.matched_signals, ARRAY['device_id']::text[]),
    'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.check_visitor_banned(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_visitor_banned(text) TO anon, authenticated;


-- ============================================================================
-- 12) record_visitor_fingerprint — الدالة الرئيسية (نفس الـ signature)
--     ترجع: banned / decision / score / matched / challenge / …
--     الخادم يحسب كل شيء. العميل لا يرسل score أبداً.
-- ============================================================================
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
  b        public.blocked_devices;
  linked_id text;
  new_id    text;
  my_name   text;
  warn      jsonb;
  best_ban      uuid;
  best_prof     uuid;
  best_prof_dev text;
  best_score    int := 0;
  best_strong   int := 0;
  best_matched  text[] := '{}'::text[];
  cfg       jsonb := public.ban_scoring_settings();
  decision  text := 'ALLOW';
  score     int  := 0;
  strong_n  int  := 0;
  matched   text[] := '{}'::text[];
  prof_dev  text;
  prof_id   uuid;
  open_ch   int := 0;
  esc_after int;
  reason    text;
  out       jsonb;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false, 'decision', 'ALLOW', 'score', 0,
                              'matched', '[]'::jsonb);
  END IF;

  -- 0) تنقية الإشارات: تحويل 'unknown' والقصير إلى NULL
  IF p_ip_hash     IS NULL OR length(p_ip_hash)     < 8 OR p_ip_hash     = 'unknown' THEN p_ip_hash     := NULL; END IF;
  IF p_ua_hash     IS NULL OR length(p_ua_hash)     < 8 OR p_ua_hash     = 'unknown' THEN p_ua_hash     := NULL; END IF;
  IF p_canvas_hash IS NULL OR length(p_canvas_hash) < 8 OR p_canvas_hash = 'unknown' THEN p_canvas_hash := NULL; END IF;
  IF p_webgl_hash  IS NULL OR length(p_webgl_hash)  < 8 OR p_webgl_hash  = 'unknown' THEN p_webgl_hash  := NULL; END IF;
  IF p_audio_hash  IS NULL OR length(p_audio_hash)  < 8 OR p_audio_hash  = 'unknown' THEN p_audio_hash  := NULL; END IF;
  IF p_fonts_hash  IS NULL OR length(p_fonts_hash)  < 8 OR p_fonts_hash  = 'unknown' THEN p_fonts_hash  := NULL; END IF;
  IF p_screen_hash IS NULL OR length(p_screen_hash) < 8 OR p_screen_hash = 'unknown' THEN p_screen_hash := NULL; END IF;
  IF p_fp_hash     IS NULL OR length(p_fp_hash)     < 8 OR p_fp_hash     = 'unknown' THEN p_fp_hash     := NULL; END IF;

  -- 1) ربط الهوية (نفس الجهاز بمعرّف جديد بعد مسح التخزين/تغيّر الدومين)
  --    قاعدة مُصلَحة: لا نربط أبداً عبر screen أو ip وحدهما (مصدر حظر أبرياء
  --    على الشبكة المشتركة). نشترط إشارتين قويتين على الأقل.
  SELECT ds.device_id INTO linked_id
    FROM public.device_signatures ds
    JOIN (VALUES
      ('canvas'::text, p_canvas_hash),
      ('fp',           p_fp_hash),
      ('webgl',        p_webgl_hash),
      ('audio',        p_audio_hash)
    ) v(t, val) ON ds.sig_type = v.t AND ds.sig_value = v.val
   WHERE ds.device_id <> p_device_id
     AND v.val IS NOT NULL
   GROUP BY ds.device_id
  HAVING count(DISTINCT v.t) >= public.cfg_num(cfg, 'link_identity_min_strong', 2)
   ORDER BY count(DISTINCT v.t) DESC, max(ds.last_seen) DESC
   LIMIT 1;

  IF linked_id IS NOT NULL THEN
    new_id := p_device_id;

    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash, first_seen, last_seen, hits)
    SELECT linked_id, df.ip_hash, df.ua_hash, df.first_seen, df.last_seen, df.hits
      FROM public.device_fingerprints df
     WHERE df.device_id = new_id
    ON CONFLICT (device_id, ip_hash) DO UPDATE
       SET last_seen = GREATEST(public.device_fingerprints.last_seen, EXCLUDED.last_seen),
           hits     = public.device_fingerprints.hits + EXCLUDED.hits,
           ua_hash  = EXCLUDED.ua_hash;
    DELETE FROM public.device_fingerprints WHERE device_id = new_id;

    IF NOT EXISTS (SELECT 1 FROM public.device_names WHERE device_id = linked_id) THEN
      INSERT INTO public.device_names(device_id, name)
      SELECT linked_id, dn.name FROM public.device_names dn WHERE dn.device_id = new_id
      ON CONFLICT (device_id) DO NOTHING;
    END IF;

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

  -- 2) التحذير المعلّق
  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO warn
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

  my_name := public.get_device_name(p_device_id);

  -- 3) إنهاء الحظر المؤقت (تغيير حالة، لا حذف — يبقى سجل التدقيق)
  UPDATE public.blocked_devices
     SET ban_status = 'EXPIRED'
   WHERE device_id = p_device_id
     AND ban_status = 'ACTIVE'
     AND expires_at IS NOT NULL
     AND expires_at <= now();

  -- 4) الحظر المباشر بمعرّف الجهاز (أقوى إشارة: 100 ⇒ BLOCK فوري)
  SELECT * INTO b FROM public.blocked_devices
   WHERE device_id = p_device_id AND ban_status = 'ACTIVE' LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    UPDATE public.blocked_devices SET last_seen = now() WHERE device_id = p_device_id;
    out := jsonb_build_object(
      'banned', true,
      'decision', 'BLOCK',
      'score', 100,
      'strong_count', 0,
      'matched', jsonb_build_array('device_id'),
      'reason', COALESCE(b.reason, 'محظور'),
      'expires_at', b.expires_at,
      'ban_expires_at', b.ban_expires_at,
      'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END,
      'device_name', my_name,
      'device_id', p_device_id,
      'linked', linked_id IS NOT NULL
    ) || COALESCE(warn, '{}'::jsonb);
    RETURN out;
  END IF;

  -- 5) تسجيل الإشارات (hashes فقط)
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
   WHERE v.val IS NOT NULL
  ON CONFLICT (device_id, sig_type, sig_value) DO UPDATE SET last_seen = now();

  IF p_ip_hash IS NOT NULL THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;
  END IF;

  -- 6) حساب النقاط: أعلى تطابق منطقي مع profile واحد فقط
  --    (لا تُجمع نقاط من أجهزة مختلفة — هذا هو مفتاح تقليل الحجب الخاطئ)
  SELECT s.score, s.strong_count, s.matched, s.profile_device_id, s.profile_id, s.ban_id
    INTO best_score, best_strong, best_matched, best_prof_dev, best_prof, best_ban
    FROM public.ban_score_visitor(
           p_device_id, p_fp_hash, p_canvas_hash, p_webgl_hash,
           p_audio_hash, p_fonts_hash, p_screen_hash, p_ua_hash, p_ip_hash) s
   LIMIT 1;

  IF best_score IS NOT NULL AND best_score > 0 THEN
    score    := best_score;
    strong_n := best_strong;
    matched  := best_matched;
    prof_dev := best_prof_dev;
    prof_id  := best_prof;
    decision := public.ban_decide(score, strong_n);
  ELSE
    decision := 'ALLOW';
  END IF;

  -- 7) القرار
  IF decision = 'BLOCK' THEN
    reason := 'تطابق بصمة مع جهاز محظور (' || array_to_string(matched, '+') || ')';

    INSERT INTO public.blocked_devices(
      device_id, reason, ban_status, decision, confidence_score,
      matched_signals, matched_profile_device_id, match_reason, requires_review, last_seen)
    VALUES (
      p_device_id, reason, 'ACTIVE', 'AUTO_BLOCK', score,
      matched, prof_dev, reason, false, now())
    ON CONFLICT (device_id) DO UPDATE
      SET reason = EXCLUDED.reason,
          ban_status = 'ACTIVE',
          decision = EXCLUDED.decision,
          confidence_score = EXCLUDED.confidence_score,
          matched_signals = EXCLUDED.matched_signals,
          matched_profile_device_id = EXCLUDED.matched_profile_device_id,
          match_reason = EXCLUDED.match_reason,
          unbanned_at = NULL, unbanned_by = NULL,
          last_seen = now()
    RETURNING ban_id INTO b.ban_id;

    PERFORM public.ban_log_audit(
      p_device_id, b.ban_id, 'ACTIVE', 'BLOCK', score, strong_n,
      matched, prof_dev, prof_id, reason, 'auto');

    out := jsonb_build_object(
      'banned', true,
      'decision', 'BLOCK',
      'score', score,
      'strong_count', strong_n,
      'matched', to_jsonb(matched),
      'reason', reason,
      'device_name', my_name,
      'device_id', p_device_id,
      'linked', linked_id IS NOT NULL
    ) || COALESCE(warn, '{}'::jsonb);
    RETURN out;

  ELSIF decision = 'CHALLENGE' THEN
    -- ليس حظراً: تسجيل + إشعار + منع الإبلاغ + ترقية عند التكرار
    reason := 'تطابق جزئي مشبوه (' || array_to_string(matched, '+') || ')';

    INSERT INTO public.ban_challenges(
      device_id, score, strong_count, matched_signals,
      matched_profile_device_id, matched_profile_id, reason)
    VALUES (p_device_id, score, strong_n, matched, prof_dev, prof_id, reason);

    SELECT count(*)::int INTO open_ch
      FROM public.ban_challenges
     WHERE device_id = p_device_id
       AND status = 'OPEN'
       AND created_at > now() - interval '7 days';

    esc_after := public.cfg_num(cfg, 'escalate_after', 3);
    IF esc_after > 0 AND open_ch >= esc_after THEN
      -- ترقية للحظر، مع علم المراجعة اليدوية
      INSERT INTO public.blocked_devices(
        device_id, reason, ban_status, decision, confidence_score,
        matched_signals, matched_profile_device_id, match_reason, requires_review, last_seen)
      VALUES (
        p_device_id,
        'تصعيد: ' || open_ch || ' تحقق مشبوه خلال 7 أيام — ' || reason,
        'ACTIVE', 'CHALLENGE_ESCALATED', score,
        matched, prof_dev, reason, true, now())
      ON CONFLICT (device_id) DO UPDATE
        SET reason = EXCLUDED.reason,
            ban_status = 'ACTIVE',
            decision = EXCLUDED.decision,
            confidence_score = EXCLUDED.confidence_score,
            matched_signals = EXCLUDED.matched_signals,
            matched_profile_device_id = EXCLUDED.matched_profile_device_id,
            match_reason = EXCLUDED.match_reason,
            requires_review = true,
            unbanned_at = NULL, unbanned_by = NULL,
            last_seen = now()
      RETURNING ban_id INTO b.ban_id;

      UPDATE public.ban_challenges
         SET status = 'ESCALATED', resolved_at = now()
       WHERE device_id = p_device_id AND status = 'OPEN';

      PERFORM public.ban_log_audit(
        p_device_id, b.ban_id, 'ACTIVE', 'BLOCK', score, strong_n,
        matched, prof_dev, prof_id,
        'تصعيد بعد ' || open_ch || ' تحقق', 'escalation');

      out := jsonb_build_object(
        'banned', true, 'decision', 'BLOCK', 'score', score,
        'strong_count', strong_n, 'matched', to_jsonb(matched),
        'reason', 'تصعيد تلقائي: ' || open_ch || ' تحقق مشبوه',
        'device_name', my_name, 'device_id', p_device_id,
        'linked', linked_id IS NOT NULL
      ) || COALESCE(warn, '{}'::jsonb);
      RETURN out;
    END IF;

    PERFORM public.ban_log_audit(
      p_device_id, NULL, 'ACTIVE', 'CHALLENGE', score, strong_n,
      matched, prof_dev, prof_id, reason, 'system');

    out := jsonb_build_object(
      'banned', false,
      'decision', 'CHALLENGE',
      'score', score,
      'strong_count', strong_n,
      'matched', to_jsonb(matched),
      'challenge', jsonb_build_object(
        'reason', reason,
        'open_count', open_ch,
        'restrict_reporting', true
      ),
      'device_name', my_name,
      'device_id', p_device_id,
      'linked', linked_id IS NOT NULL
    ) || COALESCE(warn, '{}'::jsonb);
    RETURN out;
  END IF;

  -- 8) ALLOW
  RETURN jsonb_build_object(
    'banned', false, 'decision', 'ALLOW', 'score', score,
    'strong_count', strong_n, 'matched', to_jsonb(matched),
    'device_name', my_name, 'device_id', p_device_id,
    'linked', linked_id IS NOT NULL
  ) || COALESCE(warn, '{}'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- ============================================================================
-- 13) الإبلاغ: المحظور والمتحقق منه لا يبلّغان
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_report(
  p_reporter_device_id text, p_content_type text, p_content_id uuid,
  p_reason_code text, p_reason_text text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_did text;
  snap text;
BEGIN
  IF p_reporter_device_id IS NULL OR length(p_reporter_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_content_type NOT IN ('post','comment','chat_post','chat_comment') THEN
    RAISE EXCEPTION 'invalid content type';
  END IF;
  IF p_reason_code IS NULL OR length(btrim(p_reason_code)) = 0 THEN
    RAISE EXCEPTION 'reason required';
  END IF;
  IF p_reason_text IS NOT NULL AND length(p_reason_text) > 500 THEN
    RAISE EXCEPTION 'reason too long';
  END IF;

  UPDATE public.blocked_devices SET ban_status = 'EXPIRED'
   WHERE device_id = p_reporter_device_id
     AND ban_status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= now();

  IF public.device_is_blocked(p_reporter_device_id) THEN
    RAISE EXCEPTION 'banned';
  END IF;
  IF public.device_has_open_challenge(p_reporter_device_id) THEN
    RAISE EXCEPTION 'challenge';
  END IF;

  IF p_content_type = 'post' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.posts         WHERE id = p_content_id;
  ELSIF p_content_type = 'comment' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.comments      WHERE id = p_content_id;
  ELSIF p_content_type = 'chat_post' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.chat_posts    WHERE id = p_content_id;
  ELSIF p_content_type = 'chat_comment' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.chat_comments WHERE id = p_content_id;
  END IF;

  IF owner_did IS NULL THEN
    RAISE EXCEPTION 'content not found';
  END IF;

  INSERT INTO public.reports(
    reporter_device_id, content_type, content_id,
    content_owner_device_id, content_snapshot, reason_code, reason_text)
  VALUES (
    p_reporter_device_id, p_content_type, p_content_id,
    owner_did, snap, p_reason_code, NULLIF(btrim(p_reason_text),''))
  ON CONFLICT (reporter_device_id, content_type, content_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_report(text,text,uuid,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_report(text,text,uuid,text,text) TO anon, authenticated;


-- ============================================================================
-- 14) الحظر اليدوي: يسجّل ban_id + قرار MANUAL + سجل تدقيق
-- ============================================================================
--  لازم نحذف النسخة القديمة أولاً: نفس التوقيع لكن نوع إرجاع مختلف، وPostgres
--  ما يسمح بـ CREATE OR REPLACE أن يغيّر نوع الإرجاع (خطأ 42P13).
--  النسخة القديمة (20260704020026) ترجع void، وهذه ترجع jsonb.
DROP FUNCTION IF EXISTS public.admin_ban_device(text,text,text,timestamptz,boolean);

CREATE OR REPLACE FUNCTION public.admin_ban_device(
  p_device_id text, p_reason text, p_evidence_url text,
  p_expires_at timestamptz, p_evidence_visible boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_ban_id   uuid;
  v_user_id  uuid;
  v_matched  text[];
  v_score    int;
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason required';
  END IF;
  IF p_evidence_url IS NOT NULL AND length(p_evidence_url) > 0
     AND p_evidence_url !~ '^https?://[a-zA-Z0-9.-]+/storage/v1/object/public/attachments/' THEN
    RAISE EXCEPTION 'invalid evidence url';
  END IF;

  UPDATE public.blocked_devices SET ban_status = 'EXPIRED'
   WHERE device_id = p_device_id
     AND ban_status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= now();

  SELECT ban_id, matched_signals, confidence_score, user_id
    INTO v_ban_id, v_matched, v_score, v_user_id
    FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;

  INSERT INTO public.blocked_devices(
    device_id, reason, expires_at, evidence_url, evidence_visible, banned_by,
    user_id, ban_status, decision, confidence_score, matched_signals, match_reason,
    requires_review, last_seen, unbanned_at, unbanned_by)
  VALUES (
    p_device_id, btrim(p_reason), p_expires_at,
    NULLIF(p_evidence_url,''), COALESCE(p_evidence_visible, true), v_user,
    v_user_id, 'ACTIVE', 'MANUAL', COALESCE(v_score, 100),
    COALESCE(v_matched, ARRAY['device_id']::text[]),
    'حظر يدوي من الإدارة', false, now(), NULL, NULL)
  ON CONFLICT (device_id) DO UPDATE
    SET reason           = EXCLUDED.reason,
        expires_at       = EXCLUDED.expires_at,
        evidence_url     = EXCLUDED.evidence_url,
        evidence_visible = EXCLUDED.evidence_visible,
        banned_by        = EXCLUDED.banned_by,
        ban_status       = 'ACTIVE',
        decision         = 'MANUAL',
        confidence_score = EXCLUDED.confidence_score,
        matched_signals  = EXCLUDED.matched_signals,
        match_reason     = EXCLUDED.match_reason,
        requires_review  = false,
        unbanned_at      = NULL,
        unbanned_by      = NULL,
        last_seen        = now()
  RETURNING ban_id INTO v_ban_id;

  PERFORM public.ban_log_audit(
    p_device_id, v_ban_id, 'ACTIVE', 'BLOCK', COALESCE(v_score,100), 0,
    COALESCE(v_matched, ARRAY['device_id']::text[]), NULL, NULL,
    btrim(p_reason), 'admin:' || v_user::text);

  RETURN jsonb_build_object('ok', true, 'ban_id', v_ban_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_ban_device(text,text,text,timestamptz,boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_ban_device(text,text,text,timestamptz,boolean) TO authenticated;


-- ============================================================================
-- 15) فك الحظر: تغيير حالة (لا حذف)
--     - ban_status = UNBANNED
--     - سجل التدقيق يبقى
--     - الـ profile يُعطَّل ⇒ لا يبقى الحظر بسبب سجل قديم تم إلغاؤه
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_unban_device(p_device_id text, p_status text DEFAULT 'UNBANNED')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_ban   uuid;
  v_score int;
  v_matched text[];
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('UNBANNED','REVOKED') THEN
    p_status := 'UNBANNED';
  END IF;

  UPDATE public.blocked_devices
     SET ban_status = p_status,
         unbanned_at = now(),
         unbanned_by = v_user,
         requires_review = false
   WHERE device_id = p_device_id
  RETURNING ban_id, confidence_score, matched_signals INTO v_ban, v_score, v_matched;

  IF v_ban IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no ban record');
  END IF;

  -- تعطيل الـ profile حتى لا يبقى التطابق مفعّلاً
  UPDATE public.ban_fingerprint_profiles
     SET active = false, updated_at = now()
   WHERE ban_id = v_ban AND active;

  -- إغلاق التحديات المعلّقة
  UPDATE public.ban_challenges
     SET status = 'CLEARED', resolved_at = now(), resolved_by = v_user
   WHERE device_id = p_device_id AND status = 'OPEN';

  PERFORM public.ban_log_audit(
    p_device_id, v_ban, p_status, 'ALLOW', COALESCE(v_score,0), 0,
    COALESCE(v_matched,'{}'::text[]), NULL, NULL,
    'رفع الحظر من الإدارة', 'admin:' || v_user::text);

  RETURN jsonb_build_object('ok', true, 'ban_status', p_status);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_unban_device(text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_unban_device(text,text) TO authenticated;


-- 15.b) كسر الحظر بالرمز السري: نفس المنطق (تغيير حالة، لا حذف)
CREATE OR REPLACE FUNCTION public.bypass_ban_with_code(p_device_id text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ban uuid;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  IF p_code IS NULL OR p_code <> 'aabbdd99' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.blocked_devices
     SET ban_status = 'UNBANNED', unbanned_at = now(), requires_review = false
   WHERE device_id = p_device_id AND ban_status = 'ACTIVE'
  RETURNING ban_id INTO v_ban;

  IF v_ban IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.ban_fingerprint_profiles
     SET active = false, updated_at = now()
   WHERE ban_id = v_ban AND active;

  UPDATE public.ban_challenges
     SET status = 'CLEARED', resolved_at = now()
   WHERE device_id = p_device_id AND status = 'OPEN';

  PERFORM public.ban_log_audit(
    p_device_id, v_ban, 'UNBANNED', 'ALLOW', 0, 0, '{}'::text[],
    NULL, NULL, 'كسر الحظر برمز الاستثناء', 'bypass');

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) TO anon, authenticated;


-- ============================================================================
-- 16) تقرير البلاغات: ينشئ ban بدل INSERT مغلق
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_resolve_report(p_report_id uuid, p_action text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.reports;
  v_ban uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO r FROM public.reports WHERE id = p_report_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;

  IF p_action = 'ban_owner' THEN
    IF p_note IS NULL OR length(btrim(p_note)) = 0 THEN
      RAISE EXCEPTION 'reason required';
    END IF;
    INSERT INTO public.blocked_devices(
      device_id, reason, banned_by, ban_status, decision,
      confidence_score, matched_signals, match_reason, last_seen)
    VALUES (
      r.content_owner_device_id, btrim(p_note), auth.uid(), 'ACTIVE', 'MANUAL',
      100, ARRAY['device_id']::text[], 'حظر من تقرير', now())
    ON CONFLICT (device_id) DO UPDATE
      SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by,
          ban_status = 'ACTIVE', decision = 'MANUAL',
          confidence_score = 100, match_reason = EXCLUDED.match_reason,
          unbanned_at = NULL, unbanned_by = NULL, requires_review = false
    RETURNING ban_id INTO v_ban;

    PERFORM public.ban_log_audit(
      r.content_owner_device_id, v_ban, 'ACTIVE', 'BLOCK', 100, 0,
      ARRAY['device_id']::text[], NULL, NULL, btrim(p_note), 'report:' || p_report_id::text);

    UPDATE public.reports
       SET status='resolved', resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
  ELSIF p_action = 'content_deleted' THEN
    IF r.content_type='post' THEN DELETE FROM public.posts WHERE id = r.content_id;
    ELSIF r.content_type='comment' THEN DELETE FROM public.comments WHERE id = r.content_id;
    ELSIF r.content_type='chat_post' THEN DELETE FROM public.chat_posts WHERE id = r.content_id;
    ELSIF r.content_type='chat_comment' THEN DELETE FROM public.chat_comments WHERE id = r.content_id;
    END IF;
    UPDATE public.reports
       SET status='content_deleted', resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
    UPDATE public.reports SET status='content_deleted', resolved_at=now(), resolved_by=auth.uid()
     WHERE content_type = r.content_type AND content_id = r.content_id
       AND status='open' AND id <> p_report_id;
  ELSIF p_action IN ('dismissed','resolved') THEN
    UPDATE public.reports
       SET status=p_action, resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
  ELSE
    RAISE EXCEPTION 'invalid action';
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_report(uuid,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_resolve_report(uuid,text,text) TO authenticated;


-- ============================================================================
-- 17) الحذف الفعلي من الأدمن يبقى ممكناً وينظّف كل الأثر
--     (غير مستخدم في الرفع العادي — الرفع الآن = تغيير حالة)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_device_ban_artifacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ban_fingerprint_profiles
   WHERE device_id = OLD.device_id OR ban_id = OLD.ban_id;
  DELETE FROM public.banned_fingerprints
   WHERE origin_device_id = OLD.device_id
      OR ip_hash IN (SELECT ip_hash FROM public.device_fingerprints WHERE device_id = OLD.device_id);
  DELETE FROM public.device_fingerprints WHERE device_id = OLD.device_id;

  DELETE FROM public.banned_signatures
   WHERE origin_device_id = OLD.device_id
      OR (sig_type, sig_value) IN (SELECT sig_type, sig_value FROM public.device_signatures WHERE device_id = OLD.device_id);
  DELETE FROM public.device_signatures WHERE device_id = OLD.device_id;
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.cleanup_device_ban_artifacts() FROM PUBLIC;

DROP TRIGGER IF EXISTS blocked_devices_cleanup_fps ON public.blocked_devices;
CREATE TRIGGER blocked_devices_cleanup_fps
  AFTER DELETE ON public.blocked_devices
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_device_ban_artifacts();


-- ============================================================================
-- 18) لوحة الأدمن: ملف الجهاز + سجل الحظر (بند واحد، بدون طلبات زيادة)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_device_dossier(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'device_id', p_device_id,
    'device_name', public.get_device_name(p_device_id),
    'label', (SELECT label FROM public.device_notes WHERE device_id = p_device_id),
    'is_admin', EXISTS(SELECT 1 FROM public.admin_devices WHERE device_id = p_device_id),
    'is_blocked', public.device_is_blocked(p_device_id),
    'ban', (SELECT jsonb_build_object(
              'ban_id',       bd.ban_id,
              'status',       bd.ban_status,
              'decision',     bd.decision,
              'score',        COALESCE(bd.confidence_score, 100),
              'matched',      COALESCE(bd.matched_signals, '{}'::text[]),
              'match_reason', bd.match_reason,
              'reason',       bd.reason,
              'created_at',   bd.created_at,
              'ban_created_at', bd.ban_created_at,
              'expires_at',   bd.expires_at,
              'ban_expires_at', bd.ban_expires_at,
              'requires_review', bd.requires_review,
              'banned_by',    bd.banned_by,
              'unbanned_at',  bd.unbanned_at,
              'matched_profile_device_id', bd.matched_profile_device_id
            )
          FROM public.blocked_devices bd
         WHERE bd.device_id = p_device_id
         ORDER BY bd.created_at DESC LIMIT 1),
    'last_seen', (SELECT max(last_seen) FROM public.device_signatures WHERE device_id = p_device_id),
    'challenge', (SELECT jsonb_build_object(
                    'score',    bc.score,
                    'matched',  bc.matched_signals,
                    'reason',   bc.reason,
                    'since',    bc.created_at,
                    'open_count', (SELECT count(*)::int FROM public.ban_challenges x
                                    WHERE x.device_id = p_device_id AND x.status='OPEN')
                  )
                  FROM public.ban_challenges bc
                 WHERE bc.device_id = p_device_id AND bc.status = 'OPEN'
                 ORDER BY bc.created_at DESC LIMIT 1),
    'ban_history', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
                       FROM (SELECT decision, score, strong_count, matched_signals,
                                    matched_profile_device_id, reason, actor, created_at, ban_status
                               FROM public.ban_audit_log
                              WHERE device_id = p_device_id
                              ORDER BY created_at DESC LIMIT 20) a),
    'profile', (SELECT jsonb_build_object(
                    'fp',     left(p.fp,     12),
                    'canvas', left(p.canvas, 12),
                    'webgl',  left(p.webgl,  12),
                    'audio',  left(p.audio,  12),
                    'fonts',  left(p.fonts,  12),
                    'screen', left(p.screen, 12),
                    'ua',     left(p.ua,     12),
                    'ip',     left(p.ip,     12),
                    'active', p.active
                  )
                  FROM public.ban_fingerprint_profiles p
                 WHERE p.device_id = p_device_id AND p.active
                 LIMIT 1),
    'warning', (SELECT message FROM public.device_warnings WHERE device_id = p_device_id),
    'warning_at', (SELECT created_at FROM public.device_warnings WHERE device_id = p_device_id),
    'warning_seen', (SELECT seen_at FROM public.device_warnings WHERE device_id = p_device_id),
    'presence', (SELECT to_jsonb(dp) FROM public.device_presence dp WHERE dp.device_id = p_device_id),
    'sigs', (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', s.sig_type, 'value', left(s.sig_value, 40), 'last_seen', s.last_seen) ORDER BY s.last_seen DESC), '[]'::jsonb)
              FROM public.device_signatures s WHERE s.device_id = p_device_id),
    'post_count', (SELECT count(*) FROM public.posts WHERE device_id = p_device_id),
    'comment_count', (SELECT count(*) FROM public.comments WHERE device_id = p_device_id),
    'chat_post_count', (SELECT count(*) FROM public.chat_posts WHERE device_id = p_device_id),
    'chat_comment_count', (SELECT count(*) FROM public.chat_comments WHERE device_id = p_device_id),
    'recent_posts', (SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.created_at DESC), '[]'::jsonb)
      FROM (SELECT id, content, created_at, status FROM public.posts WHERE device_id = p_device_id ORDER BY created_at DESC LIMIT 20) p),
    'recent_comments', (SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.created_at DESC), '[]'::jsonb)
      FROM (SELECT id, post_id, content, created_at FROM public.comments WHERE device_id = p_device_id ORDER BY created_at DESC LIMIT 20) c)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_device_dossier(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_device_dossier(text) TO authenticated;


-- 18.b) قائمة الأجهزة: ban_status بدل is_blocked فقط
--  شرط مهم: التوقيع يجب أن يطابق نداء Admin.tsx تماماً
--  (p_search, p_limit, p_offset, p_sort). لو اختلف التوقيع اختار PostgREST
--  نسخة أخرى وأعادت الحقول الناقصة (ban_score/ban_status/...) فاختفت كل
--  شارات نظام النقاط من اللوحة. لذلك نوحّدها هنا على 4 وسائط ونحذف
--  نسخة 3-الوسائط حتى لا يبقى بديل يتنافس عليها.
DROP FUNCTION IF EXISTS public.admin_list_devices(text,int,int);

CREATE OR REPLACE FUNCTION public.admin_list_devices(
  p_search text DEFAULT NULL, p_limit int DEFAULT 100, p_offset int DEFAULT 0,
  p_sort   text DEFAULT 'new'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH devices AS (
    SELECT device_id FROM public.device_presence
    UNION SELECT device_id FROM public.device_names
    UNION SELECT device_id FROM public.device_aliases
    UNION SELECT device_id FROM public.posts
    UNION SELECT device_id FROM public.comments
    UNION SELECT device_id FROM public.blocked_devices
  ), rows AS (
    SELECT
      d.device_id,
      COALESCE(n.name, '')                      AS name,
      COALESCE(nt.label, '')                    AS label,
      COALESCE(al.number, 0)                     AS anon_number,
      COALESCE(sp.cnt, 0)::int                  AS post_count,
      COALESCE(sc.cnt, 0)::int                  AS comment_count,
      COALESCE(cp.cnt, 0)::int                  AS chat_count,
      pr.first_seen, pr.last_seen,
      COALESCE(pr.visits, 0)::int               AS visits,
      EXISTS (SELECT 1 FROM public.blocked_devices b
               WHERE b.device_id = d.device_id AND b.ban_status = 'ACTIVE') AS is_blocked,
      (SELECT b.ban_status FROM public.blocked_devices b WHERE b.device_id = d.device_id
        ORDER BY b.created_at DESC LIMIT 1)                                AS ban_status,
      (SELECT b.confidence_score FROM public.blocked_devices b WHERE b.device_id = d.device_id
        ORDER BY b.created_at DESC LIMIT 1)                                AS ban_score,
      (SELECT b.requires_review FROM public.blocked_devices b WHERE b.device_id = d.device_id
        ORDER BY b.created_at DESC LIMIT 1)                                AS ban_needs_review,
      EXISTS (SELECT 1 FROM public.ban_challenges c
               WHERE c.device_id = d.device_id AND c.status = 'OPEN')       AS is_challenged,
      EXISTS (SELECT 1 FROM public.admin_devices a WHERE a.device_id = d.device_id) AS is_admin,
      (SELECT w.message FROM public.device_warnings w WHERE w.device_id = d.device_id) AS warning
    FROM devices d
    LEFT JOIN public.device_names n  ON n.device_id = d.device_id
    LEFT JOIN public.device_notes nt ON nt.device_id = d.device_id
    LEFT JOIN public.device_aliases al ON al.device_id = d.device_id
    LEFT JOIN public.device_presence pr ON pr.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.posts    GROUP BY device_id) sp ON sp.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.comments GROUP BY device_id) sc ON sc.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.chat_posts GROUP BY device_id) cp ON cp.device_id = d.device_id
    WHERE p_search IS NULL OR btrim(p_search) = ''
       OR COALESCE(n.name, '') ILIKE '%' || btrim(p_search) || '%'
       OR COALESCE(nt.label, '') ILIKE '%' || btrim(p_search) || '%'
       OR d.device_id ILIKE '%' || btrim(p_search) || '%'
  ), sorted AS (
    SELECT * FROM rows
    ORDER BY
      CASE WHEN p_sort = 'old' THEN COALESCE(first_seen, 'epoch'::timestamptz) END ASC NULLS LAST,
      CASE WHEN p_sort = 'num' THEN anon_number END ASC NULLS LAST,
      last_seen DESC NULLS LAST
    LIMIT LEAST(GREATEST(p_limit,1),500) OFFSET GREATEST(p_offset,0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM rows),
    'rows',  COALESCE((SELECT jsonb_agg(to_jsonb(sorted)) FROM sorted), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_list_devices(text,int,int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_devices(text,int,int,text) TO authenticated;


-- ============================================================================
-- 19) ضبط الإعدادات من الأدمن
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_ban_scoring_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'settings', public.ban_scoring_settings(),
    'rows', (SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
               FROM public.ban_scoring_config)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.admin_ban_scoring_config() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_ban_scoring_config() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_ban_scoring_config(p_key text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_key IS NULL OR p_key NOT IN
     ('weights','strong_signals','thresholds','escalate_after','link_identity_min_strong') THEN
    RAISE EXCEPTION 'invalid key';
  END IF;
  IF p_value IS NULL THEN RAISE EXCEPTION 'invalid value'; END IF;

  INSERT INTO public.ban_scoring_config(key, value, updated_at, updated_by)
  VALUES (p_key, p_value, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by;

  RETURN jsonb_build_object('ok', true, 'settings', public.ban_scoring_settings());
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_ban_scoring_config(text,jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_ban_scoring_config(text,jsonb) TO authenticated;


-- ============================================================================
-- 20) تنظيف دوري: إنهاء الحظور المؤقتة المنتهية (تغيير حالة فقط، لا حذف)
--     استدعِه من Cron/Edge كل ساعة، أو يدوياً من SQL Editor.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ban_expire_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  WITH done AS (
    UPDATE public.blocked_devices
       SET ban_status = 'EXPIRED'
     WHERE ban_status = 'ACTIVE'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
    RETURNING device_id, ban_id, confidence_score, matched_signals
  )
  INSERT INTO public.ban_audit_log(
    device_id, ban_id, ban_status, decision, score, matched_signals, reason, actor)
  SELECT device_id, ban_id, 'EXPIRED', 'ALLOW',
         COALESCE(confidence_score,0), COALESCE(matched_signals,'{}'::text[]),
         'انتهت مدة الحظر', 'system'
    FROM done;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.ban_expire_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ban_expire_due() TO service_role;

-- ============================================================================
-- 21) تنظيف التحديات القديمة حتى لا تتراكم
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ban_challenge_gc(p_days int DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.ban_challenges
   WHERE created_at < now() - make_interval(days => GREATEST(p_days, 7));
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.ban_audit_log
   WHERE created_at < now() - interval '180 days';
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.ban_challenge_gc(int) FROM PUBLIC, anon, authenticated;
