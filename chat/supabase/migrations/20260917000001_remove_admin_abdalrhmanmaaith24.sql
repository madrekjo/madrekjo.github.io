-- ============================================================================
-- SUPABASE SQL EDITOR — شغّل هذا الملف يدوياً
-- المشروع: chat (biabdoatwfteqwgjdxzc)
-- الرابط: https://supabase.com/dashboard/project/biabdoatwfteqwgjdxzc/sql-editor
-- ============================================================================
-- الغرض: إزالة عبدالرحمن معايطه (abdalrhmanmaaith24@gmail.com) من رتب الأدمن
-- والمشرف، وإزالة كل قواعد الحماية التي كانت تخصّه.
--
-- ملاحظة: في triggerان يمنعان السحب:
--   1) trg_protect_staff_roles      (قائمة المؤسسين بالبريد)
--   2) protect_original_admin_trigger (يحمي معايطه بالتحديد)
-- نعطّل الأول مؤقتاً، ونحذف الثاني نهائياً لأنه خاص به فقط.
-- ============================================================================

-- 1) تعطيل trigger قائمة المؤسسين مؤقتاً
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_staff_roles') THEN
    ALTER TABLE public.user_roles DISABLE TRIGGER trg_protect_staff_roles;
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 2) حذف trigger الحماية القديم الخاص بالمالك الأصلي (معايطه)
DROP TRIGGER IF EXISTS protect_original_admin_trigger ON public.user_roles;
DROP FUNCTION IF EXISTS public.protect_original_admin();

-- 3) إزالة رتب الأدمن/المشرف عنه
DELETE FROM public.user_roles
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'abdalrhmanmaaith24@gmail.com')
  AND role IN ('admin'::public.app_role, 'moderator'::public.app_role);

-- 4) تحديث دالة حماية المؤسسين: إزالة بريده من القائمة
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

-- 5) إعادة تفعيل الحماية
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_staff_roles') THEN
    ALTER TABLE public.user_roles ENABLE TRIGGER trg_protect_staff_roles;
  END IF;
END $$;

-- 6) تأكيد: الرتب المتبقية لمعايطه + المالكون الحاليون
SELECT u.email, ur.role
FROM public.user_roles ur
LEFT JOIN auth.users u ON u.id = ur.user_id
WHERE ur.user_id IN (SELECT id FROM auth.users WHERE email = 'abdalrhmanmaaith24@gmail.com')
ORDER BY ur.role;

SELECT u.email, ur.role
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'owner'::public.app_role
ORDER BY u.email;