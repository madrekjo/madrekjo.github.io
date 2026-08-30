-- ============================================================================
-- chat25.sql — منشن "الجميع" للجميع (مميز للأدمن فقط)
-- يشغَّل يدوياً بعد تشغيل migration المنشن 20260830000003
-- ============================================================================
ALTER TABLE public.post_mentions ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.post_mentions ADD COLUMN IF NOT EXISTS is_all BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.post_mentions DROP CONSTRAINT IF EXISTS post_mentions_all_check;
ALTER TABLE public.post_mentions ADD CONSTRAINT post_mentions_all_check
  CHECK ((is_all AND user_id IS NULL) OR (NOT is_all AND user_id IS NOT NULL));

CREATE OR REPLACE FUNCTION public.guard_all_mention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_all AND NOT public.has_role(NEW.actor_id, 'admin') THEN
    RAISE EXCEPTION 'only_admins_can_mention_all';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_all_mention_trigger ON public.post_mentions;
CREATE TRIGGER guard_all_mention_trigger
BEFORE INSERT OR UPDATE OF is_all ON public.post_mentions
FOR EACH ROW
EXECUTE FUNCTION public.guard_all_mention();