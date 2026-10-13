-- ============================================================================
-- get_users_emails — جلب إيميلات عدة مستخدمين دفعة واحدة (أدمن فقط)
-- يُنفَّذ يدويًا: Supabase Dashboard → SQL Editor لمشروع الدردشة
--          romocwtqzdnovfgtmwzb
--
-- المشكلة التي يحلّها:
--   لوحة الإدارة كانت تنادي get_user_email لكل مستخدم على حدة
--   (Promise.all على كل الـ367 بروفايل) = 367 طلب في دفعة واحدة لكل فتح/عملية.
--   هذه الدالة تُرجع كل الإيميلات بنداء واحد.
--
-- الأمان: SECURITY DEFINER + نفس شرط الأدمن الموجود في get_user_email
--   (has_role(auth.uid(),'admin')). غير الأدمن يرجع له صفر صفوف.
-- آمن إعادة التشغيل.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_users_emails(_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id AS user_id, u.email
  FROM auth.users u
  WHERE u.id = ANY(_user_ids)
    AND public.has_role(auth.uid(), 'admin'::app_role);
$$;

REVOKE ALL ON FUNCTION public.get_users_emails(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_users_emails(uuid[]) TO authenticated;
