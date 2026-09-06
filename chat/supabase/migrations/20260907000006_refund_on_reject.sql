-- ============================================================================
-- ★ استرجاع نقاط المنشور المرفوض من إدارة "دردشة الجميع" ★
-- شغّلها من: Supabase → SQL Editor → New Query → Paste → Run
--
-- يعيد كتابة reject_post بحيث: عند رفض الأدمن/المشرف لمنشور معلّق
-- (دفع صاحبه نقاطاً مقابل إنشائه) تُسترجَع له فوراً النقاط المدفوعة
-- (5 نقاط للعادي / 10 مع @everyone) ضمن سقف الرصيد 100.
--
-- الحماية من التكرار:
--   [1] لا يحذف إلا منشور status='pending' → إن حُذف مسبقاً لا يُعوَّض مرة أخرى
--   [2] تُميَّز معاملة الخصم الأصلية بـ metadata.refunded="1" بعملية قفل
--       ذرّية (UPDATE واحد) بحيث تنجح جلسة واحدة فقط في التعويض
--   [3] يبحث عن الخصم عبر metadata->>'postId' المطابق للمنشور
-- ============================================================================

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
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
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

  -- قفل رصيد المستخدم (آمن للسباق) وإضاعة النقاط المسترجعة ضمن سقف 100
  SELECT balance INTO v_balance
  FROM public.user_points
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance)
    VALUES (v_user_id, 50)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_balance
    FROM public.user_points
    WHERE user_id = v_user_id
    FOR UPDATE;
  END IF;

  v_balance := LEAST(v_balance + v_amount, 100);
  UPDATE public.user_points SET balance = v_balance WHERE user_id = v_user_id;

  -- تسجيل معاملة الاسترجاع
  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (v_user_id, v_amount, v_balance, 'post_refund', 'admin_reject',
          jsonb_build_object('postId', p_post_id::text, 'original_txn', v_txn_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_post(uuid) TO authenticated;