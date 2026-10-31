-- ============================================================================
-- أكواد الدخول (رمز مكوّن من 6 أرقام) — مشروع الإنجاز
-- ----------------------------------------------------------------------------
-- النظام منقول بالكامل إلى قاعدة بيانات الإنجاز (لا علاقة له بالدردشة):
--   • الأدمن ينشئ رمزاً ويحدد عدد الاستخدامات + مدة الصلاحية + رسالة اختيارية.
--   • من لا يملك حساب Google يكتب الرمز في صفحة الدخول:
--       - إن لم يكن الرمز مرتبطاً بأي حساب → ينشئ حساباً (اسم + إيميل + كلمة مرور)
--         بدون أي تأكيد بالبريد، ويدخل مباشرة.
--       - إن كان مرتبطاً بحساب → يدخل مباشرة بجلسة سحرية (بدون كلمة مرور).
--   • كل رمز يُربط بالحسابات التي استخدمته (profiles.invited_code) لتظهر في لوحة الإدارة.
--
-- يُنفَّذ يدوياً مرة واحدة من:
--   Supabase Dashboard → SQL Editor (مشروع الإنجاز: itflhfhsfzrdfpxvlzrv)
-- ثم الصق محتوى هذا الملف كاملاً واضغط RUN.
--
-- آمن لإعادة التشغيل (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- [1] ربط الحساب بالرمز الذي استخدمه
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invited_code TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS via_invite BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_invited_code
  ON public.profiles (invited_code)
  WHERE invited_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- [2] جدول الأكواد
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  max_uses   INTEGER NOT NULL CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  message    TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view access codes" ON public.access_codes;
CREATE POLICY "Admins can view access codes" ON public.access_codes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert access codes" ON public.access_codes;
CREATE POLICY "Admins can insert access codes" ON public.access_codes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete access codes" ON public.access_codes;
CREATE POLICY "Admins can delete access codes" ON public.access_codes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- [3] إنشاء حساب جديد عبر الرمز: يُخزَّن الرمز في البروفايل تلقائياً
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url, invited_code, via_invite)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    NULLIF(NEW.raw_user_meta_data->>'invited_code', ''),
    COALESCE((NEW.raw_user_meta_data->>'via_invite')::boolean, false)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- [4] إنشاء كود جديد (الأدمن فقط)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_access_code(
  p_max_uses INTEGER,
  p_duration_hours INTEGER,
  p_message TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_id   UUID;
  v_exp  TIMESTAMPTZ;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admins_only';
  END IF;
  IF p_max_uses IS NULL OR p_max_uses < 1 THEN
    RAISE EXCEPTION 'max_uses_must_be_positive';
  END IF;
  IF p_duration_hours IS NULL OR p_duration_hours < 1 THEN
    RAISE EXCEPTION 'duration_must_be_positive';
  END IF;

  -- توليد كود فريد من 6 أرقام (0..999999 مع حشو أصفار لليسار)
  LOOP
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.access_codes WHERE code = v_code);
  END LOOP;

  v_exp := now() + make_interval(hours => p_duration_hours);

  INSERT INTO public.access_codes (code, created_by, max_uses, used_count, expires_at, message)
  VALUES (v_code, auth.uid(), p_max_uses, 0, v_exp, COALESCE(p_message, ''))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id',           v_id,
    'code',         v_code,
    'max_uses',     p_max_uses,
    'used_count',   0,
    'expires_at',   v_exp,
    'message',      COALESCE(p_message, '')
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- [5] قائمة الأكواد مع أسماء الحسابات المرتبطة (الأدمن فقط)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_access_codes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admins_only';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',         a.id,
    'code',       a.code,
    'max_uses',   a.max_uses,
    'used_count', a.used_count,
    'expires_at', a.expires_at,
    'message',    a.message,
    'created_at', a.created_at,
    'active',     (a.expires_at > now() AND a.used_count < a.max_uses),
    'accounts',   COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'name',    p.display_name,
        'email',   u.email
      ) ORDER BY p.created_at)
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.user_id
      WHERE p.invited_code = a.code
    ), '[]'::jsonb)
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.access_codes a;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- [6] إلغاء/حذف كود (الأدمن فقط)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_access_code(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admins_only';
  END IF;
  DELETE FROM public.access_codes WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- [7] إعادة تفعيل رمز (الأدمن فقط): تصفير الاستخدام + تمديد الصلاحية
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reactivate_access_code(
  p_id UUID,
  p_duration_hours INTEGER DEFAULT 24
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.access_codes%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admins_only';
  END IF;
  IF p_duration_hours IS NULL OR p_duration_hours < 1 THEN
    RAISE EXCEPTION 'duration_must_be_positive';
  END IF;

  UPDATE public.access_codes
  SET used_count = 0,
      expires_at = now() + make_interval(hours => p_duration_hours)
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  RETURN jsonb_build_object(
    'id',         v_row.id,
    'code',       v_row.code,
    'used_count', v_row.used_count,
    'expires_at', v_row.expires_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- [8] التحقق من صحة الكود (متاح للزوار — تُستخدم من صفحة الدخول/الخادم)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_access_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.access_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.access_codes WHERE code = lpad(p_code, 6, '0');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found', 'message', null);
  END IF;
  IF v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired', 'message', null);
  END IF;
  IF v_row.used_count >= v_row.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'used_up', 'message', null);
  END IF;

  RETURN jsonb_build_object(
    'valid',     true,
    'reason',    'ok',
    'message',   COALESCE(NULLIF(v_row.message, ''), 'تم التحقق من الرمز بنجاح. أنشئ حسابك الآن للدخول إلى منصة الإنجاز.'),
    'remaining', v_row.max_uses - v_row.used_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- [9] استهلاك الكود ذرّياً (دالة code-signup فقط)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_access_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.access_codes%ROWTYPE;
  v_valid BOOLEAN;
  v_reason TEXT;
BEGIN
  SELECT * INTO v_row FROM public.access_codes
  WHERE code = lpad(p_code, 6, '0')
    AND expires_at > now()
    AND used_count < max_uses
  FOR UPDATE;

  v_valid := FOUND;

  IF NOT v_valid THEN
    SELECT EXISTS (SELECT 1 FROM public.access_codes WHERE code = lpad(p_code, 6, '0'))
    INTO v_valid;
    IF NOT v_valid THEN
      v_reason := 'not_found';
    ELSIF EXISTS (SELECT 1 FROM public.access_codes WHERE code = lpad(p_code, 6, '0') AND expires_at <= now()) THEN
      v_reason := 'expired';
    ELSE
      v_reason := 'used_up';
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', v_reason, 'id', null, 'message', null);
  END IF;

  UPDATE public.access_codes SET used_count = used_count + 1 WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'ok',       true,
    'reason',   'ok',
    'id',       v_row.id,
    'code',     v_row.code,
    'message',  COALESCE(NULLIF(v_row.message, ''), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_access_code(p_code TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_access_code(p_code TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- [10] استرجاع الاستخدام إذا فشل إنشاء الحساب (دالة code-signup فقط)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_access_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.access_codes
  SET used_count = GREATEST(used_count - 1, 0)
  WHERE code = lpad(p_code, 6, '0');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_access_code(p_code TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_access_code(p_code TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- [11] الحسابات المرتبطة برمز (service_role فقط — تُرجع الإيميلات)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invited_accounts_for_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := lpad(regexp_replace(COALESCE(p_code, ''), '\D', '', 'g'), 6, '0');
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', p.user_id,
    'name',    p.display_name,
    'email',   u.email
  ) ORDER BY p.created_at), '[]'::jsonb)
  INTO v_result
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE p.invited_code = v_code;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.invited_accounts_for_code(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invited_accounts_for_code(TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- [12] تحديد المحاولات (حماية من تخمين الرمز) — دالة code-login فقط
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.code_login_attempts (
  id           BIGSERIAL PRIMARY KEY,
  attempt_key  TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_code_login_attempts_key_time
  ON public.code_login_attempts (attempt_key, attempted_at DESC);

ALTER TABLE public.code_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.register_code_attempt(
  p_key TEXT,
  p_max INTEGER DEFAULT 10,
  p_window_seconds INTEGER DEFAULT 600
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.code_login_attempts
  WHERE attempted_at < now() - make_interval(secs => p_window_seconds * 4);

  SELECT count(*) INTO v_count
  FROM public.code_login_attempts
  WHERE attempt_key = p_key
    AND attempted_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.code_login_attempts (attempt_key) VALUES (p_key);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.register_code_attempt(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_code_attempt(TEXT, INTEGER, INTEGER) TO service_role;
