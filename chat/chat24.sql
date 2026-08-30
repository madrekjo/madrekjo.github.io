-- chat24.sql — Support images
-- اضافة دعم ارسال الصور في رسائل الدعم

-- 1) عمود الصور في رسائل الدعم
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS image_urls text[];

-- 2) انشاء باكت (bucket) لتخزين صور الدعم اذا ما موجود
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-media', 'support-media', true)
ON CONFLICT (id) DO NOTHING;

-- 3) سياسات الوصول للملفات داخل الباكت (نفس نمط post-media)
DROP POLICY IF EXISTS "Support media is publicly accessible" ON storage.objects;
CREATE POLICY "Support media is publicly accessible"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'support-media');

DROP POLICY IF EXISTS "Users can upload support media" ON storage.objects;
CREATE POLICY "Users can upload support media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'support-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete their support media" ON storage.objects;
CREATE POLICY "Users can delete their support media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'support-media' AND auth.uid()::text = (storage.foldername(name))[1]);
-- ============================================================================
-- chat24 إضافة: توسيع قيد profiles_field_check ليشمل law (قانون)
-- يسمح للأدمن بإسناد تخصص القانون، وإن كان لا يختاره المستخدم بنفسه
-- (trigger الحماية يمنع غير الأدمن من تعيينه)
-- ============================================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_field_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_field_check
  CHECK (field IS NULL OR field IN ('medical','engineering','languages','business','law'));

-- ============================================================================
-- chat24 إضافة: دعم المنشن (@) في المنشورات والتعليقات
-- يشغَّل يدوياً (لا يسقط تلقائياً): جدول post_mentions + نوع إشعار mention
-- + trigger يمنع منشن المستخدمين المحظورين
-- ============================================================================
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
CREATE POLICY IF NOT EXISTS "Mentions are viewable by everyone"
  ON public.post_mentions FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can create mentions"
  ON public.post_mentions FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

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
