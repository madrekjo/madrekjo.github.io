-- ============================================================================
-- ★ نظام إدارة "أجر وثواب": تسجيل دخول أدمن + حذف + تثبيت + حظر ★
-- شغّلها في نفس مشروع أجر وثواب (متلاوات/أجر وثواب):
-- Supabase → SQL Editor → New Query → Paste → Run
--
-- ماذا يضيف:
--   [0] عمود is_pinned على جدول المساهمات (للتثبيت)
--   [1] جدول ajr_admins — هويات الأدمن
--   [2] جدول ajr_banned_authors — الأجهزة المحظورة (author_token)
--   [3] جدول ajr_banned_names — الأسماء المحظورة (block الاسم)
--   [4] إنشاء حساب الأدمن (بريد + كلمة سر) إذا لم يكن موجوداً
--   [5] دوال الأدمن: دخول/حذف/تثبيت/حظر جهاز/حظر اسم/رفع حظر
--       (كلها تتحقق أولاً أن المستخدم أدمن عبر auth.uid)
--   [6] تعديل submit_ajr_contribution ليحظر الأجهزة والأسماء الممنوعة
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- [0] التثبيت
ALTER TABLE public.ajr_contributions
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ajr_contributions_pinned
  ON public.ajr_contributions (is_pinned DESC, created_at DESC);

-- [1] الأدمن
CREATE TABLE IF NOT EXISTS public.ajr_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- [2] الأجهزة المحظورة
CREATE TABLE IF NOT EXISTS public.ajr_banned_authors (
  author_token text PRIMARY KEY,
  reason text DEFAULT 'نشر محتوى غير لائق',
  banned_at timestamptz NOT NULL DEFAULT now(),
  banned_by uuid
);

-- [3] الأسماء المحظورة
CREATE TABLE IF NOT EXISTS public.ajr_banned_names (
  name text PRIMARY KEY,
  reason text DEFAULT 'نشر محتوى غير لائق',
  banned_at timestamptz NOT NULL DEFAULT now(),
  banned_by uuid
);

ALTER TABLE public.ajr_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajr_banned_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajr_banned_names ENABLE ROW LEVEL SECURITY;

-- لا سياسات مباشرة: كل الوصول عبر الدوال (SECURITY DEFINER).

-- [4] حساب الأدمن
DO $$
DECLARE
  v_uid uuid;
  v_enc text := '$2a$10$GI7erVCsgM1yT146nyenP.IXI7PVyqWInlDh/IeWBFiU.abNOgFPO';
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
      now(), NULL, '', NULL, '', NULL, '', NULL, NULL,
      '{"provider":"email","providers":["email"]}',
      now(), now(), '', 0, NULL, '', NULL,
      false, NULL, false
    )
    RETURNING id INTO v_uid;
  END IF;

  INSERT INTO public.ajr_admins (user_id, email)
  VALUES (v_uid, 'admin@madrekjo.com')
  ON CONFLICT (user_id) DO NOTHING;
END $$;

-- [5] دوال الأدمن

-- هل المستخدم الحالي أدمن؟
CREATE OR REPLACE FUNCTION public.is_ajr_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ajr_admins a WHERE a.user_id = auth.uid()
  );
$$;

-- حذف مساهمة
CREATE OR REPLACE FUNCTION public.admin_delete_contribution(p_id uuid)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_ajr_admin() THEN
    RETURN QUERY SELECT false, 'غير مصرح لك بهذا الإجراء'::text;
    RETURN;
  END IF;

  DELETE FROM public.ajr_contributions WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'المساهمة غير موجودة'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'تم حذف المساهمة'::text;
END $$;

