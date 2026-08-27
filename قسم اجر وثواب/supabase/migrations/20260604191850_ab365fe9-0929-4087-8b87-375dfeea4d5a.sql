
-- 1) Lock down is_admin() execution to signed-in users only
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 2) Replace overly-permissive INSERT policies with validated ones
DROP POLICY IF EXISTS "Anyone can insert posts" ON public.community_posts;
CREATE POLICY "Anyone can insert posts"
ON public.community_posts
FOR INSERT
TO public
WITH CHECK (
  length(btrim(name)) BETWEEN 1 AND 80
  AND length(btrim(content)) BETWEEN 1 AND 2000
  AND length(btrim(author_token)) BETWEEN 8 AND 128
  AND type IN ('story','question','prayer','reflection','post')
  AND pinned = false
);

DROP POLICY IF EXISTS "Anyone can insert recitations" ON public.recitations;
CREATE POLICY "Anyone can insert recitations"
ON public.recitations
FOR INSERT
TO public
WITH CHECK (
  length(btrim(name)) BETWEEN 1 AND 80
  AND length(caption) <= 2000
  AND length(btrim(storage_path)) BETWEEN 1 AND 300
  AND length(btrim(author_token)) BETWEEN 8 AND 128
);

-- 3) Storage policies for ayah-recordings (private bucket)
DROP POLICY IF EXISTS "ayah_recordings_insert" ON storage.objects;
DROP POLICY IF EXISTS "ayah_recordings_select_admin" ON storage.objects;
DROP POLICY IF EXISTS "ayah_recordings_delete_admin" ON storage.objects;
DROP POLICY IF EXISTS "ayah_recordings_update_admin" ON storage.objects;

-- Anyone can upload a new recording (object reads happen via signed URLs)
CREATE POLICY "ayah_recordings_insert"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'ayah-recordings');

-- Only the admin can list/read raw objects directly
CREATE POLICY "ayah_recordings_select_admin"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'ayah-recordings' AND public.is_admin());

-- Only the admin can delete recordings
CREATE POLICY "ayah_recordings_delete_admin"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'ayah-recordings' AND public.is_admin());

-- Only the admin can update recordings
CREATE POLICY "ayah_recordings_update_admin"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'ayah-recordings' AND public.is_admin())
WITH CHECK (bucket_id = 'ayah-recordings' AND public.is_admin());
