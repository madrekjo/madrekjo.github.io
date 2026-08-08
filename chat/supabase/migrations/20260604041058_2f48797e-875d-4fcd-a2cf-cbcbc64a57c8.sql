
-- 1) Attach moderation guard triggers (functions exist but were never bound)
DROP TRIGGER IF EXISTS trg_guard_profile_moderation ON public.profiles;
CREATE TRIGGER trg_guard_profile_moderation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_moderation_columns();

DROP TRIGGER IF EXISTS trg_guard_warning_columns ON public.user_warnings;
CREATE TRIGGER trg_guard_warning_columns
  BEFORE UPDATE ON public.user_warnings
  FOR EACH ROW EXECUTE FUNCTION public.guard_warning_columns();

DROP TRIGGER IF EXISTS trg_protect_original_admin ON public.user_roles;
CREATE TRIGGER trg_protect_original_admin
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_original_admin();

-- 2) Fix mutable search_path
CREATE OR REPLACE FUNCTION public.join_round(p_round_id uuid, p_user_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  if exists (select 1 from round_participants where round_id = p_round_id and user_id = p_user_id) then
    return 'already_joined';
  end if;
  insert into round_participants (round_id, user_id, joined_at) values (p_round_id, p_user_id, now());
  return 'joined';
exception when others then return 'error';
end;
$$;

-- 3) Post-media storage: drop overly-permissive policy, keep folder-scoped one
DROP POLICY IF EXISTS "Users can upload post media" ON storage.objects;
-- Ensure folder-scoped policy exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='post media upload own folder') THEN
    CREATE POLICY "post media upload own folder" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'post-media' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- 4) Round-meetings storage: replace broad read policy with membership check
DROP POLICY IF EXISTS "Authenticated can read meeting images" ON storage.objects;
CREATE POLICY "Meeting members can read meeting images" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'round-meetings'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.round_meetings rm
        WHERE rm.id::text = (storage.foldername(name))[1]
          AND public.is_meeting_member(rm.id, auth.uid())
      )
    )
  );

-- 5) Banned devices: restrict public read to device_id only via column-aware policy
DROP POLICY IF EXISTS "Anyone can check device bans" ON public.banned_devices;
CREATE POLICY "Authenticated can view full ban info" ON public.banned_devices
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

-- Provide an unauth-friendly check function for device gate
CREATE OR REPLACE FUNCTION public.is_device_banned(_device_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.banned_devices WHERE device_id = _device_id);
$$;
REVOKE ALL ON FUNCTION public.is_device_banned(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_device_banned(text) TO anon, authenticated;

-- 6) Support messages: tighten insert to prevent staff spoofing user_id arbitrarily
DROP POLICY IF EXISTS "Users can send support messages" ON public.support_messages;
CREATE POLICY "Users can send support messages" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      -- regular user writes only to their own thread
      (user_id = auth.uid())
      -- staff replies must target an existing user thread (a user must have written first)
      OR (
        (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role))
        AND EXISTS (SELECT 1 FROM public.support_messages sm WHERE sm.user_id = support_messages.user_id)
      )
    )
  );

-- 7) Realtime: lock down channel subscriptions
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can subscribe to allowed topics" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to allowed topics" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    -- public broadcast topics (chat, rounds list, changes, suggestions) anyone signed-in can join
    (realtime.topic() IN ('chat','rounds','changes','suggestions','schedules','notifications'))
    -- support thread: only the thread owner or staff
    OR (realtime.topic() LIKE 'support:%' AND (
          split_part(realtime.topic(),':',2) = auth.uid()::text
          OR public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'moderator'::app_role)
       ))
    -- per-user notifications topic
    OR (realtime.topic() LIKE 'user:%' AND split_part(realtime.topic(),':',2) = auth.uid()::text)
    -- round chat: members only
    OR (realtime.topic() LIKE 'round:%' AND public.is_round_member(
          NULLIF(split_part(realtime.topic(),':',2),'')::uuid, auth.uid()))
    -- meeting chat: members only
    OR (realtime.topic() LIKE 'meeting:%' AND public.is_meeting_member(
          NULLIF(split_part(realtime.topic(),':',2),'')::uuid, auth.uid()))
    -- staff chat
    OR (realtime.topic() = 'staff' AND (
          public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)))
  );
