ALTER TABLE public.community_posts DROP CONSTRAINT community_posts_type_check;
ALTER TABLE public.community_posts ADD CONSTRAINT community_posts_type_check CHECK (type IN ('quran', 'hadith', 'dua'));