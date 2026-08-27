
-- 1. Extend blocked_devices
ALTER TABLE public.blocked_devices
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_url text,
  ADD COLUMN IF NOT EXISTS evidence_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS banned_by uuid;

-- 2. When a block is removed, wipe related fingerprint bans + fingerprint rows
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
  RETURN OLD;
END $$;

REVOKE EXECUTE ON FUNCTION public.cleanup_device_ban_artifacts() FROM PUBLIC;

DROP TRIGGER IF EXISTS blocked_devices_cleanup_fps ON public.blocked_devices;
CREATE TRIGGER blocked_devices_cleanup_fps
AFTER DELETE ON public.blocked_devices
FOR EACH ROW EXECUTE FUNCTION public.cleanup_device_ban_artifacts();

-- 3. Update check_visitor_banned to auto-expire temp bans and expose evidence
CREATE OR REPLACE FUNCTION public.check_visitor_banned(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.blocked_devices;
BEGIN
  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NULL THEN
    RETURN jsonb_build_object('banned', false);
  END IF;
  IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
    DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    RETURN jsonb_build_object('banned', false);
  END IF;
  RETURN jsonb_build_object(
    'banned', true,
    'reason', COALESCE(b.reason, 'محظور'),
    'expires_at', b.expires_at,
    'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END
  );
END $$;

-- 4. Update record_visitor_fingerprint similarly
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
  IF p_ip_hash IS NULL OR length(p_ip_hash) < 8 THEN
    p_ip_hash := 'unknown';
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

  RETURN jsonb_build_object('banned', false);
END $$;

-- 5. Admin ban with reason + optional evidence + optional expiry
CREATE OR REPLACE FUNCTION public.admin_ban_device(
  p_device_id text,
  p_reason text,
  p_evidence_url text,
  p_expires_at timestamptz,
  p_evidence_visible boolean
)
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
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason required';
  END IF;
  IF p_evidence_url IS NOT NULL AND length(p_evidence_url) > 0
     AND p_evidence_url !~ '^https?://[a-zA-Z0-9.-]+/storage/v1/object/public/attachments/' THEN
    RAISE EXCEPTION 'invalid evidence url';
  END IF;
  INSERT INTO public.blocked_devices(device_id, reason, expires_at, evidence_url, evidence_visible, banned_by)
  VALUES (p_device_id, btrim(p_reason), p_expires_at, NULLIF(p_evidence_url,''), COALESCE(p_evidence_visible, true), auth.uid())
  ON CONFLICT (device_id) DO UPDATE
    SET reason = EXCLUDED.reason,
        expires_at = EXCLUDED.expires_at,
        evidence_url = EXCLUDED.evidence_url,
        evidence_visible = EXCLUDED.evidence_visible,
        banned_by = EXCLUDED.banned_by;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_ban_device(text,text,text,timestamptz,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ban_device(text,text,text,timestamptz,boolean) TO authenticated;

-- 6. Admin unban helper (also usable by RLS via delete, but exposes an RPC for consistency)
CREATE OR REPLACE FUNCTION public.admin_unban_device(p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_unban_device(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unban_device(text) TO authenticated;

-- 7. Secret bypass code accessible to any visitor (device-scoped: only removes their own ban)
CREATE OR REPLACE FUNCTION public.bypass_ban_with_code(p_device_id text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  IF p_code IS NULL OR p_code <> '200920092009' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) TO anon, authenticated;

-- 8. Update admin_resolve_report ban action to require a reason and carry it into the block
CREATE OR REPLACE FUNCTION public.admin_resolve_report(p_report_id uuid, p_action text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.reports;
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
    INSERT INTO public.blocked_devices(device_id, reason, banned_by)
    VALUES (r.content_owner_device_id, btrim(p_note), auth.uid())
    ON CONFLICT (device_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by;
    UPDATE public.reports SET status='resolved', resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
  ELSIF p_action = 'content_deleted' THEN
    IF r.content_type='post' THEN DELETE FROM public.posts WHERE id = r.content_id;
    ELSIF r.content_type='comment' THEN DELETE FROM public.comments WHERE id = r.content_id;
    ELSIF r.content_type='chat_post' THEN DELETE FROM public.chat_posts WHERE id = r.content_id;
    ELSIF r.content_type='chat_comment' THEN DELETE FROM public.chat_comments WHERE id = r.content_id;
    END IF;
    UPDATE public.reports SET status='content_deleted', resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
    UPDATE public.reports SET status='content_deleted', resolved_at=now(), resolved_by=auth.uid()
     WHERE content_type = r.content_type AND content_id = r.content_id AND status='open' AND id <> p_report_id;
  ELSIF p_action IN ('dismissed','resolved') THEN
    UPDATE public.reports SET status=p_action, resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
  ELSE
    RAISE EXCEPTION 'invalid action';
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;
