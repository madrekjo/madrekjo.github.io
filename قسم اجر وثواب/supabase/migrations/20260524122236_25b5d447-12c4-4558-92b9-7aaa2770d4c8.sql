
-- 1. Drop unused ayah_recordings table
DROP TABLE IF EXISTS public.ayah_recordings;

-- 2. Make ayah-recordings bucket private + remove public policies
UPDATE storage.buckets SET public = false WHERE id = 'ayah-recordings';
DROP POLICY IF EXISTS "Public read ayah recordings" ON storage.objects;
DROP POLICY IF EXISTS "Public upload ayah recordings" ON storage.objects;
DROP POLICY IF EXISTS "Public delete ayah recordings" ON storage.objects;

-- 3. Admin helper function (checks signed-in email)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT lower(email) = 'abdalrhmanmaaith24@gmail.com'
     FROM auth.users
     WHERE id = auth.uid()),
    false
  );
$$;

-- 4. Replace permissive UPDATE/DELETE policies on community_posts
DROP POLICY IF EXISTS "Authors can delete their posts" ON public.community_posts;
DROP POLICY IF EXISTS "Authors can update their posts" ON public.community_posts;

CREATE POLICY "Only admin can update posts"
ON public.community_posts
FOR UPDATE
TO public
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can delete posts"
ON public.community_posts
FOR DELETE
TO public
USING (public.is_admin());
