DROP POLICY IF EXISTS "Anyone can insert posts" ON public.community_posts;
CREATE POLICY "Anyone can insert posts" ON public.community_posts
FOR INSERT TO public
WITH CHECK (
  length(btrim(name)) BETWEEN 1 AND 80
  AND length(btrim(content)) BETWEEN 1 AND 2000
  AND length(btrim(author_token)) BETWEEN 8 AND 128
  AND type IN ('quran','hadith','dua')
  AND pinned = false
);