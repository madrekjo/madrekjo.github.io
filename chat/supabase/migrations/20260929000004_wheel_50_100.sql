-- ============================================================================
-- 20260929000004_wheel_50_100.sql
--
-- إضافة 50 و 100 إلى جوائز عجلة الحظ:
--   5 · 10 · 15 · 20 · 25 · 30 · 40 · 50 · 100   (9 خانات)
--
-- الترتيب لازم يطابق chat/src/lib/wheel.ts حرفياً (WHEEL_PRIZES)
-- لأن العمود i على العجلة = العنصر i بالمصفوفة، والخادم يختار
-- v_slots[1 + floor(random()*n)] ⇒ أي اختلاف ترتيب = العجلة تقف على خانة غير اللي ربحها.
--
-- ★ الملف self-contained: يحتوي نسخة spin_wheel كاملة (سقف 200 + سجل أمين)،
--   فبتشغّل هو لحاله وتكون النتيجة صحيحة حتى لو ما شغّلت 20260929000003.
--   المكرر مع 00003 غير ضار (CREATE OR REPLACE).
--
-- آمن إعادة التشغيل (idempotent).
-- ============================================================================

-- 1) القيد: نوسّعه ليتسع 100 على الأقل
ALTER TABLE public.wheel_prizes DROP CONSTRAINT IF EXISTS wheel_prizes_prize_points_check;
ALTER TABLE public.wheel_prizes
  ADD CONSTRAINT wheel_prizes_prize_points_check CHECK (prize_points BETWEEN 0 AND 1000);

-- 2) دالة السحب: 9 جوائز + سقف 200 + قيد الرصيد + سجل صادق
CREATE OR REPLACE FUNCTION public.spin_wheel()
RETURNS TABLE(success BOOLEAN, prize_points INTEGER, new_balance INTEGER, already_spun BOOLEAN, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_slots INTEGER[] := ARRAY[5, 10, 15, 20, 25, 30, 40, 50, 100];
  v_prize INTEGER;      -- الجائزة المسحوبة (كما توقفت عندها العجلة)
  v_gain  INTEGER;      -- ما دخل الرصيد فعلياً (بعد السقف)
  v_cap   INTEGER;
  v_balance INTEGER;
  v_new INTEGER;
  v_registered BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, FALSE, 'يجب تسجيل الدخول'::TEXT;
    RETURN;
  END IF;

  -- مرة واحدة بحياته: المفتاح الأساسي هو الحماية الذرية
  INSERT INTO public.wheel_prizes (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING TRUE INTO v_registered;

  IF v_registered IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT FALSE, 0, 0, TRUE, 'استخدمت العجلة مسبقاً'::TEXT;
    RETURN;
  END IF;

  v_cap := public.round_max_balance();                  -- 200
  v_prize := v_slots[1 + floor(random() * array_length(v_slots, 1))::INTEGER];

  SELECT balance INTO v_balance
  FROM public.user_points WHERE user_id = v_uid FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, public.round_base_balance())
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_uid FOR UPDATE;
  END IF;

  -- ما يُمنح = المتبقي تحت السقف (نفس قاعدة الجولات)
  v_gain := LEAST(v_prize, GREATEST(v_cap - COALESCE(v_balance, 0), 0));
  v_new  := COALESCE(v_balance, 0) + v_gain;

  UPDATE public.user_points SET balance = v_new, updated_at = now() WHERE user_id = v_uid;

  UPDATE public.wheel_prizes
  SET prize_points = v_prize, claimed_at = now()
  WHERE user_id = v_uid;

  -- السجل أمين: amount = ما دخل فعلاً
  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (v_uid, v_gain, v_new, 'wheel_prize', 'system',
    jsonb_build_object('prize_drawn', v_prize, 'credited', v_gain,
                       'cap', v_cap, 'balance_before', COALESCE(v_balance, 0)));

  RETURN QUERY SELECT TRUE, v_prize, v_new, FALSE, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.spin_wheel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spin_wheel() TO authenticated;

SELECT public.spin_wheel();   -- المتوقّع: success=false + "يجب تسجيل الدخول"
