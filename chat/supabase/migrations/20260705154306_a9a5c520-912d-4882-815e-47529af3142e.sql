
-- Fix 1: round_completions must require membership
DROP POLICY IF EXISTS "User can insert own completion" ON public.round_completions;
DROP POLICY IF EXISTS "Users can insert own completion" ON public.round_completions;
CREATE POLICY "User can insert own completion" ON public.round_completions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_round_member(round_id, auth.uid())
  );

-- Fix 2: server-side section lock enforcement
CREATE OR REPLACE FUNCTION public.check_section_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.section_locks
    WHERE section = TG_ARGV[0]
      AND locked = true
      AND (locked_until IS NULL OR locked_until > now())
  ) THEN
    RAISE EXCEPTION 'section_locked';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_chat_lock_posts ON public.posts;
CREATE TRIGGER enforce_chat_lock_posts
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('chat');

DROP TRIGGER IF EXISTS enforce_chat_lock_comments ON public.comments;
CREATE TRIGGER enforce_chat_lock_comments
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('chat');

DROP TRIGGER IF EXISTS enforce_suggestions_lock ON public.suggestions;
CREATE TRIGGER enforce_suggestions_lock
  BEFORE INSERT ON public.suggestions
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('suggestions');

DROP TRIGGER IF EXISTS enforce_suggestions_lock_replies ON public.suggestion_replies;
CREATE TRIGGER enforce_suggestions_lock_replies
  BEFORE INSERT ON public.suggestion_replies
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('suggestions');

DROP TRIGGER IF EXISTS enforce_changes_lock ON public.changes_messages;
CREATE TRIGGER enforce_changes_lock
  BEFORE INSERT ON public.changes_messages
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('changes');

DROP TRIGGER IF EXISTS enforce_schedules_lock ON public.schedule_comments;
CREATE TRIGGER enforce_schedules_lock
  BEFORE INSERT ON public.schedule_comments
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('schedules');

DROP TRIGGER IF EXISTS enforce_schedules_lock_uploads ON public.schedules;
CREATE TRIGGER enforce_schedules_lock_uploads
  BEFORE INSERT ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('schedules');

DROP TRIGGER IF EXISTS enforce_rounds_lock ON public.study_rounds;
CREATE TRIGGER enforce_rounds_lock
  BEFORE INSERT ON public.study_rounds
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('rounds');
