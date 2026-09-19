-- ============================================================================
-- إصلاح نظام تسجيل دخول الأدمن بالرقم السري (PIN) — v2
-- شغّلها في SQL Editor (مشروع أجر وثواب):
--   Supabase → SQL Editor → New Query → Paste → Run
--
-- يعالج مشكلتين ظهرتا بعد الميغرايشن الأول:
--   [A] خطأ 500 "Database error querying schema" عند الدخول عبر GoTrue
--       سببه: صف الأدمن المُدخل يدويًا في auth.users فيه أعمدة NULL
--       (confirmation_token / email_change / ...) يجب أن تكون '' (سلسلة فارغة).
--   [B] خطأ "function crypt(text, text) does not exist" داخل دالة PIN
--       سببه: pgcrypto مثبّت في schema "extensions" وليس في search_path.
--
-- بعد تشغيله: الرقم السري = 1985 يعمل على /ajr/ و /ajr.html
-- ============================================================================

-- [0] ضمان وجود pgcrypto (في schema extensions إن لم يكن مثبتًا)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- [A] تصحيح أعمدة GoTrue في auth.users (تمنع خطأ 500)
UPDATE auth.users SET
  confirmation_token        = COALESCE(confirmation_token, ''),
  recovery_token            = COALESCE(recovery_token, ''),
  email_change              = COALESCE(email_change, ''),
  email_change_token_new    = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change              = COALESCE(phone_change, ''),
  phone_change_token        = COALESCE(phone_change_token, ''),
  reauthentication_token    = COALESCE(reauthentication_token, '')
WHERE email = 'admin@madrekjo.com';

-- [B] ضبط كلمة سر الأدمن = الرقم السري 1985 (هاش $2a$)
UPDATE auth.users
   SET encrypted_password = '$2a$10$gRAW1JJFXeKDjiMlA7bbXuzRV5durgNvk2h683XSHi/ygFjyHFwFi'
 WHERE email = 'admin@madrekjo.com';

-- [C] التأكد من وجود هوية (identity) للإيميل كي يكتمل تسجيل الدخول
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'admin@madrekjo.com';
  IF v_uid IS NOT NULL
     AND NOT EXISTS (
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
END $$;

-- [D] إصلاح دالة PIN: إضافة extensions إلى search_path (يجعل crypt و gen_random_bytes متاحتين)
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

-- [E] توحيد pin_hash على صيغة $2a$ (متوافقة مع pgcrypto و GoTrue)
UPDATE public.ajr_admins
   SET pin_hash = '$2a$10$gRAW1JJFXeKDjiMlA7bbXuzRV5durgNvk2h683XSHi/ygFjyHFwFi';

GRANT EXECUTE ON FUNCTION public.admin_login_with_pin(text) TO anon, authenticated;
