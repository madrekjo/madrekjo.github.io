-- ============================================================
-- 20260927000003_daily_50_points_stack.sql
-- (1) منح 50 نقطة لكل المستخدمين الآن.
-- (2) تجديد يومي تلقائي إلى 50 (أول ظهور بعد مرور يوم على آخر
--     تجديد → يرجع الرصيد 50 فوراً، بلا حاجة لأي جدولة).
-- (3) تثبيت مجموعة دوال النقاط المفقودة بالقاعدة (spend_points /
--     get_user_points / grant_points / reward_round_time / publish_post
--     / get_user_email / resolve_user_ids_by_email) بتوقيعات مطابقة
--     للكود المنشور — كانت PGRST202 (function not found) وهي سبب
--     ضياع Logs وأخطاء النقاط والنشر.
-- آمن إعادة التشغيل.
-- ============================================================

-- ---------------------------------------------------------------------------
-- (1) فوري: الكل يرجع إلى 50 الآن
-- ---------------------------------------------------------------------------
UPDATE public.user_points
SET balance = 50,
    daily_reset_at = now()
WHERE balance IS DISTINCT FROM 50;

-- ---------------------------------------------------------------------------
-- (2) إزالة الصيغ القديمة (كانت تقبل user_id من العميل / توقيع قديم)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.spend_points(uuid, integer, text, text, jsonb);
DROP FUNCTION IF EXISTS public.get_user_points(uuid);
DROP FUNCTION IF EXISTS public.grant_points(uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.reward_round_time(uuid, uuid, timestamptz, timestamptz);

-- ---------------------------------------------------------------------------
-- (3) دوال النقاط بالنمط الْآمِن (auth.uid() فقط) — مطابقة للكود
-- ---------------------------------------------------------------------------

-- spend_points: يخصم من صاحب الجلسة فقط
CREATE OR REPLACE FUNCTION public.spend_points(
  p_amount INTEGER,
  p_type TEXT,
  p_source TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_staff BOOLEAN;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'يجب تسجيل الدخول'::TEXT;
    RETURN;
  END IF;
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'المبلغ يجب أن يكون موجب'::TEXT;
    RETURN;
  END IF;

  SELECT public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'moderator')
         OR public.has_role(v_uid, 'supervisor') INTO v_staff;
  IF v_staff THEN
    SELECT balance INTO v_current_balance FROM public.user_points WHERE user_id = v_uid;
    RETURN QUERY SELECT TRUE, COALESCE(v_current_balance, 100), NULL::TEXT;
    RETURN;
  END IF;

  SELECT balance INTO v_current_balance
  FROM public.user_points WHERE user_id = v_uid FOR UPDATE;

  IF v_current_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, 50)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_current_balance
    FROM public.user_points WHERE user_id = v_uid FOR UPDATE;
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN QUERY SELECT FALSE, v_current_balance,
      format('لا نقاط كافية. رصيدك: %s، المطلوب: %s', v_current_balance, p_amount)::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_current_balance - p_amount;
  UPDATE public.user_points SET balance = v_new_balance WHERE user_id = v_uid;

  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (v_uid, -p_amount, v_new_balance, p_type, p_source, p_metadata);

  RETURN QUERY SELECT TRUE, v_new_balance, NULL::TEXT;
END;
$$;

