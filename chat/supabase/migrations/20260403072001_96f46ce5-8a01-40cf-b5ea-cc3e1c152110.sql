
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Users or admins can delete posts" ON public.posts;
CREATE POLICY "Users or admins or moderators can delete posts"
ON public.posts FOR DELETE TO authenticated
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'moderator')
);

DROP POLICY IF EXISTS "Users or admins can delete comments" ON public.comments;
CREATE POLICY "Users or admins or moderators can delete comments"
ON public.comments FOR DELETE TO authenticated
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Admins can update any comment"
ON public.comments FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert user roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete user roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
