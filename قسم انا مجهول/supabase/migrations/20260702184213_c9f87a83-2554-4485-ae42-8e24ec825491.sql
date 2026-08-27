
-- edit history tables
CREATE TABLE IF NOT EXISTS public.post_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  previous_content text NOT NULL,
  new_content text NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.post_edits TO authenticated;
GRANT ALL ON public.post_edits TO service_role;
ALTER TABLE public.post_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins view post edits" ON public.post_edits;
CREATE POLICY "admins view post edits" ON public.post_edits FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.comment_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  previous_content text NOT NULL,
  new_content text NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.comment_edits TO authenticated;
GRANT ALL ON public.comment_edits TO service_role;
ALTER TABLE public.comment_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins view comment edits" ON public.comment_edits;
CREATE POLICY "admins view comment edits" ON public.comment_edits FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- triggers to record edits
CREATE OR REPLACE FUNCTION public.record_post_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    INSERT INTO public.post_edits(post_id, device_id, previous_content, new_content)
    VALUES (NEW.id, NEW.device_id, OLD.content, NEW.content);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_post_edit() FROM anon, authenticated;
DROP TRIGGER IF EXISTS trg_post_edit ON public.posts;
CREATE TRIGGER trg_post_edit AFTER UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.record_post_edit();

CREATE OR REPLACE FUNCTION public.record_comment_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    INSERT INTO public.comment_edits(comment_id, device_id, previous_content, new_content)
    VALUES (NEW.id, NEW.device_id, OLD.content, NEW.content);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_comment_edit() FROM anon, authenticated;
DROP TRIGGER IF EXISTS trg_comment_edit ON public.comments;
CREATE TRIGGER trg_comment_edit AFTER UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.record_comment_edit();

-- site_settings extra columns
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS admin_post_bg text,
  ADD COLUMN IF NOT EXISTS admin_post_text text,
  ADD COLUMN IF NOT EXISTS admin_comment_bg text,
  ADD COLUMN IF NOT EXISTS admin_comment_text text,
  ADD COLUMN IF NOT EXISTS site_reopen_at timestamptz;

-- posts: hidden flag
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

-- refresh insert trigger to apply default admin colors from settings
CREATE OR REPLACE FUNCTION public.posts_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_admin_user boolean;
  s RECORD;
BEGIN
  is_admin_user := auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin');
  IF is_admin_user AND COALESCE(NEW.post_mode,'auto') <> 'anon' THEN
    NEW.user_id := auth.uid();
    NEW.status := 'approved';
    NEW.is_admin := true;
    NEW.post_mode := 'admin';
    IF NEW.anon_number IS NULL THEN
      NEW.anon_number := floor(random() * 9999 + 1)::int;
    END IF;
    IF NEW.bg_color IS NULL AND NEW.text_color IS NULL THEN
      SELECT admin_post_bg, admin_post_text INTO s FROM public.site_settings WHERE id = 1;
      IF s.admin_post_bg IS NOT NULL THEN NEW.bg_color := s.admin_post_bg; END IF;
      IF s.admin_post_text IS NOT NULL THEN NEW.text_color := s.admin_post_text; END IF;
    END IF;
  ELSIF is_admin_user AND NEW.post_mode = 'anon' THEN
    NEW.user_id := auth.uid();
    NEW.status := 'approved';
    NEW.is_admin := false;
    NEW.author_name := NULL;
    NEW.author_avatar_url := NULL;
    NEW.pinned := COALESCE(NEW.pinned, false);
    IF NEW.anon_number IS NULL THEN
      NEW.anon_number := floor(random() * 9999 + 1)::int;
    END IF;
  ELSE
    NEW.anon_number := floor(random() * 9999 + 1)::int;
    NEW.status := 'pending';
    NEW.author_name := NULL;
    NEW.author_avatar_url := NULL;
    NEW.user_id := NULL;
    NEW.pinned := false;
    NEW.is_admin := false;
    NEW.post_mode := 'auto';
    NEW.bg_color := NULL;
    NEW.text_color := NULL;
    NEW.hidden := false;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.comments_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a RECORD;
  is_admin_user boolean;
  s RECORD;
BEGIN
  is_admin_user := auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin');
  IF is_admin_user AND COALESCE(NEW.post_mode,'auto') <> 'anon' THEN
    NEW.is_admin := true;
    NEW.post_mode := 'admin';
    SELECT display_name, avatar_url INTO a FROM public.admin_devices WHERE device_id = NEW.device_id LIMIT 1;
    IF a IS NOT NULL THEN
      NEW.author_name := a.display_name;
      NEW.author_avatar_url := a.avatar_url;
    END IF;
    IF NEW.anon_number IS NULL THEN
      NEW.anon_number := floor(random() * 9999 + 1)::int;
    END IF;
    IF NEW.bg_color IS NULL AND NEW.text_color IS NULL THEN
      SELECT admin_comment_bg, admin_comment_text INTO s FROM public.site_settings WHERE id = 1;
      IF s.admin_comment_bg IS NOT NULL THEN NEW.bg_color := s.admin_comment_bg; END IF;
      IF s.admin_comment_text IS NOT NULL THEN NEW.text_color := s.admin_comment_text; END IF;
    END IF;
  ELSIF is_admin_user AND NEW.post_mode = 'anon' THEN
    NEW.is_admin := false;
    NEW.author_name := NULL;
    NEW.author_avatar_url := NULL;
    IF NEW.anon_number IS NULL THEN
      NEW.anon_number := floor(random() * 9999 + 1)::int;
    END IF;
  ELSE
    NEW.anon_number := floor(random() * 9999 + 1)::int;
    NEW.is_admin := false;
    NEW.author_name := NULL;
    NEW.author_avatar_url := NULL;
    NEW.post_mode := 'auto';
    NEW.bg_color := NULL;
    NEW.text_color := NULL;
  END IF;
  RETURN NEW;
END $$;