-- get_user_points: رصيد الجلسة + التجديد اليومي التلقائي إلى 50
CREATE OR REPLACE FUNCTION public.get_user_points()
RETURNS TABLE(balance INTEGER, daily_reset_at TIMESTAMPTZ, last_rewarded_round_at TIMESTAMPTZ, next_reward_hours_left NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_balance INTEGER;
  v_daily_reset TIMESTAMPTZ;
  v_last_reward TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::INTEGER, NULL, NULL, NULL::NUMERIC;
    RETURN;
  END IF;

  INSERT INTO public.user_points (user_id, balance)
  VALUES (v_uid, 50)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT up.balance, up.daily_reset_at, up.last_rewarded_round_at
  INTO v_balance, v_daily_reset, v_last_reward
  FROM public.user_points up WHERE up.user_id = v_uid;

  -- مرّ يوم كامل (23 ساعة) من آخر تجديد والرصيد أقل من 50 → يرجع 50 الآن
  IF v_balance <> 50
     AND (v_daily_reset IS NULL OR v_daily_reset < now() - INTERVAL '23 hours') THEN
    UPDATE public.user_points
    SET balance = 50, daily_reset_at = now()
    WHERE user_id = v_uid;
    v_balance := 50;
    v_daily_reset := now();
  END IF;

  RETURN QUERY SELECT v_balance, v_daily_reset, v_last_reward, NULL::NUMERIC;
END;
$$;

-- grant_points: الأدمن (من الجلسة) يمنح غيره فقط — السقف 100
CREATE OR REPLACE FUNCTION public.grant_points(
  p_target_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin') THEN
    RETURN QUERY SELECT FALSE, 0, 'فقط المسؤول يمكنه منح النقاط'::TEXT;
    RETURN;
  END IF;
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'المبلغ يجب أن يكون موجب'::TEXT;
    RETURN;
  END IF;

  SELECT balance INTO v_current_balance
  FROM public.user_points WHERE user_id = p_target_user_id FOR UPDATE;
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
    jsonb_build_object('admin_id', v_admin_id, 'reason', p_reason));

  RETURN QUERY SELECT TRUE, v_new_balance, NULL::TEXT;
END;
$$;

-- reward_round_time: مكافأة الجلسة نفسها فقط (ساعتان = +10)
CREATE OR REPLACE FUNCTION public.reward_round_time(
  p_round_id UUID,
  p_started_at TIMESTAMPTZ,
  p_ended_at TIMESTAMPTZ
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, points_earned INTEGER, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_current_balance INTEGER;
  v_last_rewarded_at TIMESTAMPTZ;
  v_elapsed_seconds BIGINT;
  v_eligible_blocks INTEGER;
  v_points_to_add INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'يجب تسجيل الدخول'::TEXT;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.round_participants rp
             WHERE rp.round_id = p_round_id AND rp.user_id = v_uid) IS NOT TRUE THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'لست عضواً في هذه الجولة'::TEXT;
    RETURN;
  END IF;

  SELECT balance, last_rewarded_round_at INTO v_current_balance, v_last_rewarded_at
  FROM public.user_points WHERE user_id = v_uid FOR UPDATE;

  IF v_current_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, 50)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance, last_rewarded_round_at INTO v_current_balance, v_last_rewarded_at
    FROM public.user_points WHERE user_id = v_uid FOR UPDATE;
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
  SET balance = v_new_balance, last_rewarded_round_at = p_ended_at
  WHERE user_id = v_uid;

  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (v_uid, v_points_to_add, v_new_balance, 'round_reward', 'system',
    jsonb_build_object('round_id', p_round_id, 'blocks', v_eligible_blocks));

  RETURN QUERY SELECT TRUE, v_new_balance, v_points_to_add, NULL::TEXT;
END;
$$;

