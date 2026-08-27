
-- 1) banned_users: admin-only SELECT + RPC to check current token
DROP POLICY IF EXISTS "Anyone can view banned" ON public.banned_users;
CREATE POLICY "Only admin can view banned"
ON public.banned_users FOR SELECT
USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.is_token_banned(_token text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.banned_users WHERE author_token = _token
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_token_banned(text) TO anon, authenticated;

-- 2) community_posts: hide ip_address from public via a view
CREATE OR REPLACE VIEW public.community_posts_public
WITH (security_invoker = true) AS
SELECT
  id, name, content, type, created_at, updated_at,
  author_token, pinned, deleted, deleted_at, is_admin_post,
  CASE WHEN public.is_admin() THEN ip_address ELSE NULL END AS ip_address
FROM public.community_posts;

GRANT SELECT ON public.community_posts_public TO anon, authenticated;

-- 3) Storage INSERT policies: enforce filename pattern
DROP POLICY IF EXISTS "Anyone can upload recitation files" ON storage.objects;
DROP POLICY IF EXISTS "ayah_recordings_insert" ON storage.objects;

CREATE POLICY "ayah_recordings_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ayah-recordings'
  AND name ~ '^[A-Za-z0-9_-]{8,128}/[0-9]+\.(webm|ogg|mpeg|mp4|wav)$'
);
