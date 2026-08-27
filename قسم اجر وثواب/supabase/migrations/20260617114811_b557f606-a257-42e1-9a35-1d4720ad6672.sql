
-- Fix: anon/authenticated need EXECUTE on is_admin() used inside the view and RLS
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- App settings (key/value) for admin toggles like community on/off
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read settings"
  ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Only admin can insert settings"
  ON public.app_settings FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Only admin can update settings"
  ON public.app_settings FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Only admin can delete settings"
  ON public.app_settings FOR DELETE USING (public.is_admin());

INSERT INTO public.app_settings(key, value) VALUES ('community_enabled', 'true'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- Block inserts when community is disabled (admin can still post)
DROP POLICY IF EXISTS "Anyone can insert posts" ON public.community_posts;
CREATE POLICY "Anyone can insert posts"
ON public.community_posts FOR INSERT
WITH CHECK (
  length(btrim(name)) BETWEEN 1 AND 80
  AND length(btrim(content)) BETWEEN 1 AND 2000
  AND length(btrim(author_token)) BETWEEN 8 AND 128
  AND type = ANY (ARRAY['quran','hadith','dua'])
  AND pinned = false
  AND deleted = false
  AND (is_admin_post = false OR public.is_admin())
  AND NOT EXISTS (SELECT 1 FROM public.banned_users b WHERE b.author_token = community_posts.author_token)
  AND (
    public.is_admin()
    OR COALESCE((SELECT (value)::text::boolean FROM public.app_settings WHERE key='community_enabled'), true)
  )
);
