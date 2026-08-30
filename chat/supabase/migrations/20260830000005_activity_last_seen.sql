-- ============================================================================
-- Migration: تتبع نشاط المستخدمين (آخر ظهور) — حل "المتصلون" الموثوق
-- كان الاعتماد على حضور Realtime (WebSocket) فقط وهو كسول على الموبايل
-- (تعليق التبويب بالخلفية) ومع النسخ المخزنة القديمة. الحل: تحديث
-- profiles.last_seen_at تلقائياً عند أي تفاعل (نشر/تعليق/إعجاب).
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