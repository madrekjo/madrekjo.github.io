-- ============================================================================
-- SUPABASE SQL EDITOR — شغّل هذا الملف يدوياً
-- المشروع: chat (biabdoatwfteqwgjdxzc)
-- الرابط: https://supabase.com/dashboard/project/biabdoatwfteqwgjdxzc/sql-editor
-- ============================================================================
-- الغرض: إضافة aaboodym16@gmail.com كمالك (owner) — مثل المالكين الآخرين.
--
-- ملاحظة مهمة:
--   * لو ما شغّلت من قبل ملف 20260915000002_add_owner_enum.sql —
--     شغّله أولاً لوحده (يضيف قيمة 'owner' للـ enum) ثم ارجع شغّل هذا الملف.
--   * هذا الملف يعطل trigger الحماية مؤقتاً أثناء الإدراج ثم يعيد تفعيله.
-- ============================================================================

-- إدراج رتبة المالك (مع تعطيل trigger الحماية أثناء الإدراج)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_owner_roles') THEN
    ALTER TABLE public.user_roles DISABLE TRIGGER trg_protect_owner_roles;
  END IF;
END $$;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role
FROM auth.users
WHERE email = 'aaboodym16@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_owner_roles') THEN
    ALTER TABLE public.user_roles ENABLE TRIGGER trg_protect_owner_roles;
  END IF;
END $$;

-- تأكيد
SELECT u.email, ur.role
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'owner'::public.app_role
ORDER BY u.email;