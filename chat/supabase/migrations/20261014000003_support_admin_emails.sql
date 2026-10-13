-- ============================================================================
-- الدعم: جدول إيميلات الأدمن (تحكّم صريح بمن يدخل صندوق الدعم)
-- يُنفَّذ في مشروع الدردشة romocwtqzdnovfgtmwzb
--
-- الفكرة:
--   * support_admins: قائمة إيميلات مسموح لها برؤية/إدارة كل محادثات الدعم.
--   * support_is_admin(): دالة تُرجِع هل المستخدم الحالي ضمن القائمة.
--   * تُبنى عليها سياسات support_messages (عرض/تعديل/حذف/إرسال الرد).
--   * المستخدم العادي: يرى محادثته فقط (user_id = auth.uid()).
--   * الزائر: بلا حساب، يُخدم عبر دوال support_guest_* الآمنة.
-- آمن إعادة التشغيل.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.support_admins (
  email      text PRIMARY KEY,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_admins ENABLE ROW LEVEL SECURITY;
-- بلا سياسات: لا يقرأها أحد من الواجهة (تبقى للإدارة عبر القاعدة فقط).

INSERT INTO public.support_admins(email) VALUES
  ('aaboodym16@gmail.com'),
  ('abdalrahmanjarrah1@gmail.com'),
  ('abdalrahmanjarrah94@gmail.com'),
  ('abdalrhmanmaaith16@gmail.com'),
  ('abdalrhmanmaaith24@gmail.com'),
  ('alshrhs292@gmail.com'),
  ('madrekjo@gmail.com'),
  ('wardhashem09@gmail.com'),
  ('wardwardward.09.09@gmail.com')
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.support_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_admins
    WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
REVOKE ALL ON FUNCTION public.support_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_is_admin() TO anon, authenticated;

-- ---------- سياسات support_messages ----------
DROP POLICY IF EXISTS "Users can view own support messages" ON public.support_messages;
CREATE POLICY "Users can view own support messages" ON public.support_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.support_is_admin());

DROP POLICY IF EXISTS "Admins can update support messages" ON public.support_messages;
CREATE POLICY "Admins can update support messages" ON public.support_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.support_is_admin());

DROP POLICY IF EXISTS "Admins can delete support messages" ON public.support_messages;
CREATE POLICY "Admins can delete support messages" ON public.support_messages
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.support_is_admin());

DROP POLICY IF EXISTS "Users can send support messages" ON public.support_messages;
CREATE POLICY "Users can send support messages" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND (user_id = auth.uid() OR public.support_is_admin()));
