
-- 1. Add is_admin columns
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.chat_posts ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.chat_comments ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. Update posts trigger: only signed-in admins auto-approve
CREATE OR REPLACE FUNCTION public.posts_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.anon_number := floor(random() * 9999 + 1)::int;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    NEW.user_id := auth.uid();
    NEW.status := 'approved';
    NEW.is_admin := true;
  ELSE
    NEW.status := 'pending';
    NEW.author_name := NULL;
    NEW.author_avatar_url := NULL;
    NEW.user_id := NULL;
    NEW.pinned := false;
    NEW.is_admin := false;
  END IF;
  RETURN NEW;
END
$$;

-- 3. Comments trigger: set is_admin when signed-in admin
CREATE OR REPLACE FUNCTION public.comments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.anon_number := floor(random() * 9999 + 1)::int;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    NEW.is_admin := true;
  ELSE
    NEW.is_admin := false;
  END IF;
  RETURN NEW;
END
$$;

-- 4. Chat posts/comments triggers
CREATE OR REPLACE FUNCTION public.chat_posts_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    NEW.is_admin := true;
  ELSE
    NEW.is_admin := false;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS chat_posts_before_insert_trg ON public.chat_posts;
CREATE TRIGGER chat_posts_before_insert_trg
BEFORE INSERT ON public.chat_posts
FOR EACH ROW EXECUTE FUNCTION public.chat_posts_before_insert();

CREATE OR REPLACE FUNCTION public.chat_comments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    NEW.is_admin := true;
  ELSE
    NEW.is_admin := false;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS chat_comments_before_insert_trg ON public.chat_comments;
CREATE TRIGGER chat_comments_before_insert_trg
BEFORE INSERT ON public.chat_comments
FOR EACH ROW EXECUTE FUNCTION public.chat_comments_before_insert();

-- 5. Attachment URL validation trigger
CREATE OR REPLACE FUNCTION public.validate_attachments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  a jsonb;
  u text;
BEGIN
  IF NEW.attachments IS NULL OR jsonb_typeof(NEW.attachments) <> 'array' THEN
    NEW.attachments := '[]'::jsonb;
    RETURN NEW;
  END IF;
  IF jsonb_array_length(NEW.attachments) > 10 THEN
    RAISE EXCEPTION 'too many attachments';
  END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(NEW.attachments) LOOP
    u := a->>'url';
    IF u IS NULL OR u !~ '^https?://[a-zA-Z0-9.-]+/storage/v1/object/public/attachments/' THEN
      RAISE EXCEPTION 'invalid attachment url';
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS posts_validate_attachments_trg ON public.posts;
CREATE TRIGGER posts_validate_attachments_trg
BEFORE INSERT OR UPDATE OF attachments ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.validate_attachments();

DROP TRIGGER IF EXISTS chat_posts_validate_attachments_trg ON public.chat_posts;
CREATE TRIGGER chat_posts_validate_attachments_trg
BEFORE INSERT OR UPDATE OF attachments ON public.chat_posts
FOR EACH ROW EXECUTE FUNCTION public.validate_attachments();

-- 6. Restrict admin_devices SELECT to admins only
DROP POLICY IF EXISTS "anyone checks admin devices" ON public.admin_devices;
CREATE POLICY "admins read admin devices"
ON public.admin_devices
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 7. Restrict chat_post_mutes SELECT to admins only
DROP POLICY IF EXISTS "anyone reads mutes" ON public.chat_post_mutes;
CREATE POLICY "admins read mutes"
ON public.chat_post_mutes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 8. Revoke EXECUTE on trigger functions from public/anon/authenticated
REVOKE ALL ON FUNCTION public.posts_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comments_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_posts_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_comments_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_attachments() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_anon_number(text) FROM PUBLIC, anon, authenticated;
