-- ============================================================
-- منشن البنات والشباب (منشن جماعي مخصص للجنس) في الدردشة
-- - الشاب يذكر «الشباب» فقط، والفتاة تذكر «البنات» فقط (trigger ضمان).
-- - يختلف عن «الجميع» (للأدمن فقط) — أي عضو يستخدم منشن جنسه.
-- التشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ (أمن إعادة التشغيل)
-- ============================================================

-- (1) عمود مجموعة المنشن
ALTER TABLE public.post_mentions ADD COLUMN IF NOT EXISTS mention_group text;
CREATE INDEX IF NOT EXISTS post_mentions_group_idx ON public.post_mentions(mention_group);

-- (2) قيد الحالات الصالحة: فردي / الجميع / بنات / شباب
ALTER TABLE public.post_mentions DROP CONSTRAINT IF EXISTS post_mentions_all_check;
ALTER TABLE public.post_mentions ADD CONSTRAINT post_mentions_all_check
  CHECK (
    (is_all AND user_id IS NULL AND mention_group IS NULL) OR
    (mention_group IN ('boys', 'girls') AND NOT is_all AND user_id IS NULL) OR
    (NOT is_all AND user_id IS NOT NULL AND mention_group IS NULL)
  );

-- (3) trigger: منشن الجنس لا يستخدمه إلا صاحب الجنس نفسه
CREATE OR REPLACE FUNCTION public.guard_group_mention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_gender text;
BEGIN
  IF NEW.mention_group IS NOT NULL THEN
    IF NEW.mention_group NOT IN ('boys', 'girls') THEN
      RAISE EXCEPTION 'unknown_mention_group';
    END IF;
    SELECT gender INTO actor_gender FROM public.profiles WHERE user_id = NEW.actor_id;
    IF actor_gender IS NULL THEN
      RAISE EXCEPTION 'actor_has_no_gender';
    END IF;
    IF actor_gender <> NEW.mention_group THEN
      RAISE EXCEPTION 'cannot_mention_other_gender';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_group_mention_trigger ON public.post_mentions;
CREATE TRIGGER guard_group_mention_trigger
BEFORE INSERT OR UPDATE OF mention_group ON public.post_mentions
FOR EACH ROW
EXECUTE FUNCTION public.guard_group_mention();

-- (4) سياسة الإشعارات: تسمح بمنشن الجنس لأعضائه
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
                    AND pp.gender = pm.mention_group
                )
              )
            )
        )
      )
      OR (post_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = notifications.user_id))
      OR (comment_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND c.user_id = notifications.user_id))
    )
  );