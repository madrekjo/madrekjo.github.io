-- =============================================================
-- التجديد اليومي للنقاط الساعة 3:00 صباحاً (نهاية نافذة الليل)
-- =============================================================
-- شغّل هذا الملف في Supabase SQL Editor (مشروع الدردشة hvrtzzouasqseyswjcex).
--
-- المشكلة:
--   التجديد كان محسوباً على «24 ساعة من آخر فتح»، يعني المستخدم كان
--   ياخذ الـ100 متى ما فتح الدردشة بعد 24 ساعة (مثلاً 11 بالليل)
--   — ولم تكن تجيهم الساعة 3 بعد ما تروح النافذة.
--
-- الحل:
--   1) الحد اليومي = 3:00 فجراً بتوقيت الأردن. أول فتح بعد 3:00 ⇒
--      الرصيد يرجع 100 + سطر في سجل النقاط.
--   2) مهمة مجدولة (pg_cron) تعيد رصيد الجميع إلى 100 الساعة 3:00
--      بالضبط، حتى لو ما فتحوا الدردشة. لو pg_cron غير متاح،
--      يضل المسار الأول (أول فتح بعد 3:00) كافي.
--
-- ملاحظة: أي حدث بين 0:00 و3:00 (نافذة الليل) ما بيجي فيه تجديد —
--         العطاء يبدأ بعد ما تنتهي النافذة.
-- =============================================================

-- -------------------------------------------------------------
-- 1) الدالة: أول فتح بعد 3:00 ⇒ رصيد 100
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.round_apply_daily_reset(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance    integer;
  v_reset      timestamptz;
  v_cutoff     timestamptz;
  v_new        integer;
  v_base       integer := public.round_base_balance();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- حدّ اليوم = الساعة 3:00 صباحاً بتوقيت الأردن (نهاية نافذة الليل)
  v_cutoff := (date_trunc('day', now() AT TIME ZONE 'Asia/Amman') + INTERVAL '3 hours')
                AT TIME ZONE 'Asia/Amman';

  SELECT balance, daily_reset_at INTO v_balance, v_reset
    FROM public.user_points WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_points (user_id, balance, daily_reset_at)
    VALUES (p_user_id, v_base, now())
    ON CONFLICT (user_id) DO NOTHING;
    RETURN v_base;
  END IF;

  -- لسا ما وصلنا 3:00 فجراً ⇒ ما في تجديد (ننتظر النافذة تروح)
  IF now() < v_cutoff THEN
    RETURN v_balance;
  END IF;

  -- خُتمت حصته لهذا اليوم (فُتح بعد 3:00) ⇒ لا تكرار
  IF v_reset IS NOT NULL AND v_reset >= v_cutoff THEN
    RETURN v_balance;
  END IF;

  -- الرصيد فاضل بالأساس أصلاً ⇒ ختم فقط بدون سطر سجل
  IF v_balance = v_base THEN
    UPDATE public.user_points
       SET daily_reset_at = now(), updated_at = now()
     WHERE user_id = p_user_id;
    RETURN v_balance;
  END IF;

  -- ★ التجديد: الرصيد يرجع 100 عند أول فتح بعد الساعة 3
  v_new := v_base;
  UPDATE public.user_points
     SET balance = v_new, daily_reset_at = now(), updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.point_transactions
    (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES
    (p_user_id, v_new - v_balance, v_new,
     'daily_reset', 'system',
     jsonb_build_object('previous_balance', v_balance,
                        'previous_reset_at', v_reset,
                        'rule', 'reset_at_03_00_amman'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.round_apply_daily_reset(uuid) TO authenticated;

-- -------------------------------------------------------------
-- 2) دالة المسح الليلي: تجديد الجميع الساعة 3:00
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nightly_points_reset()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_base    integer := public.round_base_balance();
  v_cutoff  timestamptz;
  v_reset_n integer := 0;
  v_stamp_n integer := 0;
BEGIN
  v_cutoff := (date_trunc('day', now() AT TIME ZONE 'Asia/Amman') + INTERVAL '3 hours')
                AT TIME ZONE 'Asia/Amman';

  -- حارس: لا يعيد التعيين قبل الساعة 3:00 فجراً
  IF now() < v_cutoff THEN
    RETURN 0;
  END IF;

  -- 2أ) من رصيده أقل من الأساس وفاتت 3:00 ⇒ عدّل + سجل
  WITH due AS (
    SELECT user_id, balance AS old_balance
      FROM public.user_points
     WHERE (daily_reset_at IS NULL OR daily_reset_at < v_cutoff)
       AND balance <> v_base
  ),
  upd AS (
    UPDATE public.user_points up
       SET balance = v_base, daily_reset_at = now(), updated_at = now()
      FROM due d
     WHERE up.user_id = d.user_id
    RETURNING up.user_id
  ),
  logged AS (
    INSERT INTO public.point_transactions
      (user_id, amount, balance_after, transaction_type, source, metadata)
    SELECT d.user_id,
           v_base - d.old_balance,
           v_base,
           'daily_reset',
           'nightly_sweep',
           jsonb_build_object('previous_balance', d.old_balance,
                              'previous_reset_at',
                              (SELECT daily_reset_at FROM public.user_points WHERE user_id = d.user_id),
                              'rule', 'reset_at_03_00_amman')
      FROM due d
    RETURNING user_id
  )
  SELECT COUNT(*) INTO v_reset_n FROM logged;

  -- 2ب) ختم الباقي (اللي رصيدهم الأساس أصلاً)
  UPDATE public.user_points
     SET daily_reset_at = now(), updated_at = now()
   WHERE daily_reset_at IS NULL OR daily_reset_at < v_cutoff;
  GET DIAGNOSTICS v_stamp_n = ROW_COUNT;

  RAISE NOTICE 'تجديد ليلي: % رصيد أُعيد إلى % · % خُتموا', v_reset_n, v_base, v_stamp_n;
  RETURN v_reset_n;
END;
$$;

-- -------------------------------------------------------------
-- 3) جدولة الساعة 3:00 فجراً بتوقيت الأردن (= 00:00 UTC)
-- -------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-points-reset-3am') THEN
      PERFORM cron.schedule(
        'daily-points-reset-3am',
        '0 0 * * *',
        $cron$ SELECT public.nightly_points_reset(); $cron$
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'تعذر جدولة مهمة pg_cron: % — التجديد يبقى على أول فتح بعد 3:00', SQLERRM;
  END;
END $$;

-- -------------------------------------------------------------
-- تحقّق
-- -------------------------------------------------------------
SELECT public.round_base_balance() AS base,
       (date_trunc('day', now() AT TIME ZONE 'Asia/Amman') + INTERVAL '3 hours')
         AT TIME ZONE 'Asia/Amman' AS next_cutoff,
       (SELECT jobname FROM cron.job WHERE jobname = 'daily-points-reset-3am') AS cron_job;
