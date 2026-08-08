
-- 1) Restrict profiles SELECT to authenticated users only
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- 2) Restrict UPDATE on messages to is_read column only
REVOKE UPDATE ON public.messages FROM authenticated, anon, PUBLIC;
GRANT UPDATE (is_read) ON public.messages TO authenticated;
