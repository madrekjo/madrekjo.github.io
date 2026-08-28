-- ============================================================================
-- chat-fix-full.sql — تشغيل شامل واحد: chat20 + chat21 + chat22 + chat23 + chat24 + تحقق
-- ============================================================================
-- هدفه: مزامنة قاعدة بيانات (رفعت من migrations فقط) مع كل ما تتطلبه الواجهة:
--   جدول channel_settings + عمود posts.channel + ربط سياسات RLS + صور متعددة + صور الدعم
-- الأمان: كل الأوامر قابلة لإعادة التشغيل (IF EXISTS / IF NOT EXISTS / DROP IF EXISTS)
-- ============================================================================
--
-- 0. إضافة الصلاحيات المفقودة إلى enum app_role
--    (السكيما الكاملة تضيف admin/user/moderator فقط، بينما الواجهة
--     والـ chat scripts تستخدم supervisor و rounds_manager أيضاً)
-- ============================================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'rounds_manager';

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
-- ============================================================================
-- chat21.sql — قنوات + إعدادات + علامات
-- ============================================================================
-- شغّل هذا الملف من Supabase SQL Editor

-- 1. جدول إعدادات القنوات
CREATE TABLE IF NOT EXISTS public.channel_settings (
  channel TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

-- صلاحيات الجدول
ALTER TABLE public.channel_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.channel_settings TO authenticated;
GRANT SELECT ON public.channel_settings TO anon;
GRANT INSERT, UPDATE, DELETE ON public.channel_settings TO authenticated;

DROP POLICY IF EXISTS "channel settings viewable by everyone" ON public.channel_settings;
CREATE POLICY "channel settings viewable by everyone"
  ON public.channel_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "channel settings manage for admins" ON public.channel_settings;
DROP POLICY IF EXISTS "channel settings insert for admins" ON public.channel_settings;
DROP POLICY IF EXISTS "channel settings update for admins" ON public.channel_settings;
DROP POLICY IF EXISTS "channel settings delete for admins" ON public.channel_settings;

CREATE POLICY "channel settings manage for admins"
  ON public.channel_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- إدخال القنوات الافتراضية
INSERT INTO public.channel_settings (channel, enabled) VALUES
  ('all', true),
  ('male', true),
  ('female', true),
  ('09', true),
  ('10', true)
ON CONFLICT (channel) DO NOTHING;

-- 2. الأعمدة
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS channel text;

-- 3. القيود
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_gender_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_gender_check CHECK (gender IN ('male', 'female'));

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_channel_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_channel_check CHECK (channel IN ('all', 'male', 'female', '09', '10'));

-- 4. إزالة سياسة القناة القديمة (الكل يشوف كل المنشورات — الفلتر ع الواجهة)
DROP POLICY IF EXISTS "posts select by generation" ON public.posts;
DROP POLICY IF EXISTS "posts select by channel" ON public.posts;
DROP POLICY IF EXISTS "posts select all for authenticated" ON public.posts;

CREATE POLICY "posts select all for authenticated" ON public.posts FOR SELECT
  TO authenticated USING (true);

-- 5. Trigger لملء القناة تلقائياً
CREATE OR REPLACE FUNCTION public.set_posts_channel()
RETURNS trigger AS $$
BEGIN
  IF NEW.channel IS NULL THEN
    NEW.channel := 'all';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_posts_channel ON public.posts;
CREATE TRIGGER trg_set_posts_channel
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_posts_channel();

-- 6. فهارس
CREATE INDEX IF NOT EXISTS idx_posts_channel ON public.posts(channel);
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON public.profiles(gender);

-- 7. عمود الثيم لكل مستخدم
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme text DEFAULT 'light';
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
DROP POLICY IF EXISTS "comments select all for authenticated" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;

CREATE POLICY "comments select all for authenticated" ON public.comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create comments" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. إصلاح سياسات LIKES — everyone can CRUD
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.likes;
DROP POLICY IF EXISTS "Authenticated users can like" ON public.likes;
DROP POLICY IF EXISTS "likes select all for authenticated" ON public.likes;
DROP POLICY IF EXISTS "Authenticated users can like" ON public.likes;

CREATE POLICY "likes select all for authenticated" ON public.likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can like" ON public.likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 5. إصلاح سياسات COMMENT_LIKES — everyone can CRUD
DROP POLICY IF EXISTS "Comment likes viewable by everyone" ON public.comment_likes;
DROP POLICY IF EXISTS "Authenticated users can like comments" ON public.comment_likes;
DROP POLICY IF EXISTS "comment_likes select all for authenticated" ON public.comment_likes;
DROP POLICY IF EXISTS "Authenticated users can like comment_likes" ON public.comment_likes;

CREATE POLICY "comment_likes select all for authenticated" ON public.comment_likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can like comment_likes" ON public.comment_likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 6. حذف trigger chat20.sql التي تفرض قناة الجنس على المستخدمين العاديين
DROP TRIGGER IF EXISTS set_posts_channel ON public.posts;
DROP FUNCTION IF EXISTS public.set_post_channel() CASCADE;

-- 7. تحديث CHECK constraint للسماح بكل القنوات
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_channel_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_channel_check
  CHECK (channel IS NULL OR channel IN ('all', 'male', 'female', '09', '10'));

-- 8. تعبئة المنشورات القديمة التي بدون قناة
UPDATE public.posts SET channel = 'all' WHERE channel IS NULL;
-- ============================================================================
-- chat23.sql — صور متعددة + تنظيف المحذوفات بعد 3 أيام
-- ============================================================================
-- شغّل هذا الملف من Supabase SQL Editor

-- 1. عمود الصور المتعددة
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_urls text[];

-- 2. تنظيف المحذوفات: بدل يوم واحد يصير 3 أيام
CREATE OR REPLACE FUNCTION public.delete_old_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- إزالة المنشورات/التعليقات القديمة
  DELETE FROM public.notifications WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.likes WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comments WHERE created_at < now() - INTERVAL '24 hours';
  DELETE FROM public.posts WHERE created_at < now() - INTERVAL '24 hours';

  -- المحذوفات: إزالة أي شيء محذوف لأكثر من 3 أيام
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days');
  DELETE FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days';
  DELETE FROM public.notifications WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days');
  DELETE FROM public.likes WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days');
  DELETE FROM public.comments WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days');
  DELETE FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days';
END;
$function$;-- chat24.sql — Support images
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
USING (bucket_id = 'support-media' AND auth.uid()::text = (storage.foldername(name))[1]);-- ============================================================================
-- تحقق نهائي — شغّله واطلع الرسالة: "OK: الجدول والعمود جاهزان"
-- ============================================================================
DO $$
DECLARE
  v_col int;
  v_tbl int;
  v_null_posts int;
BEGIN
  SELECT count(*) INTO v_col
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'channel';

  SELECT count(*) INTO v_tbl
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'channel_settings';

  SELECT count(*) INTO v_null_posts FROM public.posts WHERE channel IS NULL;

  RAISE NOTICE 'posts.channel exists=% | channel_settings exists=% | منشورات بدون قناة=%', v_col > 0, v_tbl > 0, v_null_posts;

  IF v_col = 0 OR v_tbl = 0 THEN
    RAISE EXCEPTION 'FAILED: لم يُنشَأ posts.channel أو channel_settings';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname='app_role' AND e.enumlabel='supervisor') THEN
    RAISE EXCEPTION 'FAILED: صلاحية supervisor غير موجودة في app_role';
  END IF;

  RAISE NOTICE 'OK: الجدول والعمود والصلاحيات جاهزون';
END $$;