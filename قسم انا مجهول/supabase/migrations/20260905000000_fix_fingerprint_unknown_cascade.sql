-- ============================================================================
-- FIX: بصمة الـ IP كانت ثابتة 'unknown' لكل الأجهزة، فكان كل بان بيبان ع كل الموقع
-- يمنع المطابقة/النسخ بصمة 'unknown' نهائيا + تنظيف أي بصمة متبقية منها
-- ============================================================================

-- 1) مسح أي بصمة 'unknown' متبقية (مصدر الانهيار)
DELETE FROM public.banned_fingerprints WHERE ip_hash = 'unknown';

-- 2) ما ننسخ أبدا بصمة 'unknown' لما بندنا جهاز (كانت بتعني "كل الأجهزة")
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
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.mirror_device_to_fingerprints() FROM PUBLIC, anon, authenticated;

-- 3) ما نطابق بصمة 'unknown' أبدا في فحص الزوار (كانت بتان كل الموقع بعده)
CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(p_device_id text, p_ip_hash text, p_ua_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.blocked_devices;
  match_reason text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

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

  -- بصمة IP حقيقية فقط (10+ خانات) بتسجل؛ أما 'unknown' فمتجاهلة
  IF p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;

    SELECT reason INTO match_reason
      FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash LIMIT 1;
    IF match_reason IS NOT NULL THEN
      INSERT INTO public.blocked_devices(device_id, reason)
      VALUES (p_device_id, 'fingerprint match: ' || match_reason)
      ON CONFLICT DO NOTHING;
      RETURN jsonb_build_object('banned', true, 'reason', match_reason);
    END IF;
  END IF;

  RETURN jsonb_build_object('banned', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text) TO anon, authenticated;