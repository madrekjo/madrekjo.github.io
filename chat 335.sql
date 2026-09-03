-- ============================================================================
-- chat 335.sql — نظام النقاط والرصيد
-- ============================================================================
-- هذا الملف يحتوي على جميع تغييرات قاعدة البيانات لنظام النقاط.
-- يجب تشغيله يدوياً عبر Supabase SQL Editor.
-- لا يُشغّل تلقائياً على Production.
--
-- ماذا يفعل:
-- 1. جدول user_points — رصيد كل مستخدم
-- 2. جدول point_transactions — سجل كل حركة نقاط
-- 3. RPC functions: spend_points, daily_reset_points, grant_points, reward_round_time
-- 4. RLS policies — المستخدم يرى رصيده فقط، لا يキングه
-- 5. Trigger — تهيئة الرصيد عند إنشاء المستخدم
-- 6. Cron — reset يومي في منتصف الليل
-- ============================================================================

-- ============================================================================
-- 1. جدول user_points — رصيد كل مستخدم
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_points (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 30,
  daily_reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_rewarded_round_at TIMESTAMPTZ,
  last_rewarded_round_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;

-- RLS: المستخدم يرى رصيده فقط
DROP POLICY IF EXISTS "Users can view own points" ON public.user_points;
CREATE POLICY "Users can view own points"
  ON public.user_points FOR SELECT
  USING (auth.uid() = user_id);

-- RLS: admins يرون كل الأرصدة
DROP POLICY IF EXISTS "Admins can view all points" ON public.user_points;
CREATE POLICY "Admins can view all points"
  ON public.user_points FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- لا يُسمح بالتعديل المباشر من Frontend — كل التعديلات عبر RPC
-- (لا يوجد INSERT/UPDATE/DELETE policy → العميل لا يستطيع التلاعب)

-- Trigger: تهيئة الرصيد عند إنشاء مستخدم جديد
CREATE OR REPLACE FUNCTION public.initialize_user_points()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_points (user_id, balance)
  VALUES (NEW.id, 30)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_points ON auth.users;
CREATE TRIGGER on_auth_user_created_points
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.initialize_user_points();

-- Trigger: update updated_at
CREATE OR REPLACE FUNCTION public.update_user_points_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_user_points_timestamp ON public.user_points;
CREATE TRIGGER update_user_points_timestamp
  BEFORE UPDATE ON public.user_points
  FOR EACH ROW EXECUTE FUNCTION public.update_user_points_updated_at();


-- ============================================================================
-- 2. جدول point_transactions — سجل كل حركة نقاط
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  source TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

-- RLS: المستخدم يرى معاملاته فقط
DROP POLICY IF EXISTS "Users can view own transactions" ON public.point_transactions;
CREATE POLICY "Users can view own transactions"
  ON public.point_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- RLS: admins يرون كل المعاملات
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.point_transactions;
CREATE POLICY "Admins can view all transactions"
  ON public.point_transactions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS: لا يُسمح بالتعديل المباشر (كل الإضافات عبر RPC)
-- (لا يوجد INSERT/UPDATE/DELETE policy → العميل لا يستطيع التلاعب)

-- فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON public.point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_created_at ON public.point_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_point_transactions_type ON public.point_transactions(transaction_type);


-- ============================================================================
-- 3. RPC: spend_points — خصم النقاط (Atomic)
-- ============================================================================
-- يستخدم للعمليات المدفوعة: Post, Comment, Mention, File, Image, @everyone, Round Message
-- العملية Atomic: تحقق + خصم + سجل في transaction واحدة
--
-- المُدخلات:
--   p_user_id: معرف المستخدم
--   p_amount: عدد النقاط المطلوب خصمها (موجب)
--   p_type: نوع العملية (post, comment, mention, file, image, everyone, round_message)
--   p_source: مصدر العملية (اختياري)
--   p_metadata: بيانات إضافية (اختياري)
--
-- المُخرجات: success (boolean), new_balance (integer), error_message (text)
-- ============================================================================
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
  -- التحقق من أن المبلغ موجب
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'المبلغ يجب أن يكون موجب'::TEXT;
    RETURN;
  END IF;

  -- التحقق من صلاحية المستخدم (Admin/Support لا يخصم منهم)
  SELECT public.has_role(p_user_id, 'admin') INTO v_is_admin;
  SELECT public.has_role(p_user_id, 'moderator') OR public.has_role(p_user_id, 'supervisor') INTO v_is_staff;

  IF v_is_admin OR v_is_staff THEN
    -- Admin/Support: لا خصم، أعد الرصيد الحالي
    SELECT balance INTO v_current_balance FROM public.user_points WHERE user_id = p_user_id;
    RETURN QUERY SELECT TRUE, COALESCE(v_current_balance, 50), NULL::TEXT;
    RETURN;
  END IF;

  -- قفل الصف لمنع race conditions
  SELECT balance INTO v_current_balance
  FROM public.user_points
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- إذا لم يوجد صف نقاط، أنشئ واحداً
  IF v_current_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance)
    VALUES (p_user_id, 30)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_current_balance
    FROM public.user_points
    WHERE user_id = p_user_id
    FOR UPDATE;
  END IF;

  -- التحقق من الرصيد الكافي
  IF v_current_balance < p_amount THEN
    RETURN QUERY SELECT FALSE, v_current_balance,
      format('لا نقاط كافية. رصيدك: %s، المطلوب: %s', v_current_balance, p_amount)::TEXT;
    RETURN;
  END IF;

  -- خصم النقاط
  v_new_balance := v_current_balance - p_amount;
  UPDATE public.user_points SET balance = v_new_balance WHERE user_id = p_user_id;

  -- تسجيل المعاملة
  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (p_user_id, -p_amount, v_new_balance, p_type, p_source, p_metadata);

  RETURN QUERY SELECT TRUE, v_new_balance, NULL::TEXT;
