-- Warnings
CREATE TABLE public.user_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  issued_by UUID NOT NULL,
  reason TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User can view own warnings" ON public.user_warnings FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Admin can insert warnings" ON public.user_warnings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admin can delete warnings" ON public.user_warnings FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "User can ack own warning" ON public.user_warnings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add timeout_until and chat_banned to profiles
ALTER TABLE public.profiles ADD COLUMN timeout_until TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN chat_banned BOOLEAN NOT NULL DEFAULT false;

-- Reply support in chats
ALTER TABLE public.round_chat ADD COLUMN reply_to UUID;
ALTER TABLE public.round_meeting_messages ADD COLUMN reply_to UUID;
ALTER TABLE public.changes_messages ADD COLUMN reply_to UUID;
ALTER TABLE public.staff_chat ADD COLUMN reply_to UUID;

-- Round completions (self assessment)
CREATE TABLE public.round_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL,
  user_id UUID NOT NULL,
  achievement TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, user_id)
);
ALTER TABLE public.round_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Completions viewable by all" ON public.round_completions FOR SELECT USING (true);
CREATE POLICY "User can insert own completion" ON public.round_completions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Update round counts function to count from completions instead
CREATE OR REPLACE FUNCTION public.get_round_counts(_user_ids uuid[])
RETURNS TABLE(user_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT user_id, COUNT(*)::bigint
  FROM public.round_completions
  WHERE user_id = ANY(_user_ids)
  GROUP BY user_id;
$$;