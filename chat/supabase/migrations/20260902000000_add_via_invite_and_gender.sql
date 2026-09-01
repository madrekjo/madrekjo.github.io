-- ============================================================================
-- إضافة: مستخدمو رمز الدعوة —
--   1) عمود via_invite في profiles لمعرفة أن المستخدم دخل برمز الدعوة
--   2) تحديث handle_new_user ليمرّر gender (من الـ metadata) وvia_invite
-- ============================================================================

-- 1) عمود التمييز: هل سُجّل المستخدم عبر رمز دعوة (6 أرقام)؟ يظهر للأدمن.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS via_invite boolean NOT NULL DEFAULT false;

-- 2) دالة إنشاء البروفايل عند إنشاء حساب جديد:
--    تقرأ gender وvia_invite من user_metadata الخاصة بإنشاء الحساب.
--    - مستخدمو Google: يمررون full_name فقط (gender فارغ → NULL)؛
--    - مستخدمو رمز الدعوة: يمررون gender (male/female) وvia_invite=true.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url, gender, via_invite)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN 'Admin Abdalrhman ✅'
      ELSE COALESCE(NEW.raw_user_meta_data->>'full_name', 'مستخدم جديد')
    END,
    NEW.raw_user_meta_data->>'avatar_url',
    NULLIF(NEW.raw_user_meta_data->>'gender', ''),
    COALESCE((NEW.raw_user_meta_data->>'via_invite')::boolean, false)
  );
  IF NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$function$;