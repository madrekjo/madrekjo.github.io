-- ============================================================================
-- Migration: جدول post_mentions — دعم المنشن (@) في المنشورات والتعليقات
-- ============================================================================

-- توسيع أنواع الإشعارات لدعم mention
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'reply', 'mention'));

CREATE TABLE IF NOT EXISTS public.post_mentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  mentioned_name TEXT NOT NULL,
  channel TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT post_mentions_source_check CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL) OR
    (post_id IS NOT NULL AND comment_id IS NOT NULL) OR
    (post_id IS NULL AND comment_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS post_mentions_post_idx ON public.post_mentions(post_id);
CREATE INDEX IF NOT EXISTS post_mentions_comment_idx ON public.post_mentions(comment_id);
CREATE INDEX IF NOT EXISTS post_mentions_user_idx ON public.post_mentions(user_id);

ALTER TABLE public.post_mentions ENABLE ROW LEVEL SECURITY;

-- أي شخص يستطيع قراءة المنشنات (للمقارنة/العرض)
CREATE POLICY "Mentions are viewable by everyone"
  ON public.post_mentions FOR SELECT USING (true);

-- إنشاء المنشنات عبر التطبيق (user مصادق)
CREATE POLICY "Authenticated users can create mentions"
  ON public.post_mentions FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

-- ============================================================================
-- دالة بديلة: منع المنشن لمستخدم محظور (عبر insert trigger)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_mention_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO target_profile FROM public.profiles WHERE user_id = NEW.user_id;

  -- لا يجوز منشن محظور أو محظور شات
  IF target_profile.id IS NOT NULL AND (target_profile.is_banned OR COALESCE(target_profile.chat_banned, false)) THEN
    RAISE EXCEPTION 'cannot_mention_banned';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_mention_target_trigger ON public.post_mentions;
CREATE TRIGGER guard_mention_target_trigger
BEFORE INSERT OR UPDATE OF user_id ON public.post_mentions
FOR EACH ROW
EXECUTE FUNCTION public.guard_mention_target();