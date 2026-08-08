-- Add soft delete columns to posts and comments
ALTER TABLE public.posts 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

ALTER TABLE public.comments 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- Update existing delete function to do soft delete via auto-cleanup of old posts (4 days)
CREATE OR REPLACE FUNCTION public.delete_old_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Hard delete posts older than 4 days (and their cascade content via app logic)
  DELETE FROM public.posts WHERE created_at < now() - INTERVAL '4 days';
  DELETE FROM public.comments WHERE created_at < now() - INTERVAL '4 days';
  -- Also purge soft-deleted records older than 4 days
  DELETE FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '4 days';
  DELETE FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '4 days';
END;
$$;

-- Add admin SELECT policy for viewing soft-deleted (already viewable via existing policy since SELECT is true; that's fine)

-- Index for pagination performance
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON public.posts(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_deleted_at ON public.comments(deleted_at) WHERE deleted_at IS NOT NULL;

-- Enable required extensions for cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule cleanup every hour
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-posts') THEN
    PERFORM cron.schedule(
      'cleanup-old-posts',
      '0 * * * *',
      $cron$ SELECT public.delete_old_posts(); $cron$
    );
  END IF;
END $$;