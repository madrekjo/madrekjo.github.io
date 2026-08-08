-- Add pause functionality to tasks
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS paused_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS paused_total_ms bigint NOT NULL DEFAULT 0;