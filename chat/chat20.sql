-- ============================================================================
-- chat20.sql — Gender-based channel separation for chat
-- ============================================================================
-- هذا الملف يحتوي فقط على الإضافات المطلوبة لفصل القنوات بالجنس.
--
-- ضمانات الأمان:
-- - لا يتم تعديل أي بيانات موجودة
-- - لا يتم حذف أي جداول
-- - لا يتم تعديل أي migrations قديمة
-- - كل التغييرات إضافية فقط (أعمدة جديدة، سياسات، دوال)
-- - يستخدم IF NOT EXISTS / DROP IF EXISTS لمنع الفشل عند إعادة التشغيل
--
-- ما يضيفه هذا الملف:
-- 1. عمود `gender` في جدول `profiles`
-- 2. عمود `channel` في جدول `posts`
-- 3. دالة `can_see_channel()` للتحقق من RLS
-- 4. تحديث سياسات RLS للـ posts, comments, likes, comment_likes, post_reports
-- 5. Trigger لملء قناة المنشور تلقائياً من جنس الكاتب
-- 6. Trigger لمنع تغيير الجنس (عدا للمشرفين)
-- 7. فهارس أداء
--
-- ملاحظات:
-- - المنشورات القديمة لها channel = NULL ( مشتركة / مرئية للجميع )
-- - Realtime يُصفّى تلقائياً عبر RLS
-- - الواجهة الأمامية تتولى اختيار الجنس وعرض القناة
-- ============================================================================


-- ============================================================================
-- 1. إضافة عمود `gender` إلى جدول profiles
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_gender_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_gender_check
      CHECK (gender IS NULL OR gender IN ('male', 'female'));
  END IF;
END $$;


-- ============================================================================
-- 2. إضافة عمود `channel` إلى جدول posts
-- ============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS channel text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_channel_check'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_channel_check
      CHECK (channel IS NULL OR channel IN ('male', 'female'));
  END IF;
END $$;


-- ============================================================================
-- 3. فهارس أداء
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_posts_channel
  ON public.posts(channel) WHERE channel IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_gender
  ON public.profiles(gender) WHERE gender IS NOT NULL;


-- ============================================================================
-- 4. دالة can_see_channel — للتحقق من رؤية القناة
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_see_channel(_channel text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_gender text;
BEGIN
  -- قناة فارغة = مشتركة، مرئية للجميع
  IF _channel IS NULL THEN
    RETURN true;
  END IF;

  -- الإداريون والمشرفون يرون كل القنوات
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role)
     OR public.has_role(auth.uid(), 'supervisor'::app_role) THEN
    RETURN true;
  END IF;

  -- تحقق مما إذا كان جنس المستخدم يطابق القناة
  SELECT gender INTO my_gender
  FROM public.profiles
  WHERE user_id = auth.uid();

  RETURN my_gender IS NOT NULL AND my_gender = _channel;
END $$;


-- ============================================================================
-- 5. تحديث سياسات RLS للـ posts
-- ============================================================================

-- SELECT: إضافة فلترة القناة
DROP POLICY IF EXISTS "posts select by generation" ON public.posts;
CREATE POLICY "posts select by generation" ON public.posts
  FOR SELECT TO authenticated
  USING (
    public.can_see_generation(generation)
    AND public.can_see_channel(channel)
  );

-- INSERT: إضافة فحص القناة (طبقة حماية إضافية بجانب الـ Trigger)
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.posts;
CREATE POLICY "Authenticated users can create posts" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      channel IS NULL
      OR channel = (SELECT gender FROM public.profiles WHERE user_id = auth.uid())
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'moderator'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  );


-- ============================================================================
-- 6. تحديث سياسات RLS للـ comments
-- ============================================================================

-- SELECT: تحقق من قناة المنشور الأصل
DROP POLICY IF EXISTS "comments select by generation" ON public.comments;
CREATE POLICY "comments select by generation" ON public.comments
  FOR SELECT TO authenticated
  USING (
    public.can_see_generation(generation)
    AND public.can_see_channel(
      (SELECT p.channel FROM public.posts p WHERE p.id = comments.post_id)
    )
  );

