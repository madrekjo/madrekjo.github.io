
-- 1) Site settings singleton
CREATE TABLE public.site_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_enabled boolean NOT NULL DEFAULT true,
  maintenance_message text,
  chat_mode_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.site_settings (id) VALUES (1);

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads settings" ON public.site_settings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins update settings" ON public.site_settings
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 2) Edited timestamps
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- Owner-scoped edit RPCs (device_id acts as identity)
CREATE OR REPLACE FUNCTION public.edit_post(p_id uuid, p_device_id text, p_content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_content IS NULL OR length(btrim(p_content)) = 0 OR length(p_content) > 5000 THEN
    RAISE EXCEPTION 'invalid content';
  END IF;
  UPDATE public.posts
     SET content = p_content, edited_at = now()
   WHERE id = p_id AND device_id = p_device_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.edit_post(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_post(uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.edit_comment(p_id uuid, p_device_id text, p_content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_content IS NULL OR length(btrim(p_content)) = 0 OR length(p_content) > 2000 THEN
    RAISE EXCEPTION 'invalid content';
  END IF;
  UPDATE public.comments
     SET content = p_content, edited_at = now()
   WHERE id = p_id AND device_id = p_device_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.edit_comment(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_comment(uuid, text, text) TO anon, authenticated;

-- Allow UPDATE on comments by admins (RLS — there was no UPDATE policy at all)
CREATE POLICY "admins update comments" ON public.comments
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 3) Chat messages
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  display_name text NOT NULL,
  avatar_url text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.chat_messages TO anon, authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads chat" ON public.chat_messages
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "non-blocked can chat" ON public.chat_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(content) > 0 AND length(content) <= 2000
    AND length(display_name) BETWEEN 1 AND 40
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT EXISTS (SELECT 1 FROM blocked_devices b WHERE b.device_id = chat_messages.device_id)
  );

CREATE POLICY "admins delete chat" ON public.chat_messages
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
