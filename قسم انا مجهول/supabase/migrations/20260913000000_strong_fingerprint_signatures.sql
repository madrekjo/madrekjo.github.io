-- ============================================================================
-- STRONG FINGERPRINT: بصمة متعددة الأجزاء (multi-signature)
-- ----------------------------------------------------------------
-- المشكلة: المحظور كان يفلت بمجرد مسح localStorage / وضع التصفح المتخفي /
-- جهاز_id جديد، لأن الحظر كان يعتمد على معرف وهمي + IP فقط.
-- الحل:
--  1) device_signatures : كل جهاز يخزّن كل بصماته المستقلة
--     (canvas / webgl / webgl2 / audio / fonts / screen / hw / tz / ip / ua / fp)
--  2) banned_signatures : عند حظر جهاز، تنسخ كل بصماته إلى قائمة المحظورة
--  3) عند كل زيارة: أي تطابق بصمة جهاز "قوية" واحدة (canvas/webgl/audio/fonts/fp)
--     => حظر فوري حتى لو كان جهاز_id جديد كلياً أو IP مختلف (VPN).
-- ============================================================================

-- =========================================================
-- 1. جدول بصمات الأجهزة (تسجيل كل ما يعرّف الجهاز فعلياً)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.device_signatures (
  device_id text NOT NULL,
  sig_type  text NOT NULL,
  sig_value text NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, sig_type, sig_value)
);
GRANT ALL ON public.device_signatures TO service_role;
ALTER TABLE public.device_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read device signatures" ON public.device_signatures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS device_sigs_dev_idx  ON public.device_signatures(device_id);
CREATE INDEX IF NOT EXISTS device_sigs_val_idx ON public.device_signatures(sig_type, sig_value);

-- =========================================================
-- 2. جدول البصمات المحظورة (يُبَنى تلقائياً من الأجهزة المحظورة)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.banned_signatures (
  sig_type         text NOT NULL,
  sig_value        text NOT NULL,
  reason           text,
  origin_device_id text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sig_type, sig_value)
);
GRANT ALL ON public.banned_signatures TO service_role;
ALTER TABLE public.banned_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read banned signatures" ON public.banned_signatures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS banned_sigs_origin_idx ON public.banned_signatures(origin_device_id);

-- =========================================================
-- 3. عند حظر جهاز: انسخ كل بصماته (القديمة + الجديدة) لقائمة المحظورة
-- =========================================================
CREATE OR REPLACE FUNCTION public.mirror_device_to_fingerprints()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.banned_fingerprints(ip_hash, reason, origin_device_id)
  SELECT df.ip_hash,
         COALESCE(NEW.reason, 'device ban'),
         NEW.device_id
    FROM public.device_fingerprints df
   WHERE df.device_id = NEW.device_id
     AND df.ip_hash IS DISTINCT FROM 'unknown'
  ON CONFLICT (ip_hash) DO NOTHING;

  INSERT INTO public.banned_signatures(sig_type, sig_value, reason, origin_device_id)
  SELECT ds.sig_type, ds.sig_value,
         COALESCE(NEW.reason, 'device ban'),
         NEW.device_id
    FROM public.device_signatures ds
   WHERE ds.device_id = NEW.device_id
     AND ds.sig_value IS DISTINCT FROM 'unknown'
  ON CONFLICT (sig_type, sig_value) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.mirror_device_to_fingerprints() FROM PUBLIC, anon, authenticated;

-- =========================================================
-- 4. عند فك الحظر: امسح البصمات المرتبطة بالجهاز من كل الجداول
-- =========================================================
CREATE OR REPLACE FUNCTION public.cleanup_device_ban_artifacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- =========================================================
-- 5. فحص/تسجيل الزائر بنظام البصمة القوية
-- =========================================================
CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(
  p_device_id   text,
  p_ip_hash     text,
  p_ua_hash     text,
  p_canvas_hash text DEFAULT NULL,
  p_webgl_hash  text DEFAULT NULL,
  p_audio_hash  text DEFAULT NULL,
  p_fonts_hash  text DEFAULT NULL,
  p_screen_hash text DEFAULT NULL,
  p_fp_hash     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.blocked_devices;
  match_reason text;
  strong_hits int;
  ip_hit boolean;
  pair_hit boolean;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  -- 0) هل الجهاز محظور أصلاً؟
  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
      DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    ELSE
      RETURN jsonb_build_object(
        'banned', true,
        'reason', COALESCE(b.reason, 'محظور'),
        'expires_at', b.expires_at,
        'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END
      );
    END IF;
  END IF;

  -- 1) سجّل كل البصمات الواردة (بدون بصمة 'unknown' أو القصيرة)
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

  -- 2) حافظ على الجدول القديم (للتوافق مع المطابقة السابقة وتصفح الأدمن)
  IF p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown' THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;
  END IF;

  -- 3) مطابقة البصمات المحظورة:
  --    a) أي بصمة جهاز قوية واحدة (canvas/webgl/audio/fonts/fp) متطابقة => حظر
  strong_hits := (
    SELECT count(*)::int
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('webgl',        p_webgl_hash),
        ('audio',        p_audio_hash),
        ('fonts',        p_fonts_hash),
        ('fp',           p_fp_hash)
      ) v(t, val)
      JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
     WHERE v.val IS NOT NULL AND length(v.val) >= 8
  );

  --    b) IP نفس IP محظور (السلوك التاريخي)
  ip_hit := (p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown')
        AND (EXISTS (SELECT 1 FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash)
          OR EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'ip' AND sig_value = p_ip_hash));

  --    c) أي مزيج screen+ua متطابق (يقبض على VPN + متصفح مختلف بنفس الشاشة)
  pair_hit := (p_screen_hash IS NOT NULL AND length(p_screen_hash) >= 8
               AND EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'screen' AND sig_value = p_screen_hash))
          AND (p_ua_hash IS NOT NULL AND length(p_ua_hash) >= 8
               AND EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'ua' AND sig_value = p_ua_hash));

  IF strong_hits >= 1 OR ip_hit OR pair_hit THEN
    SELECT bs.reason INTO match_reason
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('webgl',        p_webgl_hash),
        ('audio',        p_audio_hash),
        ('fonts',        p_fonts_hash),
        ('fp',           p_fp_hash)
      ) v(t, val)
      JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
     WHERE v.val IS NOT NULL AND length(v.val) >= 8
     LIMIT 1;

    IF match_reason IS NULL AND ip_hit THEN
      SELECT reason INTO match_reason FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash LIMIT 1;
    END IF;
    IF match_reason IS NULL THEN match_reason := 'fingerprint match'; END IF;

    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (p_device_id, 'fingerprint match: ' || COALESCE(match_reason, 'device ban'))
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('banned', true, 'reason', match_reason);
  END IF;

  RETURN jsonb_build_object('banned', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;

-- =========================================================
-- 6. لوحة الأدمن: عرض بصمات الجهاز داخل ملف الجهاز
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_device_dossier(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'device_id', p_device_id,
    'label', (SELECT label FROM public.device_notes WHERE device_id = p_device_id),
    'is_admin', EXISTS(SELECT 1 FROM public.admin_devices WHERE device_id = p_device_id),
    'is_blocked', EXISTS(SELECT 1 FROM public.blocked_devices WHERE device_id = p_device_id),
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