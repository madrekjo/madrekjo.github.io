-- =========================================================
-- إصلاح عاجل: حظر خاطئ لناس عشوائية (بصمة/آيبي مشترك)
-- السبب: كان الحظر التلقائي يقع لو تطابقت بصمة واحدة ضعيفة
--        أو تطابق الـ IP — والـ IP مشترك بين كلdevices نفس الشبكة
--        (مدرسة/جامعة/شركة/شبكة الجوال) فتُحظر عشرات الأبرياء.
-- الحل: 1) حذف الحظور التلقائية الخاطئة  2) تطهير البصمات الضعيفة
--       3) إعادة تعريف الفحص:-ip لا يحظر، ولا تكفي بصمة واحدة.
-- =========================================================

-- 1) إزالة الحظور التي فُرضت تلقائياً بالبصمة (تبقي الحظور اليدوية)
DO $$
DECLARE removed int;
BEGIN
  DELETE FROM public.blocked_devices
   WHERE reason LIKE 'fingerprint match:%'
      OR reason LIKE '%fingerprint%';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'تم رفع % حظر تلقائي خاطئ', removed;
END $$;

-- 2) تطهير البصمات الضعيفة/المشتركة (IP + webgl + audio + fonts)
DO $$
DECLARE n1 int; n2 int;
BEGIN
  DELETE FROM public.banned_fingerprints;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  DELETE FROM public.banned_signatures
   WHERE sig_type IN ('ip', 'webgl', 'webgl2', 'audio', 'fonts');
  GET DIAGNOSTICS n2 = ROW_COUNT;
  RAISE NOTICE 'تم حذف % بصمة IP و % بصمة ضعيفة', n1, n2;
END $$;

-- 3) الفحص الجديد: لا حظر تلقائي بالـ IP إطلاقاً،
--    ويحتاج تطابق TWO على الأقل من البصمات القوية (canvas/fp/screen/ua)
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
        'device_name', my_name
      ) || COALESCE(w, '{}'::jsonb);
    END IF;
  END IF;

  -- تسجيل البصمات (للعرض فقط — لا третьر حظر)
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

  -- البصمات القوية فقط: canvas + fp + (screen مع ua)
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

  IF strong_hits >= 2 THEN
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
    RETURN jsonb_build_object('banned', true, 'reason', match_reason, 'device_name', my_name)
      || COALESCE(w, '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object('banned', false, 'device_name', my_name) || COALESCE(w, '{}'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;