END;
$$;


-- ============================================================================
-- 4. RPC: daily_reset_points — Reset يومي للرصيد
-- ============================================================================
-- يُشغّل مرة واحدة يومياً في منتصف الليل عبر pg_cron
-- يجعل الرصيد = 30 لكل المستخدمين (وليس إضافة 30)
-- إذا كان الرصيد > 30 يُنقص إلى 30
-- إذا كان الرصيد < 30 يُرفع إلى 30
-- ============================================================================
CREATE OR REPLACE FUNCTION public.daily_reset_points()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.user_points
  SET balance = 30,
      daily_reset_at = now()
  WHERE balance != 30;

  -- تسجيل معاملات الـ reset للمستخدمين الذين تغير رصيدهم
  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source)
  SELECT user_id, 0, 30, 'daily_reset', 'system'
  FROM public.user_points
  WHERE daily_reset_at < now() - INTERVAL '23 hours'
  ON CONFLICT DO NOTHING;
END;
$$;


-- ============================================================================
-- 5. RPC: grant_points — منح نقاط من Admin
-- ============================================================================
-- يستخدم فقط للادمن لمنح مستخدم نقاط
-- لا يتجاوز 50 (الحد الأقصى)
-- ============================================================================
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
  -- التحقق من أن المُ Execution هو Admin
  SELECT public.has_role(p_admin_id, 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RETURN QUERY SELECT FALSE, 0, 'فقط المسؤول يمكنه منح النقاط'::TEXT;
    RETURN;
  END IF;

  -- التحقق من أن المبلغ موجب
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'المبلغ يجب أن يكون موجب'::TEXT;
    RETURN;
  END IF;

  -- قفل الصف
  SELECT balance INTO v_current_balance
  FROM public.user_points
  WHERE user_id = p_target_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance) VALUES (p_target_user_id, 30)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_current_balance
    FROM public.user_points WHERE user_id = p_target_user_id FOR UPDATE;
  END IF;

  -- الإضافة مع الحد الأقصى 50
  v_new_balance := LEAST(v_current_balance + p_amount, 50);
  UPDATE public.user_points SET balance = v_new_balance WHERE user_id = p_target_user_id;

  -- تسجيل المعاملة
  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (p_target_user_id, p_amount, v_new_balance, 'admin_grant', 'admin',
    jsonb_build_object('admin_id', p_admin_id, 'reason', p_reason));

  RETURN QUERY SELECT TRUE, v_new_balance, NULL::TEXT;
END;
$$;


