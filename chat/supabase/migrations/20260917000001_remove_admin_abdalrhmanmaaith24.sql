-- ============================================================================
-- SUPABASE SQL EDITOR — شغّل هذا الملف يدوياً
-- المشروع: chat (biabdoatwfteqwgjdxzc)
-- الرابط: https://supabase.com/dashboard/project/biabdoatwfteqwgjdxzc/sql-editor
-- ============================================================================
-- الغرض: إزالة عبدالرحمن معايطه (abdalrhmanmaaith24@gmail.com) من رتب الأدمن
-- والمشرف، وإزالة بريده من قائمة "المؤسسين المحميين" حتى لا يُحجب مجدداً.
--
-- ملاحظة: trigger الحماية (protect_staff_roles) يمنع سحب صلاحيات المؤسسين،
-- لذلك نعطله مؤقتاً أثناء الحذف، ثم نحدّث قائمة الحماية (نزيل بريده)،
-- وأخيراً نعيد تفعيل الحماية.
-- ============================================================================

-- 1) إزالة رتب الأدمن/المشرف (مع تعطيل الحماية مؤقتاً)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_staff_roles') THEN
    ALTER TABLE public.user_roles DISABLE TRIGGER trg_protect_staff_roles;
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DELETE FROM public.user_roles
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'abdalrhmanmaaith24@gmail.com')
  AND role IN ('admin'::public.app_role, 'moderator'::public.app_role);

-- 2) تحديث دالة حماية المؤسسين: إزالة بريده من القائمة (ليُسمح مستقبلاً بسحب صلاحياته)
CREATE OR REPLACE FUNCTION public.protect_staff_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = OLD.user_id;

  -- حماية أي رتبة تخص حساب المالك (تشمل admin/moderator/...)
  IF public.has_role(OLD.user_id, 'owner'::app_role) THEN
    RAISE EXCEPTION 'لا يمكن سحب أي صلاحية من حسابات المالك';
  END IF;

  -- حماية الأدمن/المشرف على حسابات المؤسسين بالبريد
  IF v_email IN ('abdalrahmanjarrah94@gmail.com', 'madrekjo@gmail.com', 'aaboodym16@gmail.com')
     AND OLD.role IN ('admin'::app_role, 'moderator'::app_role) THEN
    RAISE EXCEPTION 'لا يمكن سحب صلاحيات المؤسسين';
  END IF;

  RETURN OLD;
END $$;

-- 3) إعادة تفعيل الحماية
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_staff_roles') THEN
    ALTER TABLE public.user_roles ENABLE TRIGGER trg_protect_staff_roles;
  END IF;
END $$;

-- 4) تأكيد: رتب المستخدم المتبقية (إن وجدت)
SELECT u.email, ur.role
FROM public.user_roles ur
LEFT JOIN auth.users u ON u.id = ur.user_id
WHERE ur.user_id IN (SELECT id FROM auth.users WHERE email = 'abdalrhmanmaaith24@gmail.com')
ORDER BY ur.role;