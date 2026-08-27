
DROP POLICY IF EXISTS "anyone upload attachments safe" ON storage.objects;
CREATE POLICY "anyone upload attachments safe"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'attachments'
  AND lower(storage.extension(name)) = ANY (ARRAY[
    'png','jpg','jpeg','gif','webp','pdf','txt','doc','docx','zip',
    'mp4','webm','mov','m4v','ogg','mp3','wav','m4a'
  ])
);

CREATE TABLE public.chat_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  display_name text NOT NULL,
  avatar_url text,
  content text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_posts TO authenticated;
GRANT SELECT, INSERT ON public.chat_posts TO anon;
GRANT ALL ON public.chat_posts TO service_role;
ALTER TABLE public.chat_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads chat posts" ON public.chat_posts FOR SELECT USING (true);
CREATE POLICY "non-blocked can post chat" ON public.chat_posts FOR INSERT WITH CHECK (
  length(content) > 0 AND length(content) <= 5000
  AND length(display_name) BETWEEN 1 AND 40
  AND length(device_id) BETWEEN 8 AND 128
  AND NOT EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = chat_posts.device_id)
);
CREATE POLICY "admins update chat posts" ON public.chat_posts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "admins delete chat posts" ON public.chat_posts FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE TABLE public.chat_post_mutes (
  post_id uuid NOT NULL REFERENCES public.chat_posts(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, device_id)
);
GRANT SELECT ON public.chat_post_mutes TO anon, authenticated;
GRANT ALL ON public.chat_post_mutes TO service_role, authenticated;
ALTER TABLE public.chat_post_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads mutes" ON public.chat_post_mutes FOR SELECT USING (true);
CREATE POLICY "admins manage mutes" ON public.chat_post_mutes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.chat_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.chat_posts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.chat_comments(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  display_name text NOT NULL,
  avatar_url text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_comments TO authenticated;
GRANT SELECT, INSERT ON public.chat_comments TO anon;
GRANT ALL ON public.chat_comments TO service_role;
ALTER TABLE public.chat_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads chat comments" ON public.chat_comments FOR SELECT USING (true);
CREATE POLICY "non-blocked non-muted can comment" ON public.chat_comments FOR INSERT WITH CHECK (
  length(content) > 0 AND length(content) <= 2000
  AND length(display_name) BETWEEN 1 AND 40
  AND length(device_id) BETWEEN 8 AND 128
  AND NOT EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = chat_comments.device_id)
  AND NOT EXISTS (SELECT 1 FROM public.chat_post_mutes m WHERE m.post_id = chat_comments.post_id AND m.device_id = chat_comments.device_id)
);
CREATE POLICY "admins delete chat comments" ON public.chat_comments FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE TABLE public.chat_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.chat_posts(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, device_id)
);
GRANT SELECT, INSERT, DELETE ON public.chat_likes TO authenticated;
GRANT SELECT, INSERT ON public.chat_likes TO anon;
GRANT ALL ON public.chat_likes TO service_role;
ALTER TABLE public.chat_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads chat likes" ON public.chat_likes FOR SELECT USING (true);
CREATE POLICY "non-blocked can like chat" ON public.chat_likes FOR INSERT WITH CHECK (
  length(device_id) BETWEEN 8 AND 128
  AND NOT EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = chat_likes.device_id)
);
CREATE POLICY "admins delete chat likes" ON public.chat_likes FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.unlike_chat_post(p_post_id uuid, p_device_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN RAISE EXCEPTION 'invalid device'; END IF;
  DELETE FROM public.chat_likes WHERE post_id = p_post_id AND device_id = p_device_id;
END $$;
GRANT EXECUTE ON FUNCTION public.unlike_chat_post(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.edit_chat_post(p_id uuid, p_device_id text, p_content text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN RAISE EXCEPTION 'invalid device'; END IF;
  IF p_content IS NULL OR length(btrim(p_content))=0 OR length(p_content) > 5000 THEN RAISE EXCEPTION 'invalid content'; END IF;
  UPDATE public.chat_posts SET content = p_content, edited_at = now() WHERE id = p_id AND device_id = p_device_id;
END $$;
GRANT EXECUTE ON FUNCTION public.edit_chat_post(uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.edit_chat_comment(p_id uuid, p_device_id text, p_content text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN RAISE EXCEPTION 'invalid device'; END IF;
  IF p_content IS NULL OR length(btrim(p_content))=0 OR length(p_content) > 2000 THEN RAISE EXCEPTION 'invalid content'; END IF;
  UPDATE public.chat_comments SET content = p_content, edited_at = now() WHERE id = p_id AND device_id = p_device_id;
END $$;
GRANT EXECUTE ON FUNCTION public.edit_chat_comment(uuid, text, text) TO anon, authenticated;
