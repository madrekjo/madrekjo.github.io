-- ============================================================================
-- SUPABASE SQL EDITOR — شغّل هذا الملف يدوياً
-- المشروع الحي: chat (hvrtzzouasqseyswjcex)
-- الرابط: https://supabase.com/dashboard/project/hvrtzzouasqseyswjcex/sql-editor
-- ============================================================================
-- الغرض: جعل رتب المالك/الأدمن صحيحة على القاعدة الحية:
--   الجراح (abdalrahmanjarrah94@gmail.com)   = مالك + أدمن   ✓ (المالك الفعلي)
--   عبودي (aaboodym16@gmail.com)             = مالك + أدمن   ✓ (يبقى كما هو)
--   معايطه (abdalrhmanmaaith24@gmail.com)    = بلا أي رتبة  ✗ (يُزال كلياً)
--
-- هذا ملف قابَل لإعادة التشغيل بأمان (idempotent) — لا يصطدم بأي قيد.
-- ============================================================================

-- 1) تعطيل حماية الرتب مؤقتاً (تمنع حذف/منح رتبة المالك)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_owner_roles') THEN
    ALTER TABLE public.user_roles DISABLE TRIGGER trg_protect_owner_roles;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_staff_roles') THEN
    ALTER TABLE public.user_roles DISABLE TRIGGER trg_protect_staff_roles;
  END IF;
END $$;

-- 2) سحب كل رتب معايطه (مالك + أدمن/مشرف + أي شيء)
DELETE FROM public.user_roles
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'abdalrhmanmaaith24@gmail.com');

-- 3) ضمان رتب الجراح: مالك + أدمن (بلا صدم قيود)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role
FROM auth.users
WHERE email = 'abdalrahmanjarrah94@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'abdalrahmanjarrah94@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 4) ضمان رتب عبودي: مالك + أدمن
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role
FROM auth.users
WHERE email = 'aaboodym16@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'aaboodym16@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 5) إعادة تفعيل الحماية
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_owner_roles') THEN
    ALTER TABLE public.user_roles ENABLE TRIGGER trg_protect_owner_roles;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_staff_roles') THEN
    ALTER TABLE public.user_roles ENABLE TRIGGER trg_protect_staff_roles;
  END IF;
END $$;

-- 6) تأكيد نهائي (يجب إظهار جراح وعبودي كمالكين فقط)
SELECT u.email, ur.role
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
ORDER BY ur.role, u.email;