-- INSERT: تحقق من قناة المنشور الأصل
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;
CREATE POLICY "Authenticated users can create comments" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_see_channel(
      (SELECT p.channel FROM public.posts p WHERE p.id = post_id)
    )
  );


-- ============================================================================
-- 7. تحديث سياسات RLS للـ likes
-- ============================================================================

-- SELECT: تحقق من قناة المنشور
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.likes;
CREATE POLICY "Likes are viewable by everyone" ON public.likes
  FOR SELECT TO authenticated
  USING (
    public.can_see_channel(
      (SELECT p.channel FROM public.posts p WHERE p.id = post_id)
    )
  );

-- INSERT: تحقق من قناة المنشور
DROP POLICY IF EXISTS "Authenticated users can like" ON public.likes;
CREATE POLICY "Authenticated users can like" ON public.likes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_see_channel(
      (SELECT p.channel FROM public.posts p WHERE p.id = post_id)
    )
  );


-- ============================================================================
-- 8. تحديث سياسات RLS للـ comment_likes
-- ============================================================================

-- SELECT: تحقق من قناة المنشور الأصل عبر التعليق
DROP POLICY IF EXISTS "Comment likes viewable by everyone" ON public.comment_likes;
CREATE POLICY "Comment likes viewable by everyone" ON public.comment_likes
  FOR SELECT USING (
    public.can_see_channel(
      (SELECT p.channel FROM public.posts p
       JOIN public.comments c ON c.post_id = p.id
       WHERE c.id = comment_likes.comment_id)
    )
  );

-- INSERT: تحقق من قناة المنشور الأصل عبر التعليق
DROP POLICY IF EXISTS "Authenticated users can like comments" ON public.comment_likes;
CREATE POLICY "Authenticated users can like comments" ON public.comment_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_see_channel(
      (SELECT p.channel FROM public.posts p
       JOIN public.comments c ON c.post_id = p.id
       WHERE c.id = comment_likes.comment_id)
    )
  );


-- ============================================================================
-- 9. تحديث سياسات RLS للـ post_reports
-- ============================================================================

-- INSERT: تحقق من قناة المنشور
DROP POLICY IF EXISTS "users insert own reports" ON public.post_reports;
CREATE POLICY "users insert own reports" ON public.post_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND public.can_see_channel(
      (SELECT p.channel FROM public.posts p WHERE p.id = post_id)
    )
  );


-- ============================================================================
-- 10. Trigger لملء قناة المنشور تلقائياً من جنس الكاتب
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_post_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author_gender text;
  is_staff boolean;
BEGIN
  is_staff := public.has_role(NEW.user_id, 'admin'::app_role)
           OR public.has_role(NEW.user_id, 'moderator'::app_role)
           OR public.has_role(NEW.user_id, 'supervisor'::app_role);

  IF is_staff THEN
    -- منشورات الموظفين تبقى كما هي (NULL = مشتركة، أو قناة محددة إذا حددوها)
    RETURN NEW;
  END IF;

  SELECT gender INTO author_gender
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  NEW.channel := author_gender;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS set_posts_channel ON public.posts;
CREATE TRIGGER set_posts_channel
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_post_channel();


-- ============================================================================
-- 11. Trigger لمنع تغيير الجنس (عدا الإداريين)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_profile_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- السماح بتعيين الجنس لأول مرة (NULL → قيمة)
  IF OLD.gender IS NULL THEN
    RETURN NEW;
  END IF;

  -- منع تغيير الجنس إلا من الإداريين
  IF NEW.gender IS DISTINCT FROM OLD.gender
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'cannot change gender';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_profile_gender ON public.profiles;
CREATE TRIGGER trg_guard_profile_gender
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_gender();


-- ============================================================================
-- انتهى الملف. لا توجد بيانات معدلة، لا جداول محذوفة، لا migrations معدّلة.
-- ============================================================================
