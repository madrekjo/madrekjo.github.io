-- ============================================================================
-- إدارة القائمة المركزية global_bans من أي قسم (بتحقّق مالك/أدمن بالبريد)
-- يُنفَّذ في مشروع الدردشة romocwtqzdnovfgtmwzb (مرة واحدة).
--
-- الهدف: تتيح لوحة أدمن «أنا مجهول» (وبقية الأقسام) عرض/إضافة/إزالة الحظر
-- الموحّد نفسه، دون إمكانية قراءة الجدول مباشرة (RLS يبقى للأدمن فقط).
-- التحقّق: البريد المُمرَّر يجب أن يكون owner (user_roles='owner') أو admin.
--
-- الأمان: القائمة (برواتب المحظورين) تُرجَع فقط إذا كان البريد المُمرَّر
-- مالكاً/أدمن — نفس نموذج الثقة المستخدم في is_platform_owner.
-- ============================================================================

-- هل هذا البريد مالك/أدمن في الدردشة؟
CREATE OR REPLACE FUNCTION public._is_chat_admin_email(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_platform_owner(p_email)
      OR EXISTS (
           SELECT 1
           FROM public.user_roles ur
           JOIN auth.users u ON u.id = ur.user_id
           WHERE ur.role = 'admin'
             AND lower(u.email) = lower(coalesce(p_email, ''))
         );
$$;
REVOKE ALL ON FUNCTION public._is_chat_admin_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_chat_admin_email(text) TO anon, authenticated;

-- قائمة الحظر الموحّد
CREATE OR REPLACE FUNCTION public.list_global_bans(p_admin_email text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public._is_chat_admin_email(p_admin_email) THEN
      COALESCE((
        SELECT jsonb_agg(to_jsonb(g) ORDER BY g.banned_at DESC)
        FROM public.global_bans g
      ), '[]'::jsonb)
    ELSE '[]'::jsonb
  END;
$$;
REVOKE ALL ON FUNCTION public.list_global_bans(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_global_bans(text) TO anon, authenticated;

-- إضافة/تحديث حظر موحّد
CREATE OR REPLACE FUNCTION public.add_global_ban(
  p_admin_email text, p_email text, p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_chat_admin_email(p_admin_email) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;
  INSERT INTO public.global_bans(email, reason, banned_by)
  VALUES (
    lower(btrim(p_email)),
    NULLIF(btrim(coalesce(p_reason, '')), ''),
    (SELECT id FROM auth.users WHERE lower(email) = lower(btrim(p_admin_email)) LIMIT 1)
  )
  ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.add_global_ban(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_global_ban(text,text,text) TO anon, authenticated;

-- إزالة حظر موحّد
CREATE OR REPLACE FUNCTION public.remove_global_ban(
  p_admin_email text, p_email text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_chat_admin_email(p_admin_email) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.global_bans WHERE lower(email) = lower(btrim(p_email));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.remove_global_ban(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_global_ban(text,text) TO anon, authenticated;
