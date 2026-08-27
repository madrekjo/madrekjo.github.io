
-- 1) Lock down community_posts: only admin can read the base table.
-- The community_posts_public view stays the public read path; switch it to run as
-- the view owner so non-admins can still read posts through it without needing
-- direct SELECT on the underlying table.
ALTER VIEW public.community_posts_public SET (security_invoker = off);

DROP POLICY IF EXISTS "View posts" ON public.community_posts;
CREATE POLICY "Only admin can read posts directly"
  ON public.community_posts FOR SELECT
  USING (public.is_admin());

-- 2) recitations: block banned authors from inserting
DROP POLICY IF EXISTS "Anyone can insert recitations" ON public.recitations;
CREATE POLICY "Anyone can insert recitations"
ON public.recitations FOR INSERT
WITH CHECK (
  length(btrim(name)) BETWEEN 1 AND 80
  AND length(caption) <= 2000
  AND length(btrim(storage_path)) BETWEEN 1 AND 300
  AND length(btrim(author_token)) BETWEEN 8 AND 128
  AND NOT EXISTS (
    SELECT 1 FROM public.banned_users b WHERE b.author_token = recitations.author_token
  )
);
