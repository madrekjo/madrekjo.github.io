
-- 1) Revoke EXECUTE on trigger-only / internal SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.assign_anon_number(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.comments_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.posts_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2) post_likes: replace overly-permissive DELETE policy with owner-scoped RPC
DROP POLICY IF EXISTS "owners can unlike" ON public.post_likes;

CREATE OR REPLACE FUNCTION public.unlike_post(p_post_id uuid, p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  DELETE FROM public.post_likes
   WHERE post_id = p_post_id AND device_id = p_device_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unlike_post(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlike_post(uuid, text) TO anon, authenticated;

-- 3) device_aliases: stop exposing the full device_id -> number map publicly
DROP POLICY IF EXISTS "anyone reads aliases" ON public.device_aliases;
REVOKE SELECT ON public.device_aliases FROM anon, authenticated;
-- Keep service_role access for admin/server code
GRANT ALL ON public.device_aliases TO service_role;

-- 4) Storage: drop broad SELECT (listing) policy on attachments.
-- Bucket remains public so direct getPublicUrl downloads still work without listing.
DROP POLICY IF EXISTS "public read attachments" ON storage.objects;

-- 5) Storage: restrict uploads to safe mime types
DROP POLICY IF EXISTS "anyone upload attachments" ON storage.objects;
CREATE POLICY "anyone upload attachments safe"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND (
    lower(storage.extension(name)) = ANY (
      ARRAY['png','jpg','jpeg','gif','webp','pdf','txt','doc','docx','zip']
    )
  )
);
