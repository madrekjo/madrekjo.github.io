
-- Update cleanup: soft-deleted items removed after 1 day; rounds removed after 10 days
CREATE OR REPLACE FUNCTION public.delete_old_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Hard delete posts/comments older than 24h
  DELETE FROM public.notifications WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.likes WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comments WHERE created_at < now() - INTERVAL '24 hours';
  DELETE FROM public.posts WHERE created_at < now() - INTERVAL '24 hours';

  -- Also remove anything soft-deleted more than 1 day ago (safety)
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day';
  DELETE FROM public.notifications WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.likes WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.comments WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day';
END;
$function$;

-- New function: delete old rounds (>10 days)
CREATE OR REPLACE FUNCTION public.delete_old_rounds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.round_chat WHERE round_id IN (SELECT id FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days');
  DELETE FROM public.round_participants WHERE round_id IN (SELECT id FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days');
  DELETE FROM public.round_completions WHERE round_id IN (SELECT id FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days');
  DELETE FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days';
END;
$function$;

DO $$
BEGIN PERFORM cron.unschedule('cleanup-old-rounds-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'cleanup-old-rounds-daily',
  '30 3 * * *',
  $$SELECT public.delete_old_rounds();$$
);

-- Allow admins/moderators to view all round chat messages
DROP POLICY IF EXISTS "Round members can view chat" ON public.round_chat;
CREATE POLICY "Round members or staff can view chat"
ON public.round_chat
FOR SELECT
TO authenticated
USING (
  public.is_round_member(round_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
);

-- Also allow staff to view all rounds (even those they're not part of)
DROP POLICY IF EXISTS "Rounds viewable by everyone" ON public.study_rounds;
CREATE POLICY "Rounds viewable by everyone"
ON public.study_rounds
FOR SELECT
TO public
USING (true);

SELECT public.delete_old_rounds();
