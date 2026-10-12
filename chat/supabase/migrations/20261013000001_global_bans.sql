-- الحظر الموحد (مركزي)
-- القائمة المركزية للمحظورين حظراً موحداً عبر كل أقسام المنصة.
-- الوركر (SSO) يفحصها عبر RPC قبل منح أي جلسة، فيُحرم المحظور
-- من الدخول على جميع الأقسام دفعة واحدة. تُدار من لوحة أدمن الشات.
CREATE TABLE public.global_bans (
  email text PRIMARY KEY,
  reason text,
  banned_by uuid,
  banned_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.global_bans TO service_role;
GRANT SELECT, INSERT, DELETE ON public.global_bans TO authenticated;
ALTER TABLE public.global_bans ENABLE ROW LEVEL SECURITY;

-- القراءة (قائمة المحظورين) للإدارة فقط — لا تُكشف بريدياً علناً.
CREATE POLICY "Admins can view global bans" ON public.global_bans
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can add global bans" ON public.global_bans
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can remove global bans" ON public.global_bans
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- فحص الحظر الموحد (يستخدمه الوركر عبر REST — security definer)
CREATE OR REPLACE FUNCTION public.is_global_banned(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_bans WHERE lower(email) = lower(p_email)
  );
$$;
REVOKE ALL ON FUNCTION public.is_global_banned(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_global_banned(text) TO anon, authenticated;