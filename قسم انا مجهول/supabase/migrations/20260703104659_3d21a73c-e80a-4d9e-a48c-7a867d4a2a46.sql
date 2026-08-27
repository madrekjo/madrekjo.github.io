
-- =========================================================
-- 1. FINGERPRINT TRACKING
-- =========================================================
CREATE TABLE IF NOT EXISTS public.device_fingerprints (
  device_id text NOT NULL,
  ip_hash   text NOT NULL,
  ua_hash   text NOT NULL DEFAULT '',
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  hits int NOT NULL DEFAULT 1,
  PRIMARY KEY (device_id, ip_hash)
);
GRANT ALL ON public.device_fingerprints TO service_role;
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read fingerprints" ON public.device_fingerprints
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS device_fingerprints_ip_idx  ON public.device_fingerprints(ip_hash);
CREATE INDEX IF NOT EXISTS device_fingerprints_dev_idx ON public.device_fingerprints(device_id);

-- =========================================================
-- 2. BANNED FINGERPRINTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.banned_fingerprints (
  ip_hash text PRIMARY KEY,
  reason  text,
  origin_device_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.banned_fingerprints TO service_role;
ALTER TABLE public.banned_fingerprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read banned fps" ON public.banned_fingerprints
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trigger: when a device is blocked, mirror all of its known fingerprints
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
  ON CONFLICT (ip_hash) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.mirror_device_to_fingerprints() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS blocked_devices_mirror_fps ON public.blocked_devices;
CREATE TRIGGER blocked_devices_mirror_fps
  AFTER INSERT ON public.blocked_devices
  FOR EACH ROW EXECUTE FUNCTION public.mirror_device_to_fingerprints();

-- =========================================================
-- 3. RECORD FINGERPRINT + AUTO-BAN NEW DEVICES ON MATCH
-- =========================================================
CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(
  p_device_id text,
  p_ip_hash   text,
  p_ua_hash   text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  banned boolean := false;
  reason_text text := null;
  match_reason text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;
  IF p_ip_hash IS NULL OR length(p_ip_hash) < 8 THEN
    p_ip_hash := 'unknown';
  END IF;

  -- Already device-banned?
  SELECT true, reason INTO banned, reason_text
    FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF banned THEN
    RETURN jsonb_build_object('banned', true, 'reason', COALESCE(reason_text,'محظور'));
  END IF;

  -- Record the fingerprint
  INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
       VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
  ON CONFLICT (device_id, ip_hash) DO UPDATE
       SET last_seen = now(),
           hits = public.device_fingerprints.hits + 1;

  -- Is the network fingerprint already banned?
  SELECT reason INTO match_reason
    FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash LIMIT 1;
  IF match_reason IS NOT NULL THEN
    -- Auto-ban this device_id too so RLS blocks it everywhere.
    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (p_device_id, 'fingerprint match: ' || match_reason)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('banned', true, 'reason', match_reason);
  END IF;

  RETURN jsonb_build_object('banned', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text) TO anon, authenticated;

-- Quick banned check (no fingerprint write)
CREATE OR REPLACE FUNCTION public.check_visitor_banned(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r text;
BEGIN
  SELECT reason INTO r FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF r IS NOT NULL THEN
    RETURN jsonb_build_object('banned', true, 'reason', COALESCE(r,'محظور'));
  END IF;
  RETURN jsonb_build_object('banned', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.check_visitor_banned(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_visitor_banned(text) TO anon, authenticated;

-- =========================================================
-- 4. REPORTS SYSTEM
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_device_id text NOT NULL,
  content_type       text NOT NULL CHECK (content_type IN ('post','comment','chat_post','chat_comment')),
  content_id         uuid NOT NULL,
  content_owner_device_id text,
  content_snapshot   text,
  reason_code        text NOT NULL,
  reason_text        text,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed','content_deleted')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  resolved_by        uuid,
  resolution_note    text,
  UNIQUE (reporter_device_id, content_type, content_id)
);
GRANT ALL ON public.reports TO service_role;
GRANT SELECT ON public.reports TO authenticated;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read reports" ON public.reports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage reports" ON public.reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_target_idx ON public.reports(content_type, content_id);

-- Submit report RPC
CREATE OR REPLACE FUNCTION public.submit_report(
  p_reporter_device_id text,
  p_content_type       text,
  p_content_id         uuid,
  p_reason_code        text,
  p_reason_text        text
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

  -- Reporter must not be banned
  IF EXISTS (SELECT 1 FROM public.blocked_devices WHERE device_id = p_reporter_device_id) THEN
    RAISE EXCEPTION 'banned';
  END IF;

  IF p_content_type = 'post' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.posts WHERE id = p_content_id;
  ELSIF p_content_type = 'comment' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.comments WHERE id = p_content_id;
  ELSIF p_content_type = 'chat_post' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.chat_posts WHERE id = p_content_id;
  ELSIF p_content_type = 'chat_comment' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.chat_comments WHERE id = p_content_id;
  END IF;

  IF owner_did IS NULL THEN
    RAISE EXCEPTION 'content not found';
  END IF;

  INSERT INTO public.reports(
    reporter_device_id, content_type, content_id,
    content_owner_device_id, content_snapshot,
    reason_code, reason_text
  ) VALUES (
    p_reporter_device_id, p_content_type, p_content_id,
    owner_did, snap,
    p_reason_code, NULLIF(btrim(p_reason_text),'')
  )
  ON CONFLICT (reporter_device_id, content_type, content_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_report(text,text,uuid,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_report(text,text,uuid,text,text) TO anon, authenticated;

-- Admin resolve report
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id uuid,
  p_action    text,       -- 'dismissed' | 'resolved' | 'content_deleted' | 'ban_owner'
  p_note      text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.reports;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO r FROM public.reports WHERE id = p_report_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;

  IF p_action = 'ban_owner' THEN
    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (r.content_owner_device_id, COALESCE(p_note,'report ban'))
    ON CONFLICT DO NOTHING;
    UPDATE public.reports
       SET status='resolved', resolved_at=now(), resolved_by=auth.uid(), resolution_note=COALESCE(p_note,'ban owner')
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
    -- mark all other open reports on same content as content_deleted
    UPDATE public.reports SET status='content_deleted', resolved_at=now(), resolved_by=auth.uid()
     WHERE content_type = r.content_type AND content_id = r.content_id AND status='open' AND id <> p_report_id;
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
