-- حماية المشرف الأعلى لقسم الإنجاز: شاهين شاه (abdalrahmanjarrah94@gmail.com)
-- 1) تثبيت الاسم
-- 2) ضمان دور admin
-- 3) منع إزالة دور admin عنه على مستوى قاعدة البيانات

DO $$
DECLARE
  v_uid uuid;
  v_email text := 'abdalrahmanjarrah94@gmail.com';
  v_name  text := 'شاهين شاه';
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE NOTICE 'المستخدم % غير موجود في auth.users - تخطي التثبيت الآن. شغّل الملف بعد تسجيل دخوله أول مرة.', v_email;
    RETURN;
  END IF;

  -- تثبيت الاسم في البروفايل
  UPDATE public.profiles
  SET display_name = v_name, updated_at = now()
  WHERE user_id = v_uid;

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

-- تثبيت اسم المشرف الأعلى (منع تغييره من أي واجهة)
CREATE OR REPLACE FUNCTION public.protect_super_admin_name()
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
  WHERE u.id = NEW.user_id;

  IF v_email = lower('abdalrahmanjarrah94@gmail.com') THEN
    NEW.display_name := 'شاهين شاه';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin_name ON public.profiles;
CREATE TRIGGER trg_protect_super_admin_name
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_super_admin_name();
