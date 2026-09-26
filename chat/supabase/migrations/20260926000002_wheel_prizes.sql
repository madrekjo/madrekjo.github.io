-- ============================================================================
-- SUPABASE SQL EDITOR — شغّل هذا الملف يدوياً
-- المشروع الحي: chat (hvrtzzouasqseyswjcex)
-- الرابط: https://supabase.com/dashboard/project/hvrtzzouasqseyswjcex/sql-editor
-- ============================================================================
-- عجلة الجوائز بالنقاط — مرة واحدة لكل مستخدم بالحياة.
--
--   * جدول wheel_prizes: صف واحد لكل مستخدم (المفتاح الأساسي user_id) — وهذا
--     وحده يفرض "الاستخدام الواحد": أي محاولة إعادة إدخال تصطدم بالمفتاح.
--   * spin_wheel(): يوزّع جائزة عشوائية من (5,10,15,20,25,30,40) ويضيفها للنقاط
--     بحدّ أقصى 100، ويسجّل حركة point_transactions.
--   * get_wheel_status(): هل جرّب المستخدم العجلة مسبقاً؟
--   آمنة ضد الدخول المتكرر: المفتاح الأساسي + RLS قراءة "الصف الخاص" فقط.
-- ============================================================================

-- 1) الجدول — صار المفتاح الأساسي هو الحماية الذرية من التكرار
CREATE TABLE IF NOT EXISTS public.wheel_prizes (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prize_points INTEGER NOT NULL DEFAULT 0 CHECK (prize_points BETWEEN 0 AND 100),
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wheel_prizes ENABLE ROW LEVEL SECURITY;

-- قراءة صفّ المستخدم فقط (لا يُكتب إلا عبر الدالة)
DROP POLICY IF EXISTS "wheel status own row" ON public.wheel_prizes;
CREATE POLICY "wheel status own row"
  ON public.wheel_prizes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2) دالة السحب الذري (استخدام واحد مضمون من الخادم)
CREATE OR REPLACE FUNCTION public.spin_wheel()
RETURNS TABLE(success BOOLEAN, prize_points INTEGER, new_balance INTEGER, already_spun BOOLEAN, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_slots INTEGER[] := ARRAY[5, 10, 15, 20, 25, 30, 40];
  v_prize INTEGER;
  v_balance INTEGER;
  v_new INTEGER;
  v_registered BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, FALSE, 'يجب تسجيل الدخول'::TEXT;
    RETURN;
  END IF;

  -- التسجيل أحادي: الصف الثاني سيصطدم بالمفتاح الأساسي → يعتبر مستخدماً مسبقاً
  INSERT INTO public.wheel_prizes (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING TRUE INTO v_registered;

  IF v_registered IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT FALSE, 0, 0, TRUE, 'استخدمت العجلة مسبقاً'::TEXT;
    RETURN;
  END IF;

  v_prize := v_slots[1 + floor(random() * array_length(v_slots, 1))::INTEGER];

  SELECT balance INTO v_balance
  FROM public.user_points WHERE user_id = v_uid FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, 50)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_balance
    FROM public.user_points WHERE user_id = v_uid FOR UPDATE;
  END IF;

  v_new := LEAST(COALESCE(v_balance, 0) + v_prize, 100);
  UPDATE public.user_points SET balance = v_new WHERE user_id = v_uid;
  UPDATE public.wheel_prizes
  SET prize_points = v_prize, claimed_at = now()
  WHERE user_id = v_uid;

  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (v_uid, v_prize, v_new, 'wheel_prize', 'system',
    jsonb_build_object('claimed_at', now()));

  RETURN QUERY SELECT TRUE, v_prize, v_new, FALSE, NULL::TEXT;
END;
$$;

-- 3) هل استخدم العجلة مسبقاً؟
CREATE OR REPLACE FUNCTION public.get_wheel_status()
RETURNS TABLE(spun BOOLEAN, prize_points INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT TRUE, wp.prize_points
    FROM public.wheel_prizes wp
    WHERE wp.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER;
  END IF;
END;
$$;

-- 4) الصلاحيات
REVOKE ALL ON FUNCTION public.spin_wheel() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_wheel_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spin_wheel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wheel_status() TO authenticated;

DO $$ BEGIN RAISE NOTICE '✅ عجلة الجوائز جاهزة'; END $$;