-- تعديل نظام النقاط:
--   1) بداية الرصيد للمستخدم الجديد / إعادة ضبط اليومي: 30 -> 50
--   2) الحد الأقصى للرصيد: 50 -> 100
--   3) مكافأة البقاء في الجولة ساعتين: +5 -> +10
-- يُشغَّل عبر SQL Editor (مثل الملف الأصلي chat 335.sql ولا يُشغل تلقائياً).

-- ---------------------------------------------------------------------------
-- جدول user_points: default الرصيد الجديد
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_points
  ALTER COLUMN balance SET DEFAULT 50;

-- Trigger تهيئة الرصيد عند إنشاء مستخدم جديد
CREATE OR REPLACE FUNCTION public.initialize_user_points()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_points (user_id, balance)
  VALUES (NEW.id, 50)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- spend_points: خصم النقاط
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spend_points(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_source TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_is_admin BOOLEAN;
  v_is_staff BOOLEAN;
  v_new_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'المبلغ يجب أن يكون موجب'::TEXT;
    RETURN;
  END IF;

  SELECT public.has_role(p_user_id, 'admin') INTO v_is_admin;
  SELECT public.has_role(p_user_id, 'moderator') OR public.has_role(p_user_id, 'supervisor') INTO v_is_staff;

  IF v_is_admin OR v_is_staff THEN
    SELECT balance INTO v_current_balance FROM public.user_points WHERE user_id = p_user_id;
    RETURN QUERY SELECT TRUE, COALESCE(v_current_balance, 100), NULL::TEXT;
    RETURN;
  END IF;

  SELECT balance INTO v_current_balance
  FROM public.user_points
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance)
    VALUES (p_user_id, 50)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_current_balance
    FROM public.user_points
    WHERE user_id = p_user_id
    FOR UPDATE;
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN QUERY SELECT FALSE, v_current_balance,
      format('لا نقاط كافية. رصيدك: %s، المطلوب: %s', v_current_balance, p_amount)::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_current_balance - p_amount;
  UPDATE public.user_points SET balance = v_new_balance WHERE user_id = p_user_id;

  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (p_user_id, -p_amount, v_new_balance, p_type, p_source, p_metadata);

  RETURN QUERY SELECT TRUE, v_new_balance, NULL::TEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- daily_reset_points: تجديد يومي إلى 50
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daily_reset_points()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.user_points
  SET balance = 50,
      daily_reset_at = now()
  WHERE balance != 50;

  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source)
  SELECT user_id, 0, 50, 'daily_reset', 'system'
  FROM public.user_points
  WHERE daily_reset_at < now() - INTERVAL '23 hours'
  ON CONFLICT DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- grant_points: منح من Admin (سقف 100)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_points(
  p_admin_id UUID,
  p_target_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  SELECT public.has_role(p_admin_id, 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RETURN QUERY SELECT FALSE, 0, 'فقط المسؤول يمكنه منح النقاط'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'المبلغ يجب أن يكون موجب'::TEXT;
    RETURN;
  END IF;

  SELECT balance INTO v_current_balance
  FROM public.user_points
  WHERE user_id = p_target_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance) VALUES (p_target_user_id, 50)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_current_balance
    FROM public.user_points WHERE user_id = p_target_user_id FOR UPDATE;
  END IF;

  v_new_balance := LEAST(v_current_balance + p_amount, 100);
  UPDATE public.user_points SET balance = v_new_balance WHERE user_id = p_target_user_id;

  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (p_target_user_id, p_amount, v_new_balance, 'admin_grant', 'admin',
    jsonb_build_object('admin_id', p_admin_id, 'reason', p_reason));

  RETURN QUERY SELECT TRUE, v_new_balance, NULL::TEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- reward_round_time: كل ساعتين في الجولة = +10 (سقف 100)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reward_round_time(
  p_user_id UUID,
  p_round_id UUID,
  p_started_at TIMESTAMPTZ,
  p_ended_at TIMESTAMPTZ
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, points_earned INTEGER, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_staff BOOLEAN;
  v_current_balance INTEGER;
  v_last_rewarded_at TIMESTAMPTZ;
  v_last_rewarded_round_id UUID;
  v_elapsed_seconds BIGINT;
  v_eligible_blocks INTEGER;
  v_points_to_add INTEGER;
  v_new_balance INTEGER;
BEGIN
  SELECT public.has_role(p_user_id, 'admin') INTO v_is_admin;
  SELECT public.has_role(p_user_id, 'moderator') OR public.has_role(p_user_id, 'supervisor') INTO v_is_staff;
  IF v_is_admin OR v_is_staff THEN
    SELECT balance INTO v_current_balance FROM public.user_points WHERE user_id = p_user_id;
    RETURN QUERY SELECT TRUE, COALESCE(v_current_balance, 100), 0, NULL::TEXT;
    RETURN;
  END IF;

  SELECT balance, last_rewarded_round_at, last_rewarded_round_id
  INTO v_current_balance, v_last_rewarded_at, v_last_rewarded_round_id
  FROM public.user_points
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance) VALUES (p_user_id, 50)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance, last_rewarded_round_at, last_rewarded_round_id
    INTO v_current_balance, v_last_rewarded_at, v_last_rewarded_round_id
    FROM public.user_points WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (p_ended_at - COALESCE(v_last_rewarded_at, p_started_at)))::BIGINT;

  v_eligible_blocks := v_elapsed_seconds / 7200;

  IF v_eligible_blocks < 1 THEN
    RETURN QUERY SELECT FALSE, v_current_balance, 0,
      format('تبقى %s ساعة للحصول على المكافأة التالية', 2 - (v_elapsed_seconds / 3600))::TEXT;
    RETURN;
  END IF;

  v_points_to_add := v_eligible_blocks * 10;

  v_new_balance := LEAST(v_current_balance + v_points_to_add, 100);

  UPDATE public.user_points
  SET balance = v_new_balance,
      last_rewarded_round_at = p_ended_at,
      last_rewarded_round_id = p_round_id
  WHERE user_id = p_user_id;

  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (p_user_id, v_points_to_add, v_new_balance, 'round_reward', 'system',
    jsonb_build_object('round_id', p_round_id, 'blocks', v_eligible_blocks, 'hours', v_elapsed_seconds / 3600));

  RETURN QUERY SELECT TRUE, v_new_balance, v_points_to_add, NULL::TEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_user_points: جلب الرصيد
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_points(p_user_id UUID)
RETURNS TABLE(
  balance INTEGER,
  daily_reset_at TIMESTAMPTZ,
  last_rewarded_round_at TIMESTAMPTZ,
  next_reward_hours_left NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_daily_reset TIMESTAMPTZ;
  v_last_reward TIMESTAMPTZ;
  v_hours_left NUMERIC;
BEGIN
  SELECT up.balance, up.daily_reset_at, up.last_rewarded_round_at
  INTO v_balance, v_daily_reset, v_last_reward
  FROM public.user_points up
  WHERE up.user_id = p_user_id;

  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance)
    VALUES (p_user_id, 50)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT up.balance, up.daily_reset_at, up.last_rewarded_round_at
    INTO v_balance, v_daily_reset, v_last_reward
    FROM public.user_points up WHERE up.user_id = p_user_id;
  END IF;

  v_hours_left := NULL;

  RETURN QUERY SELECT v_balance, v_daily_reset, v_last_reward, v_hours_left;
END;
$$;

-- ---------------------------------------------------------------------------
-- المستخدمون الحاليون: رفع من بدأوا حالياً برصيد أقل من 50 إلى 50
-- ---------------------------------------------------------------------------
UPDATE public.user_points
SET balance = 50, updated_at = now()
WHERE balance < 50;