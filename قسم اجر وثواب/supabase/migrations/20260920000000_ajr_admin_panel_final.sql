-- ============================================================================
-- لوحة إدارة أجر وثواب — التنصيب النهائي (الرقم السري=1985)
-- هذا الملف شامل ومُعاد تشغيله (idempotent):
--   إنشاؤه or تعديله لن يفيدك إلا تشغيله كاملاً.
--   الخطوات:
--     1) افتح https://supabase.com/dashboard/project/njdvogvquzofnqqwyvyl/sql
--     2) SQL Editor → New Query
--     3) الصق هذا النص كاملاً
--     4) Run
-- بعدها تدخل بـ 1985 من زر «رمز الأدمن» وتحذف أي مساهمة/تثبيت/حظر.
-- ============================================================================

-- [0] ضمان pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- [1] عمود الرقم السري على جدول الأدمن
ALTER TABLE public.ajr_admins
  ADD COLUMN IF NOT EXISTS pin_hash text;

-- [2] جدول جلسات الأدمن
CREATE TABLE IF NOT EXISTS public.ajr_admin_sessions (
  token text PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES public.ajr_admins(user_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ajr_admin_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ajr_sessions_expires
  ON public.ajr_admin_sessions (expires_at);

-- [3] ضمان حساب الأدمن في auth.users (بأعمدة سليمة تمنع خطأ 500)
DO $$
DECLARE
  v_uid uuid;
  v_enc text := '$2a$10$gRAW1JJFXeKDjiMlA7bbXuzRV5durgNvk2h683XSHi/ygFjyHFwFi';
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'admin@madrekjo.com';

  IF v_uid IS NULL THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
      recovery_token, recovery_sent_at, email_change_token_new, email_change,
      email_change_sent_at, last_sign_in_at, raw_app_meta_data,
      updated_at, created_at, email_change_token_current, email_change_confirm_status,
      banned_until, reauthentication_token, reauthentication_sent_at,
      is_sso_user, deleted_at, is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated',
      'admin@madrekjo.com', v_enc,
      now(), NULL, '', NULL, '', NULL, '', '', NULL,
      now(),
      '{"provider":"email","providers":["email"]}',
      now(), now(), '', 0, NULL, '', NULL,
      false, NULL, false
    )
    RETURNING id INTO v_uid;
  END IF;

  -- إصلاح الأعمدة الفارغة (تمنع "Database error querying schema")
  UPDATE auth.users SET
    confirmation_token         = COALESCE(confirmation_token, ''),
    recovery_token             = COALESCE(recovery_token, ''),
    email_change               = COALESCE(email_change, ''),
    email_change_token_new     = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    phone_change               = COALESCE(phone_change, ''),
    phone_change_token         = COALESCE(phone_change_token, ''),
    reauthentication_token     = COALESCE(reauthentication_token, '')
  WHERE email = 'admin@madrekjo.com';

  -- كلمة سر الأدمن = الرقم السري 1985
  UPDATE auth.users
     SET encrypted_password = v_enc
   WHERE email = 'admin@madrekjo.com';

  -- هوية (identity) للإيميل إن لم تكن موجودة
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = v_uid AND provider = 'email'
  ) THEN
    INSERT INTO auth.identities
      (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_uid, 'admin@madrekjo.com', 'email',
      jsonb_build_object('sub', v_uid::text, 'email', 'admin@madrekjo.com',
                         'email_verified', true, 'phone_verified', false),
      now(), now(), now()
    );
  END IF;

  -- إضافة صف الأدمن في جدول الأدمن
  INSERT INTO public.ajr_admins (user_id, email, pin_hash)
  VALUES (v_uid, 'admin@madrekjo.com', '$2a$10$gRAW1JJFXeKDjiMlA7bbXuzRV5durgNvk2h683XSHi/ygFjyHFwFi')
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        pin_hash = EXCLUDED.pin_hash;
END $$;

-- [4] دوال نظام PIN (search_path يشمل extensions فيعمل crypt)

CREATE OR REPLACE FUNCTION public.clean_expired_admin_sessions()
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$
  DELETE FROM public.ajr_admin_sessions WHERE expires_at < now();
  SELECT count(*) FROM public.ajr_admin_sessions;
$$;

CREATE OR REPLACE FUNCTION public.admin_login_with_pin(p_pin text)
RETURNS TABLE(success boolean, token text, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
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

  IF crypt(btrim(p_pin), v_hash) <> v_hash THEN
    RETURN QUERY SELECT false, NULL::text, 'الرقم السري غير صحيح'::text;
    RETURN;
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.ajr_admin_sessions (token, admin_id, expires_at)
  VALUES (v_token, v_admin_id, now() + interval '8 hours')
  ON CONFLICT (token) DO NOTHING;

  RETURN QUERY SELECT true, v_token, 'تم تسجيل الدخول بنجاح ✅'::text;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin_token(p_token text)
RETURNS TABLE(valid boolean, admin_id uuid, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
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

CREATE OR REPLACE FUNCTION public.admin_logout(p_token text)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM public.ajr_admin_sessions WHERE token = p_token;
  RETURN QUERY SELECT true, 'تم تسجيل الخروج'::text;
END $$;

-- [5] الصلاحيات
GRANT EXECUTE ON FUNCTION public.admin_login_with_pin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_logout(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clean_expired_admin_sessions() TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.ajr_admin_sessions TO authenticated;