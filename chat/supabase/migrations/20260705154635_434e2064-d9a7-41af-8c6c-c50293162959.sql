
-- ============ role_permissions ============
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.app_role PRIMARY KEY,
  can_delete_posts boolean NOT NULL DEFAULT false,
  can_delete_comments boolean NOT NULL DEFAULT false,
  can_ban_users boolean NOT NULL DEFAULT false,
  can_timeout boolean NOT NULL DEFAULT false,
  can_warn boolean NOT NULL DEFAULT false,
  can_manage_reports boolean NOT NULL DEFAULT false,
  can_lock_sections boolean NOT NULL DEFAULT false,
  can_manage_words boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role perms read" ON public.role_permissions;
CREATE POLICY "role perms read" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin manages role perms" ON public.role_permissions;
CREATE POLICY "admin manages role perms" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- Seed defaults (moderator keeps everything, supervisor is lighter, rounds_manager is empty)
INSERT INTO public.role_permissions (role, can_delete_posts, can_delete_comments, can_ban_users, can_timeout, can_warn, can_manage_reports, can_lock_sections, can_manage_words)
VALUES
  ('moderator', true, true, true, true, true, true, false, false),
  ('supervisor', true, true, false, true, true, true, false, false),
  ('rounds_manager', false, false, false, false, false, false, false, false)
ON CONFLICT (role) DO NOTHING;

-- ============ has_permission helper ============
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ok boolean := false;
BEGIN
  IF public.has_role(_user_id, 'admin'::app_role) THEN RETURN true; END IF;

  EXECUTE format('
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = $1 AND rp.%I = true
    )', _perm)
  INTO ok
  USING _user_id;

  RETURN COALESCE(ok, false);
END $$;

-- ============ study_rounds: restrict creation ============
DROP POLICY IF EXISTS "Users can insert own study round" ON public.study_rounds;
DROP POLICY IF EXISTS "Users can create study rounds" ON public.study_rounds;
DROP POLICY IF EXISTS "Users insert own round" ON public.study_rounds;
CREATE POLICY "Rounds managers/admins create rounds" ON public.study_rounds
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'rounds_manager'::app_role)
    )
  );

-- ============ Chat generation separation ============
ALTER TABLE public.posts    ADD COLUMN IF NOT EXISTS generation text;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS generation text;

-- Backfill from author profile
UPDATE public.posts p
  SET generation = pr.generation
FROM public.profiles pr
WHERE p.user_id = pr.user_id AND p.generation IS NULL;

UPDATE public.comments c
  SET generation = pr.generation
FROM public.profiles pr
WHERE c.user_id = pr.user_id AND c.generation IS NULL;

-- Trigger to auto-fill generation from author profile (unless staff => NULL for shared/announcement)
CREATE OR REPLACE FUNCTION public.set_content_generation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author_gen text;
  is_staff boolean;
BEGIN
  is_staff := public.has_role(NEW.user_id, 'admin'::app_role)
           OR public.has_role(NEW.user_id, 'moderator'::app_role)
           OR public.has_role(NEW.user_id, 'supervisor'::app_role);

  IF is_staff THEN
    -- Staff posts default to shared (NULL) unless they explicitly set one
    RETURN NEW;
  END IF;

  SELECT generation INTO author_gen FROM public.profiles WHERE user_id = NEW.user_id;
  NEW.generation := author_gen;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS set_posts_generation ON public.posts;
CREATE TRIGGER set_posts_generation
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_content_generation();

DROP TRIGGER IF EXISTS set_comments_generation ON public.comments;
CREATE TRIGGER set_comments_generation
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.set_content_generation();

-- Visibility helper: returns true if row is visible to current user
CREATE OR REPLACE FUNCTION public.can_see_generation(_gen text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_gen text;
BEGIN
  IF _gen IS NULL THEN RETURN true; END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role)
     OR public.has_role(auth.uid(), 'supervisor'::app_role) THEN
    RETURN true;
  END IF;
  SELECT generation INTO my_gen FROM public.profiles WHERE user_id = auth.uid();
  RETURN my_gen IS NOT NULL AND my_gen = _gen;
END $$;

-- Replace SELECT policies on posts/comments to enforce generation visibility
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.posts;
DROP POLICY IF EXISTS "Anyone can view posts" ON public.posts;
DROP POLICY IF EXISTS "Everyone reads posts" ON public.posts;
DROP POLICY IF EXISTS "Public read posts" ON public.posts;
DROP POLICY IF EXISTS "posts select" ON public.posts;
CREATE POLICY "posts select by generation" ON public.posts
  FOR SELECT TO authenticated
  USING (public.can_see_generation(generation));

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
DROP POLICY IF EXISTS "Anyone can view comments" ON public.comments;
DROP POLICY IF EXISTS "Everyone reads comments" ON public.comments;
DROP POLICY IF EXISTS "Public read comments" ON public.comments;
DROP POLICY IF EXISTS "comments select" ON public.comments;
CREATE POLICY "comments select by generation" ON public.comments
  FOR SELECT TO authenticated
  USING (public.can_see_generation(generation));
