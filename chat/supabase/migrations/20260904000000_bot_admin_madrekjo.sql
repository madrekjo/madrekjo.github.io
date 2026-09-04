-- ============================================================================
-- Migration: تكوين madrekjo@gmail.com كـ بوت ادمن (بلا جنس/جيل)
-- ============================================================================
-- الغرض: لما تدخل ادمن بالموقع، ما يبان انك ذكر/انثى ولا من جيل معين
-- (يبان كـ بوت). الدور ادمن يبقى مفعّل.
-- ============================================================================

DO $$
DECLARE v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'madrekjo@gmail.com';
  IF v_user_id IS NOT NULL THEN
    -- تحديث/انشاء البروفايل: اسم بوت + بلا جنس + بلا جيل
    INSERT INTO public.profiles (user_id, full_name, gender, generation, field, email, avatar_url)
    VALUES (v_user_id, 'Bot 🤖', NULL, NULL, NULL, 'madrekjo@gmail.com', NULL)
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      gender = NULL,
      generation = NULL,
      field = NULL,
      email = EXCLUDED.email,
      avatar_url = EXCLUDED.avatar_url;

    -- تأكيد الدور ادمن
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
