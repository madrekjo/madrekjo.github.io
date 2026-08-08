
-- 1. Create suggestion_reply_likes table
CREATE TABLE public.suggestion_reply_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id uuid NOT NULL REFERENCES public.suggestion_replies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reply_id, user_id)
);

ALTER TABLE public.suggestion_reply_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reply likes viewable by everyone"
ON public.suggestion_reply_likes FOR SELECT TO public
USING (true);

CREATE POLICY "Authenticated users can like replies"
ON public.suggestion_reply_likes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike replies"
ON public.suggestion_reply_likes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 2. Create support_messages table for contacting admins
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Users can see their own conversations
CREATE POLICY "Users can view own support messages"
ON public.support_messages FOR SELECT TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- Users can send messages (user_id = themselves, sender_id = themselves)
CREATE POLICY "Users can send support messages"
ON public.support_messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = sender_id);

-- Admins can update (mark as read)
CREATE POLICY "Admins can update support messages"
ON public.support_messages FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role) OR auth.uid() = user_id);

-- 3. Protect original admin from role deletion via trigger
CREATE OR REPLACE FUNCTION public.protect_original_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_email text;
BEGIN
  SELECT email INTO target_email FROM auth.users WHERE id = OLD.user_id;
  IF target_email = 'abdalrhmanmaaith24@gmail.com' AND OLD.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot remove admin role from the original administrator';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER protect_original_admin_trigger
BEFORE DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.protect_original_admin();

-- Enable realtime for support_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
