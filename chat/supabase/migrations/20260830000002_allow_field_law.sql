-- ============================================================================
-- Migration: توسيع قيد profiles_field_check ليشمل law (قانون)
-- يسمح للأدمن بإسناد تخصص القانون، بينما يبقى غير قابل للاختيار الذاتي
-- (يحميه trigger: block_field_law_for_non_admins)
-- ============================================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_field_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_field_check
  CHECK (field IS NULL OR field IN ('medical','engineering','languages','business','law'));