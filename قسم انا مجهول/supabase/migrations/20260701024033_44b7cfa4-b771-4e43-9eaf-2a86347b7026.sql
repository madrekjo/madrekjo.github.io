
-- 1) Custom style + post-mode columns
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS bg_color text,
  ADD COLUMN IF NOT EXISTS text_color text,
  ADD COLUMN IF NOT EXISTS post_mode text NOT NULL DEFAULT 'auto';
ALTER TABLE public.chat_posts
  ADD COLUMN IF NOT EXISTS bg_color text,
  ADD COLUMN IF NOT EXISTS text_color text,
  ADD COLUMN IF NOT EXISTS post_mode text NOT NULL DEFAULT 'auto';
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS bg_color text,
  ADD COLUMN IF NOT EXISTS text_color text,
  ADD COLUMN IF NOT EXISTS post_mode text NOT NULL DEFAULT 'auto';
ALTER TABLE public.chat_comments
  ADD COLUMN IF NOT EXISTS bg_color text,
  ADD COLUMN IF NOT EXISTS text_color text,
  ADD COLUMN IF NOT EXISTS post_mode text NOT NULL DEFAULT 'auto';

-- 2) Update triggers to honor post_mode='anon' for admins and preserve custom anon_number
CREATE OR REPLACE FUNCTION public.posts_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE is_admin_user boolean;
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
  ELSIF is_admin_user AND NEW.post_mode = 'anon' THEN
    -- admin posting as anonymous: auto-approve, hide admin identity
    NEW.user_id := auth.uid();
    NEW.status := 'approved';
    NEW.is_admin := false;
    NEW.author_name := NULL;
    NEW.author_avatar_url := NULL;
    NEW.pinned := COALESCE(NEW.pinned, false);
    IF NEW.anon_number IS NULL THEN
      NEW.anon_number := floor(random() * 9999 + 1)::int;
    END IF;
    -- colors allowed
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
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.comments_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a RECORD;
  is_admin_user boolean;
BEGIN
  is_admin_user := auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin');
  IF is_admin_user AND COALESCE(NEW.post_mode,'auto') <> 'anon' THEN
    NEW.is_admin := true;
    NEW.post_mode := 'admin';
    SELECT display_name, avatar_url INTO a
      FROM public.admin_devices WHERE device_id = NEW.device_id LIMIT 1;
    IF a IS NOT NULL THEN
      NEW.author_name := a.display_name;
      NEW.author_avatar_url := a.avatar_url;
    END IF;
    IF NEW.anon_number IS NULL THEN
      NEW.anon_number := floor(random() * 9999 + 1)::int;
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
END
$function$;

CREATE OR REPLACE FUNCTION public.chat_posts_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE is_admin_user boolean;
BEGIN
  is_admin_user := auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin');
  IF is_admin_user AND COALESCE(NEW.post_mode,'auto') <> 'anon' THEN
    NEW.is_admin := true;
    NEW.post_mode := 'admin';
  ELSIF is_admin_user AND NEW.post_mode = 'anon' THEN
    NEW.is_admin := false;
  ELSE
    NEW.is_admin := false;
    NEW.post_mode := 'auto';
    NEW.bg_color := NULL;
    NEW.text_color := NULL;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.chat_comments_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE is_admin_user boolean;
BEGIN
  is_admin_user := auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin');
  IF is_admin_user AND COALESCE(NEW.post_mode,'auto') <> 'anon' THEN
    NEW.is_admin := true;
    NEW.post_mode := 'admin';
  ELSIF is_admin_user AND NEW.post_mode = 'anon' THEN
    NEW.is_admin := false;
  ELSE
    NEW.is_admin := false;
    NEW.post_mode := 'auto';
    NEW.bg_color := NULL;
    NEW.text_color := NULL;
  END IF;
  RETURN NEW;
END
$function$;

