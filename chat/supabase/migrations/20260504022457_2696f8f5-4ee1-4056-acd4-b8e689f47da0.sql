
-- Allow admins/mods to remove participants (kick)
CREATE POLICY "Admins or mods can kick"
ON public.round_participants
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

-- Meetings inside Rounds page (invite-only)
CREATE TABLE public.round_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.round_meetings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.round_meeting_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.round_meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);
ALTER TABLE public.round_meeting_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.round_meeting_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.round_meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.round_meeting_messages ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION public.is_meeting_member(_meeting_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.round_meetings WHERE id = _meeting_id AND owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.round_meeting_members WHERE meeting_id = _meeting_id AND user_id = _user_id
  );
$$;

-- Meetings policies
CREATE POLICY "Members can view meetings" ON public.round_meetings FOR SELECT TO authenticated
USING (public.is_meeting_member(id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can create meetings" ON public.round_meetings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner or admin can delete meetings" ON public.round_meetings FOR DELETE TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner can update meetings" ON public.round_meetings FOR UPDATE TO authenticated
USING (auth.uid() = owner_id);

-- Members policies
CREATE POLICY "Members or admin can view members" ON public.round_meeting_members FOR SELECT TO authenticated
USING (public.is_meeting_member(meeting_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner or admin can add members" ON public.round_meeting_members FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.round_meetings WHERE id = meeting_id AND owner_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
CREATE POLICY "Owner/admin/self can remove members" ON public.round_meeting_members FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.round_meetings WHERE id = meeting_id AND owner_id = auth.uid())
);

-- Messages policies
CREATE POLICY "Members can view messages" ON public.round_meeting_messages FOR SELECT TO authenticated
USING (public.is_meeting_member(meeting_id, auth.uid()));
CREATE POLICY "Members can send messages" ON public.round_meeting_messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_meeting_member(meeting_id, auth.uid()));
CREATE POLICY "Owner/admin/self can delete messages" ON public.round_meeting_messages FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.round_meetings WHERE id = meeting_id AND owner_id = auth.uid())
);

-- Storage bucket for meeting images
INSERT INTO storage.buckets (id, name, public) VALUES ('round-meetings', 'round-meetings', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload meeting images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'round-meetings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Authenticated can read meeting images" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'round-meetings');
