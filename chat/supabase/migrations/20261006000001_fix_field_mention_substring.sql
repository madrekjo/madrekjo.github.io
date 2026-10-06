-- =============================================================
-- إصلاح منشن الحقل: لا يصل إشعار لأحد
-- =============================================================
-- شغّل هذا الملف في Supabase SQL Editor (مشروع الدردشة hvrtzzouasqseyswjcex).
--
-- المشكلة (خطأ في 20260930000006_field_mentions.sql):
--   فهرس substring في PostgreSQL يبدأ من 1 وليس 0:
--     substring('field:engineering' FROM 6) = ':engineering'   ← بدأ من الفاصلة
--     substring('field:engineering' FROM 7) = 'engineering'     ← الصحيح
--   الفلانك في المكانين:
--     1) trigger guard_group_mention: v_field = ':engineering'
--        ⇒ NOT IN (...) ⇒ RAISE EXCEPTION 'unknown_mention_group'
--        ⇒ إدراج post_mentions يفشل بالكامل
--        ⇒ العميل يتوقف عند if (error) continue ولا يرسل أي إشعار.
--     2) سياسة "Valid notifications only": pp.field = ':engineering'
--        ⇒ لا يطابق أحد أبداً ⇒ حتى لو نجح الإدراج كانت الإشعارات مرفوضة.
--
-- العَرَض: منشن الحقل يظهر بشكل صحيح في المنشور (الواجهة)، لكن ما يوصل
-- إشعار لأي طالب في ذلك الحقل.
--
-- الإصلاح: استخراج اسم الحقل بـ split_part(… , ':', 2) في المكانين.
-- هذا الملف كامل وآمن لإعادة التشغيل (يغطّي أيضاً لو لم يُنفَّذ 0006).
-- =============================================================

-- -------------------------------------------------------------
-- 1) CHECK: يسمح بمجموعات الحقول (idempotent)
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
-- 2) trigger منشن: يقبل الخمسة حقول (استخراج سليم بالاسم)
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

  -- منشن الجنس: ما بتذكر إلا جنسك
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
    v_field := split_part(NEW.mention_group, ':', 2);
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
-- 3) سياسة الإشعارات: فرع الحقول (استخراج سليم بالاسم)
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
                          AND pp.field = split_part(pm.mention_group, ':', 2))
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
-- تحقّق
-- -------------------------------------------------------------
SELECT split_part('field:engineering', ':', 2) AS expected_field,
       substring('field:engineering' FROM 6)    AS old_buggy_value;
