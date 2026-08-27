
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_avatar_url text;
ALTER TABLE public.admin_devices ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.admin_devices ADD COLUMN IF NOT EXISTS avatar_url text;
