-- Add break/timer/status fields to study_rounds
ALTER TABLE public.study_rounds
  ADD COLUMN IF NOT EXISTS break_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS break_interval_minutes integer,
  ADD COLUMN IF NOT EXISTS break_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Update auto-delete to skip pinned posts/comments
CREATE OR REPLACE FUNCTION public.delete_old_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.posts
    WHERE created_at < now() - INTERVAL '4 days'
    AND is_pinned = false;
  DELETE FROM public.comments
    WHERE created_at < now() - INTERVAL '4 days'
    AND is_pinned = false;
  DELETE FROM public.posts
    WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '4 days'
    AND is_pinned = false;
  DELETE FROM public.comments
    WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '4 days'
    AND is_pinned = false;
END;
$function$;

-- Allow round owner to update (already exists), and ensure participants get notifications via app

-- Helper: get round participation counts per user (public, anyone can see)
CREATE OR REPLACE FUNCTION public.get_round_counts(_user_ids uuid[])
RETURNS TABLE(user_id uuid, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT user_id, COUNT(*)::bigint
  FROM public.round_participants
  WHERE user_id = ANY(_user_ids)
  GROUP BY user_id;
$$;