-- حماية المشرف الأعلى لقسم الإنجاز: abdalrahmanjarrah94@gmail.com (رتبة shahin shah)
-- 1) ضمان دور admin
-- 2) منع إزالة دور admin عنه على مستوى قاعدة البيانات
-- 3) منع حذف بروفايله

DO $$
DECLARE
  v_uid uuid;
  v_email text := 'abdalrahmanjarrah94@gmail.com';
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE NOTICE 'المستخدم % غير موجود في auth.users - تخطي التثبيت الآن. شغّل الملف بعد تسجيل دخوله أول مرة.', v_email;
    RETURN;
  END IF;

  -- ضمان دور الأدمن
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'تم تثبيت % كمسؤول أعلى (uid=%)', v_email, v_uid;
END $$;

-- دالة/ترغر يمنع حذف دور admin عن المشرف الأعلى
CREATE OR REPLACE FUNCTION public.protect_super_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = OLD.user_id;

  IF v_email = lower('abdalrahmanjarrah94@gmail.com') AND OLD.role = 'admin'::public.app_role THEN
    RAISE EXCEPTION 'لا يمكن إزالة صلاحية المسؤول عن المشرف الأعلى';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin_role ON public.user_roles;
CREATE TRIGGER trg_protect_super_admin_role
BEFORE DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.protect_super_admin_role();

-- منع حذف بروفايل المشرف الأعلى عبر SQL المباشر (إجراء احترازي)
CREATE OR REPLACE FUNCTION public.protect_super_admin_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = OLD.user_id;

  IF v_email = lower('abdalrahmanjarrah94@gmail.com') THEN
    RAISE EXCEPTION 'لا يمكن حذف حساب المشرف الأعلى';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin_profile ON public.profiles;
CREATE TRIGGER trg_protect_super_admin_profile
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_super_admin_profile();

-- ملاحظة: الرتبة المعروضة في الواجهة هي "shahin shah" (لا نفرض اسم العرض في البروفايل).
