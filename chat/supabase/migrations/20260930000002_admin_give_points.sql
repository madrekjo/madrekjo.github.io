-- =============================================================
-- منح الأدمن نقاط للمستخدمين — واجهة كاملة
-- =============================================================
-- شغّل هذا الملف في Supabase SQL Editor (مشروع الدردشة hvrtzzouasqseyswjcex)
-- قبل استخدام زر «🪙» في لوحة الإدارة.
--
-- شو بيعمل:
--   1) يfixes سقف الرصيد على مستوى الجدول (100 → 200) — بدونه أي منح فوق
--      100 كان رح يفشل بـ check violation ويكسر حتى نقاط الجولات والعجلة.
--   2) admin_adjust_points(amount > 0 منح / < 0 خصم) — للأدمن والمالك فقط،
--      سجّل كل عملية في point_transactions مع سببها ومَن نفّذها.
--   3) admin_points_map() — خريطة أرصدة كل المستخدمين بنداء واحد.
--   4) grant_points القديمة تصير غلاف فوق الدالة الجديدة (إصلاح سقف 100).
-- =============================================================

-- -------------------------------------------------------------
-- 1) سقف الرصيد: 200 لا 100 (نفس round_max_balance())
-- -------------------------------------------------------------
ALTER TABLE public.user_points
  DROP CONSTRAINT IF EXISTS user_points_balance_check;

ALTER TABLE public.user_points
  ADD CONSTRAINT user_points_balance_check
  CHECK (balance >= 0 AND balance <= 200);

-- -------------------------------------------------------------
-- 2) دالة التعديل الأساسية: منح (موجب) وخصم (سالب)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_points(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_cap INTEGER := public.round_max_balance();
  v_current INTEGER;
  v_new INTEGER;
  v_actual INTEGER;
BEGIN
  -- 2.1) الصلاحية: أدمن أو مالك فقط (من auth.uid() — ما في انتحال)
  IF v_admin_id IS NULL OR NOT (
    public.has_role(v_admin_id, 'admin')
    OR public.has_role(v_admin_id, 'owner')
  ) THEN
    RETURN QUERY SELECT FALSE, 0, 'فقط الأدمن أو المالك يقدر يعدّل النقاط'::TEXT;
    RETURN;
  END IF;

  -- 2.2) التحقق من المدخلات
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'المستخدم غير محدد'::TEXT;
    RETURN;
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'اكتب عدد أكبر من صفر'::TEXT;
    RETURN;
  END IF;

  IF ABS(p_amount) > 2000 THEN
    RETURN QUERY SELECT FALSE, 0, 'المبلغ كبير جداً — الحد الأقصى 2000 نقطة بالمرة'::TEXT;
    RETURN;
  END IF;

  -- 2.3) قفل صف الرصيد (يمنع سباق بين عمليتين)
  SELECT balance INTO v_current
  FROM public.user_points
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 2.4) ما في صف؟ ننشئ صفاً بقيمة صفر (مع daily_reset_at لأنه NOT NULL)
  IF v_current IS NULL THEN
    INSERT INTO public.user_points (user_id, balance, daily_reset_at)
    VALUES (p_user_id, 0, now())
    ON CONFLICT (user_id) DO NOTHING;

    SELECT balance INTO v_current
    FROM public.user_points
    WHERE user_id = p_user_id
    FOR UPDATE;
  END IF;

  v_current := COALESCE(v_current, 0);

  -- 2.5) لا نتجاوز السقف ولا ننزل تحت الصفر
  v_new := LEAST(GREATEST(v_current + p_amount, 0), v_cap);

  IF v_new = v_current THEN
    RETURN QUERY
      SELECT FALSE, v_current,
        CASE WHEN p_amount > 0
          THEN ('الرصيد عند الحد الأقصى (' || v_cap || ' نقطة)')
          ELSE 'الرصيد صفر بالفعل — ما في نقاط للخصم'
        END::TEXT;
    RETURN;
  END IF;

  v_actual := v_new - v_current;

  UPDATE public.user_points
  SET balance = v_new, updated_at = now()
  WHERE user_id = p_user_id;

  -- 2.6) سجل التدقيق: مين، قديش، ليش، والرصيد بعدها
  INSERT INTO public.point_transactions
    (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES
    (p_user_id, v_actual, v_new, 'admin_grant', 'admin',
      jsonb_build_object(
        'admin_id', v_admin_id,
        'reason', p_reason,
        'requested_amount', p_amount,
        'direction', CASE WHEN p_amount > 0 THEN 'grant' ELSE 'deduct' END
      ));

  RETURN QUERY SELECT TRUE, v_new, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_points(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_points(UUID, INTEGER, TEXT) TO authenticated;

-- -------------------------------------------------------------
-- 3) خريطة الأرصدة لكل المستخدمين بنداء واحد (بدل N استعلامات)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_points_map()
RETURNS TABLE(user_id UUID, balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  IF v_admin_id IS NULL OR NOT (
    public.has_role(v_admin_id, 'admin')
    OR public.has_role(v_admin_id, 'owner')
  ) THEN
    RETURN;  -- ما في أرقام مخبّأة: صف فاضي
  END IF;

  RETURN QUERY
    SELECT up.user_id, up.balance
    FROM public.user_points up;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_points_map() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_points_map() TO authenticated;

-- -------------------------------------------------------------
-- 4) grant_points القديمة → غلاف على الدالة الجديدة (إصلاح سقف 100)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_points(
  p_target_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- دالة قديمة للمنح فقط: نحوّل أي مبلغ سالب إلى منح الموجب نفسه
  RETURN QUERY
    SELECT * FROM public.admin_adjust_points(
      p_target_user_id,
      CASE WHEN COALESCE(p_amount, 0) < 0 THEN -p_amount ELSE p_amount END,
      p_reason
    );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_points(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_points(UUID, INTEGER, TEXT) TO authenticated;

-- -------------------------------------------------------------
-- 5) المالك يقدر يقرأ كل الأرصدة أيضاً (سياسة user_points)
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own points" ON public.user_points;
CREATE POLICY "Users can view own points" ON public.user_points
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  );
