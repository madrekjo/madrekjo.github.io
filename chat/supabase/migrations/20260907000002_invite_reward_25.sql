-- ============================================================================
-- نظام دعوة الأصدقاء: كل مستخدم مسجّل يستطيع استدعاء صديق عبر كوده الشخصي،
-- وكل مخيب جديد يسجّل بكوده يحصل الداعي على +25 نقطة (بحد أقصى 100).
-- المدعو يبدأ رصيده 50 نقطة تلقائياً كما هو الحال لأي مستخدم جديد.
-- يُشغَّل عبر SQL Editor ولا يُشغل تلقائياً.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) عمود rewarded_uses: منع تكرار المكافأة لنفس الاستهلاك
--    (used_count يزيد عند كل استخدام، rewarded_uses يتقدم فقط عند دفع المكافأة)
-- ---------------------------------------------------------------------------
ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS rewarded_uses INTEGER NOT NULL DEFAULT 0
  CHECK (rewarded_uses >= 0);

-- ---------------------------------------------------------------------------
-- 2) كود الدعوة الشخصي لأي عضو مسجّل (مستدعي/ساحب للكود)
--    - إن وجد كود نشط للمستخدم يُعاد كما هو (يسترجع الكود نفسه)
--    - وإلا يولّد كوداً جديداً من 6 أرقام صالحاً 7 أيام لـ 20 استخدام
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_my_invite_code()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  UUID := auth.uid();
  v_row   public.access_codes%ROWTYPE;
  v_code  TEXT;
  v_exp   TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'login_required';
  END IF;

  -- كود فعال موجود مسبقاً لهذا المستخدم؟ أعده.
  SELECT * INTO v_row FROM public.access_codes
  WHERE created_by = v_user AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'code',       v_row.code,
      'expires_at', v_row.expires_at,
      'max_uses',   v_row.max_uses,
      'used_count', v_row.used_count
    );
  END IF;

  -- وإلا فولّد كوداً جديداً فريداً من 6 أرقام
  LOOP
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.access_codes WHERE code = v_code);
  END LOOP;

  v_exp := now() + interval '7 days';

  INSERT INTO public.access_codes (code, created_by, max_uses, used_count, expires_at, message)
  VALUES (v_code, v_user, 20, 0, v_exp, '')
  RETURNING id, code, expires_at, max_uses, used_count
  INTO v_row.id, v_row.code, v_row.expires_at, v_row.max_uses, v_row.used_count;

  RETURN jsonb_build_object(
    'code',       v_row.code,
    'expires_at', v_row.expires_at,
    'max_uses',   v_row.max_uses,
    'used_count', v_row.used_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_invite_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_invite_code() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) مكافأة الداعي: يُستدعى من الدالة السحابية invite-signup فقط
--    بعد نجاح إنشاء حساب المدعو — +25 لكل مخيب جديد (سقف 100).
--    - نشطة على كل كود له created_by (أكواد الأدمن أيضاً لكن لا قيمة لها
--      لأن الأدمن/المشرفين رصيدهم غير محدود أصلاً).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reward_inviter(p_code TEXT)
RETURNS TABLE(success BOOLEAN, inviter_id UUID, new_balance INTEGER, points_earned INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      public.access_codes%ROWTYPE;
  v_balance  INTEGER;
  v_added    INTEGER;
  v_admin    BOOLEAN;
  v_staff    BOOLEAN;
BEGIN
  SELECT * INTO v_row FROM public.access_codes
  WHERE code = lpad(p_code, 6, '0')
  FOR UPDATE;

  IF NOT FOUND OR v_row.created_by IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::INTEGER, 0;
    RETURN;
  END IF;

  -- فقط الاستهلاك الجديد يكافأ مرة واحدة (يمنع التكرار على إعادة المحاولة)
  IF v_row.used_count <= v_row.rewarded_uses THEN
    RETURN QUERY SELECT FALSE, v_row.created_by, NULL::INTEGER, 0;
    RETURN;
  END IF;

  -- الأدمن/المشرفين رصيدهم غير محدود، تخطَّ المكافأة لكن سجّل الاستهلاك كمُكافأ
  SELECT public.has_role(v_row.created_by, 'admin') INTO v_admin;
  SELECT public.has_role(v_row.created_by, 'moderator')
      OR public.has_role(v_row.created_by, 'supervisor') INTO v_staff;
  IF v_admin OR v_staff THEN
    UPDATE public.access_codes SET rewarded_uses = used_count WHERE id = v_row.id;
    RETURN QUERY SELECT TRUE, v_row.created_by, 100, 0;
    RETURN;
  END IF;

  -- ضبط رصيد الداعي إن لم يوجد صف له بعد
  SELECT balance INTO v_balance FROM public.user_points
  WHERE user_id = v_row.created_by FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance) VALUES (v_row.created_by, 50)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_balance FROM public.user_points
    WHERE user_id = v_row.created_by;
  END IF;

  v_added := LEAST(v_balance + 25, 100) - v_balance;
  IF v_added < 0 THEN
    v_added := 0;
  END IF;

  IF v_added > 0 THEN
    UPDATE public.user_points SET balance = v_balance + v_added
    WHERE user_id = v_row.created_by;

    INSERT INTO public.point_transactions
      (user_id, amount, balance_after, transaction_type, source, metadata)
    VALUES
      (v_row.created_by, v_added, v_balance + v_added, 'invite_reward', 'invite',
       jsonb_build_object('invited_code', v_row.code));
  END IF;

  UPDATE public.access_codes SET rewarded_uses = used_count WHERE id = v_row.id;

  RETURN QUERY SELECT TRUE, v_row.created_by, v_balance + v_added, v_added;
END;
$$;

-- الاستدعاء من الدالة السحابية (service_role) فقط
REVOKE ALL ON FUNCTION public.reward_inviter(p_code TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reward_inviter(p_code TEXT) TO service_role;