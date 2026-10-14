-- ============================================================================
-- قاعدة موحّدة دائمة: مالكو الدردشة = أدمن في كل الأقسام.
-- يُنفَّذ في مشروع الدردشة romocwtqzdnovfgtmwzb.
--
-- الفكرة:
--   * مصدر الحقيقة الوحيد هو public.user_roles بدور 'owner' في قاعدة الدردشة
--     (مطابقة بالإيميل من auth.users).
--   * is_platform_owner(p_email): دالة عامة تُرجِع هل البريد مالك للمنصة.
--   * كل قسم (أنا مجهول، بين السطور، أجر وثواب، التلاوات، الإنجاز) يقرأ
--     نتيجتها ويجعل صاحبها أدمن — فترقية أي شخص إلى owner في الدردشة
--     تجعله أدمن في كل الأقسام تلقائياً، مرة واحدة وبدون قوائم مكرّرة.
--
-- الأمان: الدالة تقرأ فقط حالة "هل هذا الإيميل مالك؟" ولا تكشف أي بيانات
-- حساسة. حسّاسة مثل قائمة كلمات الحظر فهي معلومة غير حساسة عمليًا.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_owner(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.role = 'owner'
      AND lower(u.email) = lower(coalesce(p_email, ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_owner(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_owner(text) TO anon, authenticated;
