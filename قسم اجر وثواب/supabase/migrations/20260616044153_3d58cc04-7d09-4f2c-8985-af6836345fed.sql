
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS is_admin_post boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.banned_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_token text NOT NULL UNIQUE,
  ip_address text,
  reason text,
  banned_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.banned_users TO anon, authenticated;
GRANT ALL ON public.banned_users TO service_role;

ALTER TABLE public.banned_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view banned" ON public.banned_users;
CREATE POLICY "Anyone can view banned" ON public.banned_users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only admin can insert banned" ON public.banned_users;
CREATE POLICY "Only admin can insert banned" ON public.banned_users FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Only admin can delete banned" ON public.banned_users;
CREATE POLICY "Only admin can delete banned" ON public.banned_users FOR DELETE USING (is_admin());

DROP POLICY IF EXISTS "Anyone can insert posts" ON public.community_posts;
CREATE POLICY "Anyone can insert posts" ON public.community_posts
FOR INSERT WITH CHECK (
  length(btrim(name)) BETWEEN 1 AND 80
  AND length(btrim(content)) BETWEEN 1 AND 2000
  AND length(btrim(author_token)) BETWEEN 8 AND 128
  AND type IN ('quran','hadith','dua')
  AND pinned = false
  AND deleted = false
  AND (is_admin_post = false OR is_admin())
  AND NOT EXISTS (SELECT 1 FROM public.banned_users b WHERE b.author_token = community_posts.author_token)
);

DROP POLICY IF EXISTS "Anyone can view posts" ON public.community_posts;
CREATE POLICY "View posts" ON public.community_posts
FOR SELECT USING (deleted = false OR is_admin());
