-- ============================================================================
-- chat27.sql — نظام أكواد الدخول (رمز مكوّن من 6 أرقام) للمستخدمين
-- الذين لا يملكون حساب Google.
--
-- الفكرة:
--   الأدمن ينشئ كوداً (6 أرقام) ويحدد: عدد الاستخدامات المسموح + مدة الصلاحية
--   + رسالة اختيارية تظهر للمستخدم. المستخدم الذي لا يملك حساباً يكتب الكود،
--   فإذا طابق (موجود / لم ينتهِ / لم تُستهلك كل الاستخدامات) تظهر رسالة الأدمن
--   مع نموذج إنشاء حساب (اسم + إيميل + كلمة مرور) بدون أي تأكيد بالبريد،
--   فوراً يُنشأ الحساب ويدخل إلى الدردشة.
--
-- تُشغَّل هذه الجملة من Supabase SQL Editor (مرة واحدة) كما في chat26.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) جدول الأكواد
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

-- الوصول المباشر للجدول للأدمن فقط (قراءة/إدراج/حذف).
-- جميع العمليات في التطبيق تمر عبر دوال SECURITY DEFINER بالأسفل.
CREATE POLICY "Admins can view access codes" ON public.access_codes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert access codes" ON public.access_codes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete access codes" ON public.access_codes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 2) إنشاء كود جديد (الأدمن فقط)
--    p_max_uses      : كم مرة مسموح استخدام الكود
--    p_duration_hours: مدة الصلاحية بالساعات
--    p_message       : رسالة اختيارية تظهر للمستخدم عند كتابة الكود
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
-- 3) قائمة الأكواد (الأدمن فقط) — لعرضها في لوحة الإدارة
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
    'active',     (a.expires_at > now() AND a.used_count < a.max_uses)
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.access_codes a;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) إلغاء/حذف كود (الأدمن فقط)
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
-- 5) التحقق من صحة الكود (يُستدعى من صفحة تسجيل الدخول، بدون تسجيل دخول)
--    يُظهر للأدمن رسالته + إن كان الكود صالحاً يُرجع الباقي المتبقي.
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
    'valid',    true,
    'reason',   'ok',
    'message',  COALESCE(NULLIF(v_row.message, ''), 'تم التحقق من الكود بنجاح. أنشئ حسابك الآن للدخول إلى الدردشة.'),
    'remaining', v_row.max_uses - v_row.used_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) استهلاك الكود (يُستدعى من الدالة السحابية invite-signup فقط)
--    استهلاك ذرّي آمن ضد السباق: يُحجز استخداماً واحداً إذا كان الكود صالحاً.
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

-- قصر الاستدعاء على الدالة السحابية (service_role) فقط.
REVOKE ALL ON FUNCTION public.consume_access_code(p_code TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_access_code(p_code TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 7) استرجاع الاستخدام إذا فشل إنشاء الحساب (الدالة السحابية فقط)
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