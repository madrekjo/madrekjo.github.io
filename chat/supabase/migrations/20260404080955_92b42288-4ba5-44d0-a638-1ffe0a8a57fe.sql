
-- Add is_pinned column to posts
ALTER TABLE public.posts ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;

-- Allow admins to update any post (for pinning)
CREATE POLICY "Admins can update any post"
ON public.posts FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete suggestions
CREATE POLICY "Admins can delete suggestions"
ON public.suggestions FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
