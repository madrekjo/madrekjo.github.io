-- =========================================================
-- نظام التحذير: رسالة تحذير من الإدارة تظهر للزائر
-- كشاشة حمراء كاملة + صوت إنذار + نص أبيض، بدون حظر.
-- =========================================================

-- 1) جدول التحذيرات (لا يُقرأ مباشرة من anon — الوصول عبر RPC فقط)
CREATE TABLE IF NOT EXISTS public.device_warnings (
  device_id  text PRIMARY KEY,
  message    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  seen_at    timestamptz
);

GRANT ALL ON public.device_warnings TO service_role;
ALTER TABLE public.device_warnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage warnings" ON public.device_warnings;
CREATE POLICY "admins manage warnings" ON public.device_warnings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS device_warnings_created_at_idx
  ON public.device_warnings (created_at DESC);

-- 2) الإدارة ترسل/تحدّث تحذيراً لجهاز (seen_at = NULL => يظهر من جديد)
CREATE OR REPLACE FUNCTION public.admin_warn_device(p_device_id text, p_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_message IS NULL OR length(btrim(p_message)) = 0 THEN
    RAISE EXCEPTION 'message required';
  END IF;
  INSERT INTO public.device_warnings(device_id, message, created_by, seen_at)
  VALUES (p_device_id, left(btrim(p_message), 500), auth.uid(), NULL)
  ON CONFLICT (device_id) DO UPDATE
    SET message = EXCLUDED.message,
        created_at = now(),
        created_by = EXCLUDED.created_by,
        seen_at = NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_warn_device(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_warn_device(text,text) TO authenticated;

-- 3) الإدارة تلغي التحذير
CREATE OR REPLACE FUNCTION public.admin_clear_warning(p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.device_warnings WHERE device_id = p_device_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_clear_warning(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_warning(text) TO authenticated;

-- 4) الزائر يؤكّد أنه قرأ التحذير (مرتبط بجهازه هو فقط)
CREATE OR REPLACE FUNCTION public.ack_device_warning(p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN;
  END IF;
  UPDATE public.device_warnings
     SET seen_at = now()
   WHERE device_id = p_device_id AND seen_at IS NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.ack_device_warning(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_device_warning(text) TO anon, authenticated;

-- 5) check_visitor_banned + carries the pending warning
CREATE OR REPLACE FUNCTION public.check_visitor_banned(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.blocked_devices;
        w jsonb;
BEGIN
  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NULL THEN
    RETURN jsonb_build_object('banned', false) || COALESCE(w, '{}'::jsonb);
  END IF;
  IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
    DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    RETURN jsonb_build_object('banned', false) || COALESCE(w, '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'banned', true,
    'reason', COALESCE(b.reason, 'محظور'),
    'expires_at', b.expires_at,
    'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END
  ) || COALESCE(w, '{}'::jsonb);
END $$;

-- 6) record_visitor_fingerprint + carries the pending warning
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
  w jsonb;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  -- التحذير المعلّق لهذا الجهاز (يظهر مرة واحدة حتى يؤكّدها المستخدم)
  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

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
      ) || COALESCE(w, '{}'::jsonb);
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
    RETURN jsonb_build_object('banned', true, 'reason', match_reason) || COALESCE(w, '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object('banned', false) || COALESCE(w, '{}'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;

-- 7) ملف الجهاز في الأدمن يعرض التحذير الحالي
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
