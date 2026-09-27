-- ============================================================
-- 20260927000002_daily_50_points.sql
-- 1) منحَ 50 نقطة لكل المستخدمين الآن (إعادة ضبط فورية).
-- 2) تجديد يومي تلقائي إلى 50: أول ما يفتح المستخدم التطبيق
--    بعد مرور يوم (23 ساعة) على آخر تجديد → يصير رصيده 50 فوراً،
--    بلا حاجة لجدولة أو كرون.
-- ============================================================

-- ---------------------------------------------------------------------------
-- (1) فوري: الكل يرجع إلى 50 الآن
-- ---------------------------------------------------------------------------
UPDATE public.user_points
SET balance = 50,
    daily_reset_at = now()
WHERE balance IS DISTINCT FROM 50;

-- ---------------------------------------------------------------------------
-- (2) get_user_points: يعيد الضبط تلقائياً عند مرور يوم على آخر تجديد
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
    INSERT INTO public.user_points (user_id, balance, daily_reset_at)
    VALUES (p_user_id, 50, now())
    ON CONFLICT (user_id) DO NOTHING;
    SELECT up.balance, up.daily_reset_at, up.last_rewarded_round_at
    INTO v_balance, v_daily_reset, v_last_reward
    FROM public.user_points up WHERE up.user_id = p_user_id;
  ELSIF v_balance <> 50
    AND (v_daily_reset IS NULL OR v_daily_reset < now() - INTERVAL '23 hours') THEN
    -- مرّ يوم كامل ووراءه: تجديد تلقائي إلى 50
    UPDATE public.user_points
    SET balance = 50,
        daily_reset_at = now()
    WHERE user_id = p_user_id;
    v_balance := 50;
    v_daily_reset = now();
  END IF;

  v_hours_left := NULL;

  RETURN QUERY SELECT v_balance, v_daily_reset, v_last_reward, v_hours_left;
END;
$$;

-- ---------------------------------------------------------------------------
-- تأكيد: كم مستخدماً صار رصيده 50؟ (النتيجة بتظهر بـ SQL Editor)
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS total_users, COUNT(*) FILTER (WHERE balance = 50) AS at_50
FROM public.user_points;