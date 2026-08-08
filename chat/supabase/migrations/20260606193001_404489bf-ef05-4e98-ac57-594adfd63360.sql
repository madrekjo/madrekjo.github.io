
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.delete_old_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.notifications WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.likes WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comments WHERE created_at < now() - INTERVAL '24 hours';
  DELETE FROM public.posts WHERE created_at < now() - INTERVAL '24 hours';
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_old_comments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comments WHERE created_at < now() - INTERVAL '24 hours';
END;
$function$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-posts-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-comments-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-old-posts-hourly',
  '0 * * * *',
  $$SELECT public.delete_old_posts();$$
);

SELECT cron.schedule(
  'cleanup-old-comments-hourly',
  '15 * * * *',
  $$SELECT public.delete_old_comments();$$
);

SELECT public.delete_old_posts();
