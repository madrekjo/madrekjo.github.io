-- ============================================================================
-- SUPABASE SQL EDITOR — شغّل هذا الملف يدوياً
-- المشروع: chat (biabdoatwfteqwgjdxzc)
-- الرابط: https://supabase.com/dashboard/project/biabdoatwfteqwgjdxzc/sql-editor
-- ============================================================================
-- الغرض: إزالة عبدالرحمن معايطه (abdalrhmanmaaith24@gmail.com) من رتبة المالك (owner).
--
-- ملاحظة: الحماية تمنع حذف رتبة المالك، لذلك نعطل triggerَي الحماية مؤقتاً
-- أثناء الحذف ثم نعيد تفعيلهما.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_owner_roles') THEN
    ALTER TABLE public.user_roles DISABLE TRIGGER trg_protect_owner_roles;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_staff_roles') THEN
    ALTER TABLE public.user_roles DISABLE TRIGGER trg_protect_staff_roles;
  END IF;
END $$;

DELETE FROM public.user_roles
WHERE role = 'owner'::public.app_role
  AND user_id IN (SELECT id FROM auth.users WHERE email = 'abdalrhmanmaaith24@gmail.com');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_owner_roles') THEN
    ALTER TABLE public.user_roles ENABLE TRIGGER trg_protect_owner_roles;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_staff_roles') THEN
    ALTER TABLE public.user_roles ENABLE TRIGGER trg_protect_staff_roles;
  END IF;
END $$;

-- تأكيد: قائمة المالكين الحاليين
SELECT u.email, ur.role
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'owner'::public.app_role
ORDER BY u.email;