-- تثبيت / إلغاء تثبيت
CREATE OR REPLACE FUNCTION public.admin_toggle_pin(p_id uuid)
RETURNS TABLE (success boolean, pinned boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pinned boolean;
BEGIN
  IF NOT public.is_ajr_admin() THEN
    RETURN QUERY SELECT false, NULL::boolean, 'غير مصرح لك بهذا الإجراء'::text;
    RETURN;
  END IF;

  UPDATE public.ajr_contributions
     SET is_pinned = NOT is_pinned
   WHERE id = p_id
   RETURNING is_pinned INTO v_pinned;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::boolean, 'المساهمة غير موجودة'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_pinned,
    CASE WHEN v_pinned THEN 'تم تثبيت المساهمة' ELSE 'تم إلغاء التثبيت' END;
END $$;

-- حظر جهاز مرسل مساهمة معينة (بالـ id — بدون كشف رمز الجهاز)
CREATE OR REPLACE FUNCTION public.admin_ban_author_of(
  p_id uuid,
  p_reason text DEFAULT 'نشر محتوى غير لائق'
)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF NOT public.is_ajr_admin() THEN
    RETURN QUERY SELECT false, 'غير مصرح لك بهذا الإجراء'::text;
    RETURN;
  END IF;

  SELECT author_token INTO v_token FROM public.ajr_contributions WHERE id = p_id;
  IF v_token IS NULL THEN
    RETURN QUERY SELECT false, 'المساهمة غير موجودة'::text;
    RETURN;
  END IF;

  INSERT INTO public.ajr_banned_authors (author_token, reason, banned_by)
  VALUES (v_token, p_reason, auth.uid())
  ON CONFLICT (author_token) DO UPDATE SET reason = EXCLUDED.reason;

  RETURN QUERY SELECT true, 'تم حظر جهاز هذا المرسل — لن يستطيع النشر بعد الآن'::text;
END $$;

-- حظر جهاز مباشرة (بالرمز)
CREATE OR REPLACE FUNCTION public.admin_ban_author(
  p_author_token text,
  p_reason text DEFAULT 'نشر محتوى غير لائق'
)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_ajr_admin() THEN
    RETURN QUERY SELECT false, 'غير مصرح لك بهذا الإجراء'::text;
    RETURN;
  END IF;

  IF p_author_token IS NULL OR length(p_author_token) < 8 THEN
    RETURN QUERY SELECT false, 'رمز المرسل غير صالح'::text;
    RETURN;
  END IF;

  INSERT INTO public.ajr_banned_authors (author_token, reason, banned_by)
  VALUES (p_author_token, p_reason, auth.uid())
  ON CONFLICT (author_token) DO UPDATE SET reason = EXCLUDED.reason;

  RETURN QUERY SELECT true, 'تم حظر الجهاز'::text;
END $$;

-- رفع حظر عن جهاز
CREATE OR REPLACE FUNCTION public.admin_unban_author(p_author_token text)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_ajr_admin() THEN
    RETURN QUERY SELECT false, 'غير مصرح لك بهذا الإجراء'::text;
    RETURN;
  END IF;

  DELETE FROM public.ajr_banned_authors WHERE author_token = p_author_token;
  RETURN QUERY SELECT true, 'تم رفع الحظر عن الجهاز'::text;
END $$;

-- حظر اسم
CREATE OR REPLACE FUNCTION public.admin_ban_name(
  p_name text,
  p_reason text DEFAULT 'نشر محتوى غير لائق'
)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_ajr_admin() THEN
    RETURN QUERY SELECT false, 'غير مصرح لك بهذا الإجراء'::text;
    RETURN;
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RETURN QUERY SELECT false, 'الاسم غير صالح'::text;
    RETURN;
  END IF;

  INSERT INTO public.ajr_banned_names (name, reason, banned_by)
  VALUES (lower(btrim(p_name)), p_reason, auth.uid())
  ON CONFLICT (name) DO UPDATE SET reason = EXCLUDED.reason;

  RETURN QUERY SELECT true, 'تم حظر هذا الاسم'::text;
END $$;

-- رفع حظر عن اسم
CREATE OR REPLACE FUNCTION public.admin_unban_name(p_name text)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_ajr_admin() THEN
    RETURN QUERY SELECT false, 'غير مصرح لك بهذا الإجراء'::text;
    RETURN;
  END IF;

  DELETE FROM public.ajr_banned_names WHERE name = lower(btrim(p_name));
  RETURN QUERY SELECT true, 'تم رفع الحظر عن الاسم'::text;
END $$;

-- [6] تعديل دالة النشر: منع المحظورين
CREATE OR REPLACE FUNCTION public.submit_ajr_contribution(
  p_type text,
  p_content text,
  p_name text DEFAULT NULL,
  p_author_token text DEFAULT NULL
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_recent integer;
  v_clean_name text;
BEGIN
  IF p_type NOT IN ('dua', 'ayah') THEN
    RETURN QUERY SELECT false, 'نوع غير صحيح'::text;
    RETURN;
  END IF;

  IF p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 2000 THEN
    RETURN QUERY SELECT false, 'النص يجب أن يكون من 1 إلى 2000 حرف'::text;
    RETURN;
  END IF;

  IF p_name IS NOT NULL AND length(btrim(p_name)) > 80 THEN
    RETURN QUERY SELECT false, 'الاسم أطول من 80 حرف'::text;
    RETURN;
  END IF;

  IF p_author_token IS NULL OR length(p_author_token) NOT BETWEEN 8 AND 128 THEN
    RETURN QUERY SELECT false, 'رمز المرسل غير صالح'::text;
    RETURN;
  END IF;

  -- ⛔ جهاز محظور؟
  IF EXISTS (SELECT 1 FROM public.ajr_banned_authors WHERE author_token = p_author_token) THEN
    RETURN QUERY SELECT false, 'تم حظر هذا الجهاز بسبب مخالفة، لا يمكنك النشر'::text;
    RETURN;
  END IF;

  v_clean_name := lower(btrim(COALESCE(p_name, '')));

  -- ⛔ اسم محظور؟
  IF v_clean_name <> '' AND EXISTS (SELECT 1 FROM public.ajr_banned_names WHERE name = v_clean_name) THEN
    RETURN QUERY SELECT false, 'هذا الاسم محظور بسبب مخالفة، غير اسمك'::text;
    RETURN;
  END IF;

  -- منع السبام: مشاركة واحدة كحد أقصى لكل رمز خلال 60 ثانية
  SELECT count(*) INTO v_recent
  FROM public.ajr_contributions
  WHERE author_token = p_author_token
    AND created_at > now() - interval '60 seconds';

  IF v_recent >= 1 THEN
    RETURN QUERY SELECT false, 'هل أنت متأكد؟ انتظر دقيقة واحدة بين كل مشاركة'::text;
    RETURN;
  END IF;

  INSERT INTO public.ajr_contributions (type, content, name, author_token)
  VALUES (p_type, btrim(p_content), NULLIF(btrim(COALESCE(p_name, '')), ''), p_author_token);

  RETURN QUERY SELECT true, 'تم نشر مشاركتك، جزاك الله خيراً'::text;
END;
$$;

-- [7] الصلاحيات
GRANT EXECUTE ON FUNCTION public.is_ajr_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_contribution(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_pin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_author_of(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_author(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_author(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_name(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_name(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ajr_contribution(text, text, text, text) TO anon, authenticated;
GRANT SELECT ON public.ajr_contributions TO anon, authenticated;