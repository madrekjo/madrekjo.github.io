-- ============================================================================
-- chat-backfill-users.sql — ترميم المستخدمين الحاليين بعد بناء الجداول
-- ============================================================================
-- بعد تشغيل database-schema-full.sql + chat-fix-full.sql تصبح الجداول جاهزة،
-- لكن المستخدمين المسجلين سابقاً (128) ليس عندهم ملفات تعريف (profiles)
-- لأن ترجّر الإنشاء يعمل فقط للتسجيلات الجديدة. هذا الملف:
--   1) ينشئ ملف تعريف لكل مستخدم موجود بدون ملف
--   2) يعيد صلاحية الأدمن للمدير الأصلي
-- ----------------------------------------------------------------------------

-- 1) ملفات تعريف للمستخدمين الحاليين
INSERT INTO public.profiles (user_id, full_name, avatar_url)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', 'مستخدم جديد'),
  u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id);

-- 2) إعادة صلاحية admin للمدير الأصلي (لو الجدول مستخدم بلغة الـ enum)
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE u.email = 'abdalrhmanmaaith24@gmail.com'
ON CONFLICT DO NOTHING;

-- 3) تحقق
SELECT
  (SELECT count(*) FROM public.profiles)  AS profiles_count,
  (SELECT count(*) FROM auth.users)       AS users_count,
  (SELECT count(*) FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id
     WHERE u.email = 'abdalrhmanmaaith24@gmail.com') AS admin_restored;