-- ============================================================================
-- 6. RPC: reward_round_time — مكافأة المشاركة في الجولة
-- ============================================================================
-- كل ساعتين مكتملتين = +5 نقاط
-- يمنع تكرار المكافأة لنفس الفترة عبر last_rewarded_round_at
-- ============================================================================
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
  -- Admin/Support لا يحتاجون مكافآت
  SELECT public.has_role(p_user_id, 'admin') INTO v_is_admin;
  SELECT public.has_role(p_user_id, 'moderator') OR public.has_role(p_user_id, 'supervisor') INTO v_is_staff;
  IF v_is_admin OR v_is_staff THEN
    SELECT balance INTO v_current_balance FROM public.user_points WHERE user_id = p_user_id;
    RETURN QUERY SELECT TRUE, COALESCE(v_current_balance, 50), 0, NULL::TEXT;
    RETURN;
  END IF;

  -- قفل الصف
  SELECT balance, last_rewarded_round_at, last_rewarded_round_id
  INTO v_current_balance, v_last_rewarded_at, v_last_rewarded_round_id
  FROM public.user_points
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance) VALUES (p_user_id, 30)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance, last_rewarded_round_at, last_rewarded_round_id
    INTO v_current_balance, v_last_rewarded_at, v_last_rewarded_round_id
    FROM public.user_points WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- حساب الوقت المنقضي منذ آخر مكافأة
  -- إذا لم تكن هناك مكافأة سابقة، نحسب من بداية الجولة
  v_elapsed_seconds := EXTRACT(EPOCH FROM (p_ended_at - COALESCE(v_last_rewarded_at, p_started_at)))::BIGINT;

  -- عدد الساعات المكتملة (كل ساعتين = مكافأة واحدة)
  v_eligible_blocks := v_elapsed_seconds / 7200;

  IF v_eligible_blocks < 1 THEN
    RETURN QUERY SELECT FALSE, v_current_balance, 0,
      format('تبقى %s ساعة للحصول على المكافأة التالية', 2 - (v_elapsed_seconds / 3600))::TEXT;
    RETURN;
  END IF;

  -- حساب النقاط: كل блок = +5
  v_points_to_add := v_eligible_blocks * 5;

  -- الحد الأقصى 50
  v_new_balance := LEAST(v_current_balance + v_points_to_add, 50);

  -- تحديث الرصيد ومعلومات آخر مكافأة
  UPDATE public.user_points
  SET balance = v_new_balance,
      last_rewarded_round_at = p_ended_at,
      last_rewarded_round_id = p_round_id
  WHERE user_id = p_user_id;

  -- تسجيل المعاملة
  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (p_user_id, v_points_to_add, v_new_balance, 'round_reward', 'system',
    jsonb_build_object('round_id', p_round_id, 'blocks', v_eligible_blocks, 'hours', v_elapsed_seconds / 3600));

  RETURN QUERY SELECT TRUE, v_new_balance, v_points_to_add, NULL::TEXT;
END;
$$;


-- ============================================================================
-- 7. RPC: get_user_points — جلب الرصيد والمعلومات
-- ============================================================================
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
  -- ملاحظة مهمة: نؤهّل الأعمدة ببادئة الجدول (up.) لأن أسماء أعمدة الإخراج في
  -- RETURNS TABLE (balance, daily_reset_at, last_rewarded_round_at) مطابقة لأعمدة
  -- الجدول، فيحدث تعارض (PPG: column reference "balance" is ambiguous 42702)
  -- تمنع الدالة من العمل نهائياً، فلا يخصم ولا يقرأ الرصيد الصحيح.
  SELECT up.balance, up.daily_reset_at, up.last_rewarded_round_at
  INTO v_balance, v_daily_reset, v_last_reward
  FROM public.user_points up
  WHERE up.user_id = p_user_id;

  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance)
    VALUES (p_user_id, 30)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT up.balance, up.daily_reset_at, up.last_rewarded_round_at
    INTO v_balance, v_daily_reset, v_last_reward
    FROM public.user_points up WHERE up.user_id = p_user_id;
  END IF;

  -- حساب الوقت المتبقي للمكافأة التالية (يحتاج آخر جولة مكتملة)
  v_hours_left := NULL;

  RETURN QUERY SELECT v_balance, v_daily_reset, v_last_reward, v_hours_left;
END;
$$;


-- ============================================================================
-- 8. Cleanup: حذف point_transactions القديمة (>30 يوم)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_point_transactions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.point_transactions
  WHERE created_at < now() - INTERVAL '30 days';
END;
$$;


-- ============================================================================
-- 9. تهيئة المستخدمين الحاليين
-- ============================================================================
-- يُنشئ سجل نقاط لكل مستخدم موجود حالياً برصيد 30
INSERT INTO public.user_points (user_id, balance)
SELECT id, 30
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_points)
ON CONFLICT (user_id) DO NOTHING;


-- ============================================================================
-- 10. Cron Job: Reset يومي في منتصف الليل
-- ============================================================================
-- يُشغّل daily_reset_points مرة واحدة في اليوم
DO $$
BEGIN
  PERFORM cron.unschedule('daily-points-reset');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'daily-points-reset',
  '0 0 * * *',
  $$SELECT public.daily_reset_points();$$
);


-- ============================================================================
-- 11. Cleanup Cron: حذف المعاملات القديمة أسبوعياً
-- ============================================================================
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-point-transactions');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-old-point-transactions',
  '0 3 * * 0',
  $$SELECT public.cleanup_old_point_transactions();$$
);
