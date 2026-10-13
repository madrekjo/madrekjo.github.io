-- ============================================================================
-- الدخول المباشر برمز الدعوة + إعادة تفعيل الرموز
-- ----------------------------------------------------------------------------
-- 1) ربط كل رمز بالحساب/الحسابات التي استخدمته (profiles.invited_code).
--    يُضاف حقل accounts إلى list_access_codes لعرض الأسماء في لوحة الإدارة.
-- 2) دالة reactivate_access_code: تصفير عدد الاستخدامات + تمديد الصلاحية
--    حتى يعيد الأدمن إعطاء الرمز لصاحبه.
-- 3) دالة invited_accounts_for_code + جدول/دالة تحديد المحاولات: يستخدمها
--    edge function invite-login (service_role فقط).
-- يُشغَّل من Supabase SQL Editor (مرة واحدة) كما في بقية المهاجرات.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) فهرس للربط السريع بالرمز
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_invited_code
  ON public.profiles (invited_code) WHERE invited_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1) قائمة الأكواد (الأدمن فقط) — تُضاف أسماء الحسابات المرتبطة بكل رمز
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
        'name',    p.full_name,
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
-- 2) إعادة تفعيل رمز (الأدمن فقط): تصفير الاستخدام + تمديد الصلاحية
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
-- 3) الحسابات المرتبطة برمز (service_role فقط — تُرجع الإيميلات)
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
    'name',    p.full_name,
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
-- 4) تحديد المحاولات (حماية من تخمين الرمز) — يستخدمه invite-login
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
  -- تنظيف المحاولات القديمة (نافذة 4 أضعاف المدة) لتقليل حجم الجدول.
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
