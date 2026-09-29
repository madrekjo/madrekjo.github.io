-- ============================================================================
-- 20260929000007_fix_instant_daily_reset.sql
--
-- إصلاح: نقاط العجلة (ونقاط الجولات) كانت تُمحى فور كسبها.
--
-- السبب الجذري:
--   round_apply_daily_reset() تُستدعى من get_user_points() — أي عند كل تحميل
--   صفحة وكل refreshPoints() — وشرطها:
--       v_balance <> 50 AND (v_reset IS NULL OR v_reset < now() - 24h)
--   و daily_reset_at لا يُكتب إلا داخل نفس هذا الفرع.
--   ⇒ المستخدم الجديد يبقى daily_reset_at = NULL ⇒ أول ربح (عجلة/جولة)
--     ثم أول قراءة ⇒ المسح يشتغل فوراً ويرجّع الرصيد 50.
--   ⇒ عملياً: كل نقطة تُكتسب تُمحى عند أول تحديث للصفحة.
--
-- الإصلاح:
--   1) NULL = "أول接触" ⇒ ختم الطابع فقط، بلا مسح.
--   2) المسح الحقيقي يصير مرة كل 24 ساعة فعلاً (من يوم الختم الأول).
--   3) ترحيل السجلات القائمة: من بلا ختم ⇒ نختمهم الآن حتى لا يُمسحوا
--      عند أول قراءة بعد هذا الإصلاح.
--
-- ملاحظة: gift العجلة لسا محسوب ضمن الرصيد، فإذا مرّت 24 ساعة على ختم
-- المستخدم بيُمسح ضمن التجديد اليومي المقصود (نفس سلوك الجولات).
-- آمن إعادة التشغيل (idempotent).
-- ============================================================================

-- 1) ختم الصفوف التي بلا طابع (يمنع المسح الفوري التالي)
UPDATE public.user_points
   SET daily_reset_at = now()
 WHERE daily_reset_at IS NULL;

-- 2) تصحيح الدالة نفسها
CREATE OR REPLACE FUNCTION public.round_apply_daily_reset(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_reset   timestamptz;
  v_new     integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT balance, daily_reset_at INTO v_balance, v_reset
    FROM public.user_points WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_points (user_id, balance, daily_reset_at)
    VALUES (p_user_id, public.round_base_balance(), now())
    ON CONFLICT (user_id) DO NOTHING;
    RETURN public.round_base_balance();
  END IF;

  -- ★ الإصلاح: بلا طابع = أول مرة ⇒ ختم فقط، ولا مسح للرصيد.
  IF v_reset IS NULL THEN
    UPDATE public.user_points
       SET daily_reset_at = now(), updated_at = now()
     WHERE user_id = p_user_id;
    RETURN v_balance;
  END IF;

  -- بعد 24 ساعة: المجدول اليومي المقصود (سطر في السجل حتى لا تختفي بلا تفسير)
  v_new := v_balance;
  IF v_balance <> public.round_base_balance()
     AND v_reset < now() - INTERVAL '24 hours' THEN
    v_new := public.round_base_balance();
    UPDATE public.user_points
       SET balance = v_new, daily_reset_at = now(), updated_at = now()
     WHERE user_id = p_user_id;

    INSERT INTO public.point_transactions
      (user_id, amount, balance_after, transaction_type, source, metadata)
    VALUES
      (p_user_id, v_new - v_balance, v_new,
       'daily_reset', 'system',
       jsonb_build_object('previous_balance', v_balance, 'previous_reset_at', v_reset));
  END IF;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.round_apply_daily_reset(uuid) TO authenticated;

-- 3) فحص: لازم يطلع عدد الصفوف التي خُتمت (0 = الكل مختوم أصلاً)
SELECT count(*) FILTER (WHERE daily_reset_at IS NULL) AS still_null FROM public.user_points;
