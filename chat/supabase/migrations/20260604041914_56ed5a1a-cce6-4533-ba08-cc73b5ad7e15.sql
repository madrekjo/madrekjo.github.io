
-- 1) profiles: require auth to read
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);
REVOKE SELECT ON public.profiles FROM anon;

-- 2) suggestion_replies: only admins can update (mirror insert)
DROP POLICY IF EXISTS "Users can update own replies" ON public.suggestion_replies;
CREATE POLICY "Only admins can update replies" ON public.suggestion_replies
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
