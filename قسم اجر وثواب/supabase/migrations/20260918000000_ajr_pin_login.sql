-- ============================================================================
-- نظام تسجيل دخول الأدمن بالرقم السري (PIN)
-- شغّلها في SQL Editor لمشروع "أجر وثواب":
--   Supabase → SQL Editor → New Query → Paste → Run
--
-- شو يضيف:
--   [1] عمود pin_hash على جدول الأدمن (هاش bcrypt للرقم السري)
--   [2] جدول جلسات الأدمن (token + تاريخ انتهاء)
--   [3] دالة admin_login_with_pin(pin) — تتحقق الرقم السري وترجع token
--   [4] دالة is_admin_token(token) — تتحقق الجلسة
--   [5] دالة admin_logout(token) — تنهي الجلسة
--   [6] تحديث كلمة سر Supabase Auth للأدمن = الرقم السري (1985)
--       حتى يعمل auth.uid() في is_ajr_admin() بعد signInWithPassword
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- [1] عمود الرقم السري
ALTER TABLE public.ajr_admins
  ADD COLUMN IF NOT EXISTS pin_hash text;

-- ضبط هاش الرقم السري الافتراضي = 1985 (لو ما ضُبط من قبل)
DO $$
DECLARE
  v_hash text := '$2b$10$gRAW1JJFXeKDjiMlA7bbXuzRV5durgNvk2h683XSHi/ygFjyHFwFi';
BEGIN
  UPDATE public.ajr_admins
     SET pin_hash = v_hash
   WHERE pin_hash IS NULL;
END $$;

-- جعل كلمة سر تسجيل الدخول عبر Supabase Auth = نفس الرقم السري (1985)
-- حتى يعمل auth.uid() في is_ajr_admin() بعد تسجيل الدخول
DO $$
DECLARE
  v_enc text := '$2b$10$gRAW1JJFXeKDjiMlA7bbXuzRV5durgNvk2h683XSHi/ygFjyHFwFi';
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'admin@madrekjo.com';
  IF v_uid IS NOT NULL THEN
    UPDATE auth.users SET encrypted_password = v_enc WHERE id = v_uid;
  END IF;
END $$;

-- [2] جدول الجلسات
CREATE TABLE IF NOT EXISTS public.ajr_admin_sessions (
  token text PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES public.ajr_admins(user_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ajr_admin_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ajr_sessions_expires
  ON public.ajr_admin_sessions (expires_at);

-- لا سياسات مباشرة — كل الوصول عبر الدوال (SECURITY DEFINER).

-- تنظيف الجلسات المنتهية تلقائياً
CREATE OR REPLACE FUNCTION public.clean_expired_admin_sessions()
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  DELETE FROM public.ajr_admin_sessions WHERE expires_at < now();
  SELECT count(*) FROM public.ajr_admin_sessions;
$$;

-- [3] دالة الدخول بالرقم السري
CREATE OR REPLACE FUNCTION public.admin_login_with_pin(p_pin text)
RETURNS TABLE(success boolean, token text, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hash text;
  v_ok boolean;
  v_admin_id uuid;
  v_token text;
BEGIN
  IF p_pin IS NULL OR length(btrim(p_pin)) < 4 THEN
    RETURN QUERY SELECT false, NULL::text, 'الرقم السري يجب أن يكون 4 أرقام على الأقل'::text;
    RETURN;
  END IF;

  SELECT pin_hash, user_id INTO v_hash, v_admin_id
    FROM public.ajr_admins LIMIT 1;

  IF v_hash IS NULL OR v_admin_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'لم يُضبط حساب الأدمن بعد'::text;
    RETURN;
  END IF;

  v_ok := (crypt(btrim(p_pin), v_hash) = v_hash);
  IF NOT v_ok THEN
    RETURN QUERY SELECT false, NULL::text, 'الرقم السري غير صحيح'::text;
    RETURN;
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.ajr_admin_sessions (token, admin_id, expires_at)
  VALUES (v_token, v_admin_id, now() + interval '8 hours')
  ON CONFLICT (token) DO NOTHING;

  RETURN QUERY SELECT true, v_token, 'تم تسجيل الدخول بنجاح ✅'::text;
END $$;

-- [4] دالة التحقق من الجلسة
CREATE OR REPLACE FUNCTION public.is_admin_token(p_token text)
RETURNS TABLE(valid boolean, admin_id uuid, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN QUERY SELECT false, NULL::uuid, 'رمز الجلسة غير صالح'::text;
    RETURN;
  END IF;

  SELECT s.admin_id INTO v_row
    FROM public.ajr_admin_sessions s
   WHERE s.token = p_token AND s.expires_at > now();

  IF v_row.admin_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'الجلسة منتهية أو غير صالحة'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_row.admin_id, 'جلسة صالحة'::text;
END $$;

-- [5] إنهاء الجلسة
CREATE OR REPLACE FUNCTION public.admin_logout(p_token text)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ajr_admin_sessions WHERE token = p_token;
  RETURN QUERY SELECT true, 'تم تسجيل الخروج'::text;
END $$;

-- [6] لا تعدّل is_ajr_admin() — يبقى على auth.uid() كما هو.
-- الطريق الجديد (PIN) يستخدم is_admin_token مباشرة من الـ frontend.

-- [7] الصلاحيات
GRANT EXECUTE ON FUNCTION public.admin_login_with_pin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_logout(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clean_expired_admin_sessions() TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.ajr_admin_sessions TO authenticated;
