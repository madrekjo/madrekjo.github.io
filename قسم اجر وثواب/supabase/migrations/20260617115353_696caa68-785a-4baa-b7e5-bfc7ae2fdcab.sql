
INSERT INTO public.app_settings(key, value) VALUES ('community_posts_hidden', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- Hide posts from non-admins when the setting is true
DROP POLICY IF EXISTS "View posts" ON public.community_posts;
CREATE POLICY "View posts"
ON public.community_posts FOR SELECT
USING (
  public.is_admin()
  OR (
    deleted = false
    AND COALESCE(
      NOT (SELECT (value)::text::boolean FROM public.app_settings WHERE key = 'community_posts_hidden'),
      true
    )
  )
);
