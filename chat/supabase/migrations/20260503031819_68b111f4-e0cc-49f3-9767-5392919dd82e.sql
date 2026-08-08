-- Helper: is user participant or owner of round
CREATE OR REPLACE FUNCTION public.is_round_member(_round_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.round_participants
    WHERE round_id = _round_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.study_rounds
    WHERE id = _round_id AND user_id = _user_id
  );
$$;

CREATE TABLE IF NOT EXISTS public.round_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.study_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_round_chat_round ON public.round_chat(round_id);

ALTER TABLE public.round_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Round members can view chat" ON public.round_chat
FOR SELECT TO authenticated
USING (public.is_round_member(round_id, auth.uid()));

CREATE POLICY "Round members can send" ON public.round_chat
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_round_member(round_id, auth.uid()));

CREATE POLICY "Owner or admin/mod or self can delete" ON public.round_chat
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.round_chat;

-- Allow moderators to update posts (for soft delete)
DROP POLICY IF EXISTS "Moderators can update posts" ON public.posts;
CREATE POLICY "Moderators can update posts" ON public.posts
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role))
WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));