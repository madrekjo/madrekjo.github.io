-- =============================================================
-- منشن الحقل: منشن يذهب لكل أعضاء حقل واحد (هندسي/صحي/لغات/أعمال/قانون)
-- =============================================================
-- شغّل هذا الملف في Supabase SQL Editor (مشروع الدردشة hvrtzzouasqseyswjcex).
--
--   1) يسمح لمجموعات الحقول في post_mentions (mention_group = 'field:xxx')
--   2) trigger المنشن: أي حقل مسموح (بعكس منشن الجنس = جنسك فقط)
--   3) سياسة الإشعارات: يسمح بإشعار كل من ينتمي للحقل المذكور
--   4) فهرس على profiles(field) لسرعة بث الإشعارات
--   5) إصلاحان مرافقان:
--      - publish_post: منشن الشباب/البنات صار يكلّف 10 فعلاً (كان العميل يطلب 10 والخادم يخصم 5)
--      - spend_points: مستخدم بلا صف نقاط يبدأ بـ round_base_balance (100) بدل الرقم 50 القديم
--
-- التكلفة: منشن الحقل = max(سعر الرسالة, 3) → منشور 5 · تعليق 3 (يحسبه العميل من التوكن)
-- =============================================================

-- -------------------------------------------------------------
-- 1) CHECK يسمح بمجموعات الحقول
-- -------------------------------------------------------------
ALTER TABLE public.post_mentions DROP CONSTRAINT IF EXISTS post_mentions_all_check;
ALTER TABLE public.post_mentions ADD CONSTRAINT post_mentions_all_check
  CHECK (
    (is_all AND user_id IS NULL AND mention_group IS NULL) OR
    (
      NOT is_all AND user_id IS NULL AND (
        mention_group IN ('boys', 'girls')
        OR mention_group IN ('field:medical', 'field:engineering',
                             'field:languages', 'field:business', 'field:law')
      )
    ) OR
    (NOT is_all AND user_id IS NOT NULL AND mention_group IS NULL)
  );

-- -------------------------------------------------------------
-- 2) trigger منشن: الحقول مفتوحة للجميع، والجنس مقصور على جنسك
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_group_mention()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor_gender text;
  v_field     text;
BEGIN
  IF NEW.mention_group IS NULL THEN
    RETURN NEW;
  END IF;

  -- منشن الجنس: ما بتذكر إلا جنسك (سلوك قديم — محفوظ)
  IF NEW.mention_group IN ('boys', 'girls') THEN
    SELECT gender INTO actor_gender FROM public.profiles WHERE user_id = NEW.actor_id;
    IF actor_gender IS NULL THEN
      RAISE EXCEPTION 'actor_has_no_gender';
    END IF;
    IF actor_gender <> NEW.mention_group THEN
      RAISE EXCEPTION 'cannot_mention_other_gender';
    END IF;
    RETURN NEW;
  END IF;

  -- منشن الحقل: أي مستخدم يقدر يذكر أي حقل من الخمسة
  IF NEW.mention_group LIKE 'field:%' THEN
    v_field := substring(NEW.mention_group FROM 6);
    IF v_field NOT IN ('medical', 'engineering', 'languages', 'business', 'law') THEN
      RAISE EXCEPTION 'unknown_mention_group';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'unknown_mention_group';
END;
$$;

DROP TRIGGER IF EXISTS guard_group_mention_trigger ON public.post_mentions;
CREATE TRIGGER guard_group_mention_trigger
BEFORE INSERT OR UPDATE OF mention_group ON public.post_mentions
FOR EACH ROW EXECUTE FUNCTION public.guard_group_mention();

-- -------------------------------------------------------------
-- 3) سياسة الإشعارات: فرع الحقول
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "Valid notifications only" ON public.notifications;
CREATE POLICY "Valid notifications only" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = actor_id
    AND user_id <> actor_id
    AND (
      (
        type = 'mention'
        AND EXISTS (
          SELECT 1 FROM public.post_mentions pm
          WHERE pm.actor_id = auth.uid()
            AND pm.post_id IS NOT DISTINCT FROM notifications.post_id
            AND pm.comment_id IS NOT DISTINCT FROM notifications.comment_id
            AND (
              pm.user_id = notifications.user_id
              OR pm.is_all
              OR (
                pm.mention_group IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM public.profiles pp
                  WHERE pp.user_id = notifications.user_id
                    AND (
                      pp.gender = pm.mention_group
                      OR (pm.mention_group LIKE 'field:%'
                          AND pp.field = substring(pm.mention_group FROM 6))
                    )
                )
              )
            )
        )
      )
      OR (post_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = notifications.user_id))
      OR (comment_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND c.user_id = notifications.user_id))
    )
  );

-- -------------------------------------------------------------
-- 4) فهرس الحقل (يسرّع بثّ إشعارات منشن الحقل)
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_field
  ON public.profiles (field)
  WHERE field IS NOT NULL;

-- -------------------------------------------------------------
-- 5) إصلاحات مرافقة
-- -------------------------------------------------------------
-- 5أ) منشن الجنس صار يكلّف 10 فعلياً (العميل كان يطلب 10 والخادم يخصم 5)
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
  v_post_id uuid := gen_random_uuid();
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
    -- منشن الجميع أو منشن الجنس (الشباب/البنات) = 10 نقاط.
    -- منشن الحقل (field:xxx) لا يغيّر التكلفة: سعر المنشور 5 وهو أعلى من 3.
    IF position('[user:everyone]' in v_content) > 0
       OR position('[user:boys]' in v_content) > 0
       OR position('[user:girls]' in v_content) > 0 THEN
      v_cost := 10;
    END IF;
    SELECT * INTO v_spend FROM public.spend_points(v_cost, 'post', 'chat',
      jsonb_build_object('content_prefix', left(v_content, 60)));
    IF NOT v_spend.success THEN
      RETURN QUERY SELECT NULL, NULL, coalesce(v_spend.error_message, 'لا نقاط كافية')::text; RETURN;
    END IF;
  END IF;

  INSERT INTO public.posts (id, user_id, content, image_url, image_urls, video_url, channel, status)
  VALUES (v_post_id, v_uid, v_content,
          NULLIF(left(coalesce(p_image_url, ''), 500), ''),
          CASE WHEN coalesce(array_length(p_image_urls, 1), 0) > 0 THEN p_image_urls ELSE NULL END,
          NULLIF(left(coalesce(p_video_url, ''), 500), ''),
          v_channel,
          CASE WHEN v_needs_review THEN 'pending' ELSE 'approved' END);

  RETURN QUERY SELECT v_post_id, CASE WHEN v_needs_review THEN 'pending' ELSE 'approved' END, NULL::text;
END;
$$;

-- 5ب) الرصيد الابتدائي عند غياب الصف = الأساس الرسمي
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
    INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, public.round_base_balance())
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

-- -------------------------------------------------------------
-- تحقّق
-- -------------------------------------------------------------
SELECT 'field mention ready' AS status,
       'field:engineering'::text AS example,
       'cost: max(base,3)'::text AS pricing;