-- release: حذف حقيقي ذري (مع خصم النقاط والنشر)
CREATE OR REPLACE FUNCTION public.publish_post(
  p_content text,
  p_channel text,
  p_image_url text DEFAULT NULL,
  p_image_urls text[] DEFAULT NULL,
  p_video_url text DEFAULT NULL
)
RETURNS TABLE(id uuid, status text, error_message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_staff boolean := false;
  v_needs_review boolean := false;
  v_locked boolean := false;
  v_cost integer := 5;
  v_spend record;
  v_content text;
  v_channel text;
  v_post_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'يجب تسجيل الدخول'::text; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = v_uid
             AND (p.chat_banned = true OR p.is_banned = true)) THEN
    RETURN QUERY SELECT NULL, NULL, 'لا يمكنك النشر — حسابك محظور'::text; RETURN;
  END IF;

  v_content := left(btrim(coalesce(nullif(p_content, ''), '')), 2000);
  IF char_length(v_content) < 1 THEN
    RETURN QUERY SELECT NULL, NULL, 'اكتب نص المنشور أولاً'::text; RETURN;
  END IF;

  v_channel := coalesce(nullif(btrim(coalesce(p_channel, '')), ''), 'all');
  IF v_channel NOT IN ('all', 'male', 'female', '09', '10') THEN
    RETURN QUERY SELECT NULL, NULL, 'قناة غير معروفة'::text; RETURN;
  END IF;

  IF public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'moderator')
     OR public.has_role(v_uid, 'supervisor') THEN
    v_staff := true;
  ELSE
    IF v_channel = 'all' THEN v_needs_review := true; END IF;
    SELECT (EXISTS (SELECT 1 FROM public.channel_settings cs WHERE cs.channel = v_channel AND cs.enabled = false)
            OR EXISTS (SELECT 1 FROM public.section_locks sl
                       WHERE sl.section = CASE v_channel WHEN 'all' THEN 'chat_all'
                                                     WHEN '09' THEN 'chat_09'
                                                     WHEN '10' THEN 'chat_10' ELSE '' END
                         AND sl.locked = true
                         AND (sl.locked_until IS NULL OR sl.locked_until > now())))
    INTO v_locked;
    IF v_locked THEN
      RETURN QUERY SELECT NULL, NULL, 'هذه القناة مقفلة حالياً من قبل الإدارة — لا يمكن النشر فيها'::text; RETURN;
    END IF;
  END IF;

  IF NOT v_staff THEN
    IF position('[user:everyone]' in v_content) > 0 THEN v_cost := 10; END IF;
    SELECT * INTO v_spend FROM public.spend_points(v_cost, 'post', 'chat',
      jsonb_build_object('content_prefix', left(v_content, 60)));
    IF NOT v_spend.success THEN
      RETURN QUERY SELECT NULL, NULL, coalesce(v_spend.error_message, 'لا نقاط كافية')::text; RETURN;
    END IF;
  END IF;

  INSERT INTO public.posts (user_id, content, image_url, image_urls, video_url, channel, status)
  VALUES (v_uid, v_content,
          NULLIF(left(coalesce(p_image_url, ''), 500), ''),
          CASE WHEN coalesce(array_length(p_image_urls, 1), 0) > 0 THEN p_image_urls ELSE NULL END,
          NULLIF(left(coalesce(p_video_url, ''), 500), ''),
          v_channel,
          CASE WHEN v_needs_review THEN 'pending' ELSE 'approved' END)
  RETURNING id INTO v_post_id;

  RETURN QUERY SELECT v_post_id, CASE WHEN v_needs_review THEN 'pending' ELSE 'approved' END, NULL::text;
END;
$$;

-- get_user_email: البريد يُقرأ للأدمن فقط عبر RPC محمي
CREATE OR REPLACE FUNCTION public.get_user_email(_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_email TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NULL;
  END IF;
  SELECT email INTO result_email FROM auth.users WHERE id = _user_id;
  RETURN result_email;
END;
$$;

-- resolve_user_ids_by_email: حلّ معرّفات بالبريد دون تسريب البريد
CREATE OR REPLACE FUNCTION public.resolve_user_ids_by_email(p_emails text[])
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT user_id FROM public.profiles WHERE email = ANY(p_emails) AND email IS NOT NULL;
$$;

-- ---------------------------------------------------------------------------
-- (4) صلاحيات: فقط authenticated يستدعي
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.spend_points(integer, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_points() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_points(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reward_round_time(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_post(text, text, text, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_user_ids_by_email(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spend_points(integer, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_points() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_points(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reward_round_time(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_post(text, text, text, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_ids_by_email(text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- (5) تأكيد (يظهر بالـ SQL Editor)
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS total_users, COUNT(*) FILTER (WHERE balance = 50) AS at_50
FROM public.user_points;