-- ============================================================================
-- chat26.sql — تتبع نشاط المستخدمين (آخر ظهور) لحل مشكلة "المتصلين"
-- يشغَّل يدوياً. يضيف profiling لأي تفاعل (نشر/تعليق/إعجاب) → last_seen_at
-- ============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET last_seen_at = now() WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_last_seen_posts ON public.posts;
CREATE TRIGGER touch_last_seen_posts
AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.touch_last_seen();

DROP TRIGGER IF EXISTS touch_last_seen_comments ON public.comments;
CREATE TRIGGER touch_last_seen_comments
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.touch_last_seen();

DROP TRIGGER IF EXISTS touch_last_seen_likes ON public.likes;
CREATE TRIGGER touch_last_seen_likes
AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.touch_last_seen();