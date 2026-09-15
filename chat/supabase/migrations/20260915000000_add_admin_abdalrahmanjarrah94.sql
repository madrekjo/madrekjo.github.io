-- ============================================================================
-- SUPABASE SQL EDITOR — شغّل الأمر ده
-- المشروع: chat (biabdoatwfteqwgjdxzc)
-- الرابط: https://supabase.com/dashboard/project/biabdoatwfteqwgjdxzc/sql-editor
-- ============================================================================
-- الغرض: تثبيت abdalrahmanjarrah94@gmail.com كأدمن في الشات (مثل معايطه)
-- ============================================================================

DO $$
DECLARE v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'abdalrahmanjarrah94@gmail.com';
  IF v_user_id IS NOT NULL THEN
    -- تأكيد الدور ادمن
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    RAISE NOTICE '✅ تم تثبيت abdalrahmanjarrah94@gmail.com كأدمن';
  ELSE
    RAISE NOTICE '❌ مستخدم abdalrahmanjarrah94@gmail.com موجودش في auth.users. سجل دخل أول مرة.';
  END IF;
END $$;