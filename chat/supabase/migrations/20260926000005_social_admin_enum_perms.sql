-- ============================================================================
-- ★ رتبة مسؤول السوشيال ميديا (social_admin) — شغّله أولاً بمفرده ★
-- Supabase → SQL Editor → ثم شغّل الملف التالي 20260926000006_social_tasks.sql
--
-- ملاحظة: هذا الملف يُضيف القيمة للـ enum فقط ولا يستخدمها في نفس المعاملة
-- (يقيده PostgreSQL) — لذلك يلزم ملفان مترتيبان دائماً.
--
-- social_admin = موظف مسؤول عن صفحة الانستغرام:
--   - يدخل لوحة المهام فقط (لا يرى قوائم الأدمن/المالك)
--   - المالك يكتب له المهام وينشرها
--   - يعلم (✓) على المهمة مع رابط المنشور
--   - المالك يراجع ويصدّق / يرفض
--   - بدون أي صلاحيات إدارية (كل الحقول false هنا)
-- ============================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'social_admin';

INSERT INTO public.role_permissions
  (role, can_delete_posts, can_delete_comments, can_ban_users, can_timeout,
   can_warn, can_manage_reports, can_lock_sections, can_manage_words)
VALUES
  ('social_admin', false, false, false, false, false, false, false, false)
ON CONFLICT (role) DO UPDATE SET
  can_delete_posts = false, can_delete_comments = false, can_ban_users = false,
  can_timeout = false, can_warn = false, can_manage_reports = false,
  can_lock_sections = false, can_manage_words = false, updated_at = now();

DO $$ BEGIN RAISE NOTICE '✅ تم إضافة رتبة مسؤول السوشيال ميديا (social_admin) إلى app_role'; END $$;