-- ============================================================================
-- Migration: حماية حقل التخصص "القانون" (law)
-- يمنع المستخدم العادي من تعيين field='law' لنفسه حتى عبر API،
-- بينما يبقى مسموحاً للمسؤول (admin) لتغيير ملفات الآخرين.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.block_field_law_for_non_admins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- القانون لا يُسند إلا من قبل الأدمن
  IF NEW.field = 'law' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'حقل القانون لا يمكن تعيينه إلا من قبل الإدارة';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_field_law_for_non_admins ON public.profiles;

CREATE TRIGGER block_field_law_for_non_admins
BEFORE INSERT OR UPDATE OF field ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.block_field_law_for_non_admins();