-- 3) device_notes: private admin-only labels for devices
CREATE TABLE IF NOT EXISTS public.device_notes (
  device_id text PRIMARY KEY,
  label text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_notes TO authenticated;
GRANT ALL ON public.device_notes TO service_role;
ALTER TABLE public.device_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read device_notes" ON public.device_notes;
DROP POLICY IF EXISTS "admins write device_notes" ON public.device_notes;
CREATE POLICY "admins read device_notes" ON public.device_notes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write device_notes" ON public.device_notes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4) device_presence for basic stats
CREATE TABLE IF NOT EXISTS public.device_presence (
  device_id text PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  total_seconds bigint NOT NULL DEFAULT 0,
  visits integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.device_presence TO authenticated;
GRANT ALL ON public.device_presence TO service_role;
ALTER TABLE public.device_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read presence" ON public.device_presence;
CREATE POLICY "admins read presence" ON public.device_presence
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.heartbeat_device(p_device_id text, p_seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN RETURN; END IF;
  IF p_seconds IS NULL OR p_seconds < 0 OR p_seconds > 600 THEN p_seconds := 0; END IF;
  INSERT INTO public.device_presence(device_id, visits, total_seconds)
    VALUES (p_device_id, 1, p_seconds)
  ON CONFLICT (device_id) DO UPDATE
    SET last_seen = now(),
        total_seconds = public.device_presence.total_seconds + EXCLUDED.total_seconds,
        visits = public.device_presence.visits + CASE WHEN now() - public.device_presence.last_seen > interval '30 minutes' THEN 1 ELSE 0 END;
END $$;
REVOKE ALL ON FUNCTION public.heartbeat_device(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_device(text,integer) TO anon, authenticated;

-- 5) Admin-only RPC to fetch full device dossier (bypasses admin_devices/notes/presence RLS via SECURITY DEFINER + role check)
CREATE OR REPLACE FUNCTION public.get_device_dossier(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'device_id', p_device_id,
    'label', (SELECT label FROM public.device_notes WHERE device_id = p_device_id),
    'is_admin', EXISTS(SELECT 1 FROM public.admin_devices WHERE device_id = p_device_id),
    'is_blocked', EXISTS(SELECT 1 FROM public.blocked_devices WHERE device_id = p_device_id),
    'presence', (SELECT to_jsonb(dp) FROM public.device_presence dp WHERE dp.device_id = p_device_id),
    'post_count', (SELECT count(*) FROM public.posts WHERE device_id = p_device_id),
    'comment_count', (SELECT count(*) FROM public.comments WHERE device_id = p_device_id),
    'chat_post_count', (SELECT count(*) FROM public.chat_posts WHERE device_id = p_device_id),
    'chat_comment_count', (SELECT count(*) FROM public.chat_comments WHERE device_id = p_device_id),
    'recent_posts', (SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.created_at DESC), '[]'::jsonb)
      FROM (SELECT id, content, created_at, status FROM public.posts WHERE device_id = p_device_id ORDER BY created_at DESC LIMIT 20) p),
    'recent_comments', (SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.created_at DESC), '[]'::jsonb)
      FROM (SELECT id, post_id, content, created_at FROM public.comments WHERE device_id = p_device_id ORDER BY created_at DESC LIMIT 20) c)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_device_dossier(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_device_dossier(text) TO authenticated;

-- 6) Admin-only RPC to set label
CREATE OR REPLACE FUNCTION public.set_device_label(p_device_id text, p_label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_label IS NULL OR length(btrim(p_label)) = 0 THEN
    DELETE FROM public.device_notes WHERE device_id = p_device_id;
    RETURN;
  END IF;
  INSERT INTO public.device_notes(device_id, label, updated_by, updated_at)
    VALUES (p_device_id, p_label, auth.uid(), now())
  ON CONFLICT (device_id) DO UPDATE
    SET label = EXCLUDED.label, updated_by = EXCLUDED.updated_by, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.set_device_label(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_device_label(text,text) TO authenticated;
