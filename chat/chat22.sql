-- ============================================================================
-- chat22.sql — إصلاح شامل لسياسة الجميع + حفظ الجلسة
-- ============================================================================
-- شغّل هذا الملف من Supabase SQL Editor

-- المشكلة: can_see_channel() ترجع false لقناة 'all' لأنها تقارن gender = 'all'
-- والسياسات القديمة من chat20.sql تمنع المستخدمين من النشر/اللايك/التعليقات على الجميع

-- 1. إصلاح دالة can_see_channel — الجميع مرئي للجميع
DROP FUNCTION IF EXISTS public.can_see_channel(text) CASCADE;
CREATE OR REPLACE FUNCTION public.can_see_channel(_channel text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- قناة 'all' أو فارغة = مشتركة، مرئية للجميع
  IF _channel IS NULL OR _channel = 'all' THEN
    RETURN true;
  END IF;

  -- الإداريون والمشرفون يرون كل القنوات
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role)
     OR public.has_role(auth.uid(), 'supervisor'::app_role) THEN
    RETURN true;
  END IF;

  -- تحقق مما إذا كان جنس المستخدم يطابق القناة
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND gender = _channel
  );
END $$;

-- 2. إصلاح سياسات POSTS — everyone can CRUD
DROP POLICY IF EXISTS "posts select by generation" ON public.posts;
DROP POLICY IF EXISTS "posts select by channel" ON public.posts;
DROP POLICY IF EXISTS "posts select all for authenticated" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.posts;

CREATE POLICY "posts select all for authenticated" ON public.posts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create posts" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3. إصلاح سياسات COMMENTS — everyone can CRUD
DROP POLICY IF EXISTS "comments select by generation" ON public.comments;
DROP POLICY IF EXISTS "comments select by channel" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;

CREATE POLICY "comments select all for authenticated" ON public.comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create comments" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. إصلاح سياسات LIKES — everyone can CRUD
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.likes;
DROP POLICY IF EXISTS "Authenticated users can like" ON public.likes;

CREATE POLICY "likes select all for authenticated" ON public.likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can like" ON public.likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 5. إصلاح سياسات COMMENT_LIKES — everyone can CRUD
DROP POLICY IF EXISTS "Comment likes viewable by everyone" ON public.comment_likes;
DROP POLICY IF EXISTS "Authenticated users can like comments" ON public.comment_likes;

CREATE POLICY "comment_likes select all for authenticated" ON public.comment_likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can like comment_likes" ON public.comment_likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 6. تعبئة المنشورات القديمة التي بدون قناة
UPDATE public.posts SET channel = 'all' WHERE channel IS NULL;
