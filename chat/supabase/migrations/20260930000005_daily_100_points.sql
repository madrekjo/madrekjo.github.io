-- =============================================================
-- الرصيد اليومي: 100 نقطة بدل 50
-- (تُمنح/تتجدد عند أول فتح للدردشة، وكل 24 ساعة بعدها)
-- =============================================================
-- شغّل هذا الملف في Supabase SQL Editor (مشروع الدردشة hvrtzzouasqseyswjcex).
--
-- شو بيعمل:
--   1) round_base_balance() = 100  ← المصدر الوحيد، وكل شي تبعه
--      (تجديد 24 ساعة، مستخدم جديد، أول تسجيل)
--   2) default عمود balance = 100  ← كل صف جديد يبدأ بـ100
--   3) trigger التسجيل ي init بـ round_base_balance بدل الرقم 50
--   4) يرفع رصيد المستخدمين الموجودين من 50 إلى 100 (محدَّث فقط)
--   5) يوحّد الأسقف القديمة المكتوبة يدوياً (100) على round_max_balance()
--      = 200، فمكافأة الدعوة والاسترجاع ما توقفت عند 100
--
-- ملاحظة: السقف ما زال 200 → 100 أساس + 100 من الجولات/العجلة.
-- =============================================================

-- -------------------------------------------------------------
-- 1) المصدر الوحيد: 100
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.round_base_balance() RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 100 $$;

-- -------------------------------------------------------------
-- 2) الافتراضي عند إنشاء الصف (مستخدم جديد)
-- -------------------------------------------------------------
ALTER TABLE public.user_points
  ALTER COLUMN balance SET DEFAULT 100;

-- -------------------------------------------------------------
-- 3) trigger التسجيل (رقم 50 المقسور → round_base_balance)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.initialize_user_points()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_points (user_id, balance)
  VALUES (NEW.id, public.round_base_balance())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- -------------------------------------------------------------
-- 4) ارفع رصيد المستخدمين الحاليين إلى الأساس الجديد
--    (اللي رصيدهم أقل من 100 فقط — اللي عندهم أكثر ما بنمسّهم)
-- -------------------------------------------------------------
DO $$
DECLARE
  v_base integer := public.round_base_balance();
  v_n    integer := 0;
BEGIN
  WITH pre AS (
    SELECT user_id, balance AS old_balance
      FROM public.user_points
     WHERE balance < v_base
  ),
  upd AS (
    UPDATE public.user_points u
       SET balance = v_base, updated_at = now()
      FROM pre
     WHERE u.user_id = pre.user_id
    RETURNING u.user_id
  ),
  logged AS (
    INSERT INTO public.point_transactions
      (user_id, amount, balance_after, transaction_type, source, metadata)
    SELECT pre.user_id,
           v_base - pre.old_balance,
           v_base,
           'daily_reset',
           'system',
           jsonb_build_object('reason', 'daily_base_50_to_100')
      FROM pre
    RETURNING user_id
  )
  SELECT COUNT(*) INTO v_n FROM logged;

  RAISE NOTICE 'تم رفع رصيد % صف إلى % نقطة', v_n, v_base;
END $$;

-- -------------------------------------------------------------
-- 5) توحيد الأسقف القديمة المكتوبة يدوياً (100) على round_max_balance
-- -------------------------------------------------------------

-- مكافأة الدعوة +25  (كانت تسقف عند 100)
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

  IF v_row.used_count <= v_row.rewarded_uses THEN
    RETURN QUERY SELECT FALSE, v_row.created_by, NULL::INTEGER, 0;
    RETURN;
  END IF;

  SELECT public.has_role(v_row.created_by, 'admin') INTO v_admin;
  SELECT public.has_role(v_row.created_by, 'moderator')
      OR public.has_role(v_row.created_by, 'supervisor') INTO v_staff;
  IF v_admin OR v_staff THEN
    UPDATE public.access_codes SET rewarded_uses = used_count WHERE id = v_row.id;
    RETURN QUERY SELECT TRUE, v_row.created_by, 100, 0;
    RETURN;
  END IF;

  SELECT balance INTO v_balance FROM public.user_points
  WHERE user_id = v_row.created_by FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance)
    VALUES (v_row.created_by, public.round_base_balance())
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_balance FROM public.user_points
    WHERE user_id = v_row.created_by;
  END IF;

  v_added := LEAST(v_balance + 25, public.round_max_balance()) - v_balance;
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

-- استرجاع نقاط منشور مرفوض (كان سقفه 100، ومكتوب بـ50 في الفراغ)
CREATE OR REPLACE FUNCTION public.reject_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount INTEGER;
  v_balance INTEGER;
  v_txn_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)
          OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- حذف نهائي للمنشور المُرفَض (لم يُنشر بعد أصلاً)
  DELETE FROM public.posts WHERE id = p_post_id AND status = 'pending';

  -- لم يُحذف أي شيء (مرفوض/محذوف مسبقاً) → لا تعويض
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- البحث عن معاملة الخصم الخاصة بهذا المنشور (post أو everyone) غير المسترجع
  SELECT id INTO v_txn_id
  FROM public.point_transactions
  WHERE amount < 0
    AND transaction_type IN ('post', 'everyone')
    AND metadata->>'postId' = p_post_id::text
    AND (metadata->>'refunded' IS NULL OR metadata->>'refunded' <> '1')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_txn_id IS NULL THEN
    RETURN;
  END IF;

  -- قفل ذرّي: جلسة واحدة فقط تنجح في وسم المعاملة كمسترجعة
  UPDATE public.point_transactions
  SET metadata = COALESCE(metadata, '{}') || '{"refunded": "1"}'::jsonb
  WHERE id = v_txn_id
    AND (metadata->>'refunded' IS NULL OR metadata->>'refunded' <> '1')
  RETURNING user_id, abs(amount) INTO v_user_id, v_amount;

  IF NOT FOUND OR v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- قفل رصيد المستخدم (آمن للسباق) وإضاعة النقاط المسترجعة ضمن السقف الرسمي
  SELECT balance INTO v_balance
  FROM public.user_points
  WHERE user_id = v_user_id
    FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance)
    VALUES (v_user_id, public.round_base_balance())
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_balance FROM public.user_points
    WHERE user_id = v_user_id
      FOR UPDATE;
  END IF;

  v_balance := LEAST(v_balance + v_amount, public.round_max_balance());
  UPDATE public.user_points SET balance = v_balance WHERE user_id = v_user_id;

  -- تسجيل معاملة الاسترجاع
  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (v_user_id, v_amount, v_balance, 'post_refund', 'admin_reject',
          jsonb_build_object('postId', p_post_id::text, 'original_txn', v_txn_id));
END;
$$;

-- -------------------------------------------------------------
-- تحقّق
-- -------------------------------------------------------------
SELECT public.round_base_balance() AS base_100,
       public.round_max_balance()  AS max_200,
       (SELECT COUNT(*) FROM public.user_points WHERE balance < public.round_base_balance()) AS remaining_below_100;
