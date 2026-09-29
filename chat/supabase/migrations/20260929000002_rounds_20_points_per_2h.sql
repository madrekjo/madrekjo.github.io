-- ============================================================================
-- 20260929000002_rounds_20_points_per_2h.sql
--
-- المطلوب: 20 نقطة كل ساعتين من زمن التواجد داخل الجولة (بدل 10).
-- وسقف الرصيد 200 بدل 100 (المستخدم يختار: تتراكم لحد 200).
--
-- السبب: الثوابت كانت 720 ثانية/نقطة = 10 نقاط كل ساعتين،
-- والسقف 100 كان يوقف أي مكافأة بعد ساعتين ونصف (الرصيد 50 → 100).
--
-- 20 نقطة كل ساعتين ⇒ 7200 ÷ 20 = 360 ثانية لكل نقطة (6 دقائق).
-- السقف 200 ⇒ من رصيد 50 يبدأ المتاح = 150 نقطة = 7.5 ساعة حضور.
--
-- التنفيذ: Supabase Dashboard → SQL Editor → Run (يدوي من المالك)
-- آمن إعادة التشغيل (idempotent): الدوال تُستبدل فقط، ولا تُمسّ السجلات.
-- ============================================================================

-- 1) 20 نقطة كل ساعتين = 360 ثانية لكل نقطة
CREATE OR REPLACE FUNCTION public.round_seconds_per_point() RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 360 $$;

-- 2) سقف الرصيد = 200
CREATE OR REPLACE FUNCTION public.round_max_balance() RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 200 $$;

-- 3) الصلاحيات (متطابقة مع الترحيل السابق)
GRANT EXECUTE ON FUNCTION public.round_seconds_per_point() TO authenticated;
GRANT EXECUTE ON FUNCTION public.round_max_balance()        TO authenticated;

-- 4) فحص: المتوقع 360 و 200
SELECT
  public.round_seconds_per_point() AS seconds_per_point,
  public.round_max_balance()        AS max_balance;
