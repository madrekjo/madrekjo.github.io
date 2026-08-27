
-- Revert the view back to safe security_invoker mode
ALTER VIEW public.community_posts_public SET (security_invoker = on);

-- Restore public row-level read on community_posts...
DROP POLICY IF EXISTS "Only admin can read posts directly" ON public.community_posts;
CREATE POLICY "View posts"
  ON public.community_posts FOR SELECT
  USING (deleted = false OR public.is_admin());

-- ...but lock down the ip_address column at the GRANT level so
-- direct `select *` from anon/authenticated cannot return it.
-- The community_posts_public view (security_invoker=on) reads ip_address as the
-- definer of the view (postgres) — wait, with security_invoker it uses caller perms.
-- So instead expose ip_address only via a SECURITY DEFINER function for admins.
REVOKE SELECT (ip_address) ON public.community_posts FROM anon, authenticated;

-- Drop the CASE-based ip column on the view and replace with NULL placeholder;
-- admins fetch real IPs through a separate admin-only RPC.
CREATE OR REPLACE VIEW public.community_posts_public
WITH (security_invoker = on) AS
SELECT
  id, name, content, type, created_at, updated_at,
  author_token, pinned, deleted, deleted_at, is_admin_post,
  NULL::text AS ip_address
FROM public.community_posts;

GRANT SELECT ON public.community_posts_public TO anon, authenticated;

-- Admin-only RPC to fetch IPs keyed by post id
CREATE OR REPLACE FUNCTION public.get_post_ips()
RETURNS TABLE(id uuid, ip_address text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.ip_address
  FROM public.community_posts p
  WHERE public.is_admin();
$$;
REVOKE ALL ON FUNCTION public.get_post_ips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_post_ips() TO authenticated;
