-- =========================================================
-- اسم يختاره المستخدم لنفسه: يميّزه لدى الإدارة بدل كود الجهاز
-- لا يظهر لأحد غير الإدارة، والمستخدم يظل مجهولاً أمام الناس.
-- =========================================================

-- 1) جدول الأسماء (لا يُقرأ من anon إطلاقاً — الوصول عبر RPC)
CREATE TABLE IF NOT EXISTS public.device_names (
  device_id  text PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.device_names TO service_role;
ALTER TABLE public.device_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read device_names" ON public.device_names;
CREATE POLICY "admins read device_names" ON public.device_names
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS device_names_name_idx ON public.device_names (lower(name));

-- 2) المستخدم يختار/يغيّر/يحذف اسمه (مرتبط بجهازه هو، بدون حساب)
CREATE OR REPLACE FUNCTION public.set_device_name(p_device_id text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE clean text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid device');
  END IF;

  clean := btrim(regexp_replace(coalesce(p_name, ''), '[\u0000-\u001F\u007F]+', ' ', 'g'));
  clean := btrim(regexp_replace(clean, '\s{2,}', ' ', 'g'));

  IF clean = '' THEN
    DELETE FROM public.device_names WHERE device_id = p_device_id;
    RETURN jsonb_build_object('ok', true, 'name', NULL);
  END IF;

  IF char_length(clean) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too short');
  END IF;
  IF char_length(clean) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too long');
  END IF;
  IF clean ~ '(https?://|www\.|@)' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no links');
  END IF;

  INSERT INTO public.device_names(device_id, name, created_at, updated_at)
  VALUES (p_device_id, clean, now(), now())
  ON CONFLICT (device_id) DO UPDATE
    SET name = EXCLUDED.name, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'name', clean);
END $$;

REVOKE EXECUTE ON FUNCTION public.set_device_name(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_device_name(text,text) TO anon, authenticated;

-- 3) الأدمن: قائمة الأسماء مع بحث + عدد المنشورات والتعليقات
CREATE OR REPLACE FUNCTION public.admin_list_device_names(p_search text DEFAULT NULL)
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
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.updated_at DESC), '[]'::jsonb) INTO result
  FROM (
    SELECT n.device_id,
           n.name,
           n.updated_at,
           COALESCE(sp.cnt, 0)::int AS post_count,
           COALESCE(sc.cnt, 0)::int AS comment_count,
           EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = n.device_id) AS is_blocked,
           (SELECT w.message FROM public.device_warnings w WHERE w.device_id = n.device_id) AS warning
      FROM public.device_names n
      LEFT JOIN (SELECT device_id, count(*) cnt FROM public.posts GROUP BY device_id) sp ON sp.device_id = n.device_id
      LEFT JOIN (SELECT device_id, count(*) cnt FROM public.comments GROUP BY device_id) sc ON sc.device_id = n.device_id
     WHERE p_search IS NULL
        OR btrim(p_search) = ''
        OR n.name ILIKE '%' || btrim(p_search) || '%'
        OR n.device_id ILIKE '%' || btrim(p_search) || '%'
  ) x;
  RETURN result;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_device_names(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_device_names(text) TO authenticated;

-- 4) الزائر يستلم اسمه مع نتيجة الفحص
CREATE OR REPLACE FUNCTION public.get_device_name(p_device_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name FROM public.device_names WHERE device_id = p_device_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_device_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_device_name(text) TO anon, authenticated;

-- 5) record_visitor_fingerprint + اسم الجهاز
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
  my_name text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

  my_name := public.get_device_name(p_device_id);

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
        'device_name', my_name
      ) || COALESCE(w, '{}'::jsonb);
    END IF;
  END IF;

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

  ip_hit := (p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown')
        AND (EXISTS (SELECT 1 FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash)
          OR EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'ip' AND sig_value = p_ip_hash));

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
    RETURN jsonb_build_object('banned', true, 'reason', match_reason, 'device_name', my_name)
      || COALESCE(w, '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object('banned', false, 'device_name', my_name) || COALESCE(w, '{}'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;

-- 6) check_visitor_banned + اسم الجهاز
CREATE OR REPLACE FUNCTION public.check_visitor_banned(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.blocked_devices;
        w jsonb;
        my_name text;
BEGIN
  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL LIMIT 1;

  my_name := public.get_device_name(p_device_id);

  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NULL THEN
    RETURN jsonb_build_object('banned', false, 'device_name', my_name) || COALESCE(w, '{}'::jsonb);
  END IF;
  IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
    DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    RETURN jsonb_build_object('banned', false, 'device_name', my_name) || COALESCE(w, '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'banned', true,
    'reason', COALESCE(b.reason, 'محظور'),
    'expires_at', b.expires_at,
    'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END,
    'device_name', my_name
  ) || COALESCE(w, '{}'::jsonb);
END $$;

-- 7) ملف الجهاز في الأدمن يعرض الاسم المختار
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
    'device_name', public.get_device_name(p_device_id),
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
