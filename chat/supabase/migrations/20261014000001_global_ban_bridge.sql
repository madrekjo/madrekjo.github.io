-- ============================================================================
-- جسر الحظر: حظر الدردشة العادي (profiles.is_banned) يمنع الدخول على كل المنصة
-- ----------------------------------------------------------------------------
-- القرار: «الحظر العادي فقط» هو الذي يمنع المنصة كاملة (لا حظر الشات chat_banned).
-- الطريقة: توسيع دالة is_global_banned لتعيد true أيضاً إذا كان لإيميل المستخدم
-- بروفايل في قاعدة الدردشة وحالته is_banned = true. الوركر (SSO) والدرع في
-- المتصفح يفحصان هذه الدالة نفسها، فيُطرد المحظور من كل الأقسام فوراً، ويرجع
-- مباشرة عند رفع الحظر — دون أي مزامنة يدوية.
-- يُشغَّل من Supabase SQL Editor (مرة واحدة).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_global_banned(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    -- 1) القائمة المركزية للحظر الموحد (تُدار من لوحة أدمن الشات)
    EXISTS (
      SELECT 1 FROM public.global_bans
      WHERE lower(email) = lower(p_email)
    )
    OR
    -- 2) الحظر العادي داخل الدردشة (profiles.is_banned)
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE lower(email) = lower(p_email)
        AND is_banned = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_global_banned(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_global_banned(text) TO anon, authenticated;
