
-- Banned devices table (block by device fingerprint)
CREATE TABLE public.banned_devices (
  device_id text PRIMARY KEY,
  reason text,
  banned_by uuid,
  banned_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.banned_devices TO anon, authenticated;
GRANT ALL ON public.banned_devices TO service_role;
GRANT INSERT, DELETE ON public.banned_devices TO authenticated;
ALTER TABLE public.banned_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can check device bans" ON public.banned_devices FOR SELECT USING (true);
CREATE POLICY "Admins can ban devices" ON public.banned_devices FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Admins can unban devices" ON public.banned_devices FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- Track user devices so admins can ban a user's device
CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);
GRANT SELECT, INSERT, UPDATE ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Self or staff can view devices" ON public.user_devices FOR SELECT TO authenticated USING (auth.uid()=user_id OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Users can register own device" ON public.user_devices FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users can update own device" ON public.user_devices FOR UPDATE TO authenticated USING (auth.uid()=user_id);

-- Section locks (admin can close sections with message + countdown)
CREATE TABLE public.section_locks (
  section text PRIMARY KEY,
  locked boolean NOT NULL DEFAULT false,
  message text,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.section_locks TO anon, authenticated;
GRANT ALL ON public.section_locks TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.section_locks TO authenticated;
ALTER TABLE public.section_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Section locks viewable by all" ON public.section_locks FOR SELECT USING (true);
CREATE POLICY "Admins manage locks insert" ON public.section_locks FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins manage locks update" ON public.section_locks FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins manage locks delete" ON public.section_locks FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
