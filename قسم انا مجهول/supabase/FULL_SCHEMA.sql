-- ============================================================================
--  «أنا مجهول» — قاعدة البيانات الكاملة
--  مولَّد تلقائياً من supabase/migrations/ (34 ملف، بترتيب زمني)
-- ============================================================================
--
--  الاستعمال:
--    مشروع Supabase جديد  →  SQL Editor  →  الصق هذا الملف كله  →  Run.
--    يعمل على قاعدة فارغة من الصفر: ينشئ كل الجداول والسياسات والتريغرات
--    والدوال، و bucket 'attachments'، و seed الأساسي.
--
--  تنبيه ١: الملف غير idempotent — شغّله مرة واحدة على قاعدة فارغة فقط.
--            إعادة تشغيله على قاعدة قائمة فاشل عادي (وهذا مقصود: تفادي
--            تكرار تريغرات أو بيانات).
--
--  تنبيه ٢: هذا يبني المخطّط والدوال فقط، ولا يدخل أي بيانات مستخدمين أو
--            منشورات. بعده مباشرة شغّل:
--              supabase/migrations/verify_ban_score.sql   (فحص نظام الحظر)
--
--  ترتيب الملفات مدمج فيما يلي.
-- ============================================================================


SET client_min_messages = warning;
SET check_function_bodies = false;
SET search_path = public;


 ------------------------------------------------------------------------------
 --  20260601122305_7f143c4f-f80e-45c0-86ce-2f99e0a06459.sql
 ------------------------------------------------------------------------------

-- Role enum and roles table
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Blocked devices
CREATE TABLE public.blocked_devices (
  device_id TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blocked_devices TO anon, authenticated;
GRANT ALL ON public.blocked_devices TO service_role;
ALTER TABLE public.blocked_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can check blocks" ON public.blocked_devices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage blocks" ON public.blocked_devices FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Posts
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.posts TO anon, authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read posts" ON public.posts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "non-blocked can post" ON public.posts FOR INSERT TO anon, authenticated
  WITH CHECK (length(content) > 0 AND length(content) <= 5000 AND length(device_id) BETWEEN 8 AND 128
    AND NOT EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = posts.device_id));
CREATE POLICY "admins delete posts" ON public.posts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Comments
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.comments(post_id);
GRANT SELECT, INSERT ON public.comments TO anon, authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads comments" ON public.comments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "non-blocked can comment" ON public.comments FOR INSERT TO anon, authenticated
  WITH CHECK (length(content) > 0 AND length(content) <= 2000 AND length(device_id) BETWEEN 8 AND 128
    AND NOT EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = comments.device_id));
CREATE POLICY "admins delete comments" ON public.comments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Auto-grant admin to specific email on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket for attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true);

CREATE POLICY "public read attachments" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'attachments');
CREATE POLICY "anyone upload attachments" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'attachments');
CREATE POLICY "admins delete attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'attachments' AND public.has_role(auth.uid(), 'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;

 ------------------------------------------------------------------------------
 --  20260601122318_e5aa3824-20e0-43b5-97b6-a1efb3528b45.sql
 ------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

 ------------------------------------------------------------------------------
 --  20260602091952_110dccdd-512e-4e95-816d-7451ff91cb3a.sql
 ------------------------------------------------------------------------------

ALTER TABLE public.posts
  ADD COLUMN status text NOT NULL DEFAULT 'pending',
  ADD COLUMN pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN author_name text,
  ADD COLUMN user_id uuid,
  ADD COLUMN anon_number int;

UPDATE public.posts SET status = 'approved' WHERE status = 'pending';

ALTER TABLE public.comments ADD COLUMN anon_number int;

ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_post_id_fkey;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

CREATE TABLE public.device_aliases (
  device_id text PRIMARY KEY,
  number int NOT NULL GENERATED BY DEFAULT AS IDENTITY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.device_aliases TO anon, authenticated;
GRANT ALL ON public.device_aliases TO service_role;
ALTER TABLE public.device_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads aliases" ON public.device_aliases FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.admin_devices (
  device_id text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_devices TO anon, authenticated;
GRANT ALL ON public.admin_devices TO service_role;
ALTER TABLE public.admin_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone checks admin devices" ON public.admin_devices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage admin devices" ON public.admin_devices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.assign_anon_number(_device_id text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.device_aliases(device_id) VALUES (_device_id) ON CONFLICT (device_id) DO NOTHING;
  SELECT number INTO n FROM public.device_aliases WHERE device_id = _device_id;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.posts_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.anon_number := public.assign_anon_number(NEW.device_id);
  IF NEW.user_id IS NOT NULL AND public.has_role(NEW.user_id, 'admin') THEN
    NEW.status := 'approved';
  ELSIF EXISTS (SELECT 1 FROM public.admin_devices WHERE device_id = NEW.device_id) THEN
    NEW.status := 'approved';
    NEW.pinned := false;
    NEW.user_id := NULL;
  ELSE
    NEW.status := 'pending';
    NEW.author_name := NULL;
    NEW.user_id := NULL;
    NEW.pinned := false;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posts_before_insert_trg BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_before_insert();

CREATE OR REPLACE FUNCTION public.comments_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.anon_number := public.assign_anon_number(NEW.device_id);
  RETURN NEW;
END $$;
CREATE TRIGGER comments_before_insert_trg BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comments_before_insert();

DROP POLICY IF EXISTS "anyone can read posts" ON public.posts;
DROP POLICY IF EXISTS "non-blocked can post" ON public.posts;
DROP POLICY IF EXISTS "admins delete posts" ON public.posts;

CREATE POLICY "read approved or admin"
  ON public.posts FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "non-blocked can insert"
  ON public.posts FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(content) > 0 AND length(content) <= 5000
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = posts.device_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY "admins update posts"
  ON public.posts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins delete posts"
  ON public.posts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

 ------------------------------------------------------------------------------
 --  20260603104917_e6c719aa-1940-4012-9b2b-41951e7ddaf1.sql
 ------------------------------------------------------------------------------

-- 1) Update auto-admin trigger to support both emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email IN ('abdalrhmanmaaith24@gmail.com', 'abdalrahmanjarrah94@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Make sure trigger exists on auth.users
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- 2) Backfill admin role for already-existing admin emails
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users
WHERE email IN ('abdalrhmanmaaith24@gmail.com', 'abdalrahmanjarrah94@gmail.com')
ON CONFLICT DO NOTHING;

-- 3) Post likes table
CREATE TABLE IF NOT EXISTS public.post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, device_id)
);

GRANT SELECT, INSERT, DELETE ON public.post_likes TO anon, authenticated;
GRANT ALL ON public.post_likes TO service_role;

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads likes" ON public.post_likes
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "non-blocked can like" ON public.post_likes
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(device_id) >= 8 AND length(device_id) <= 128
    AND NOT EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = post_likes.device_id)
  );

CREATE POLICY "owners can unlike" ON public.post_likes
  FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "admins delete likes" ON public.post_likes
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;

 ------------------------------------------------------------------------------
 --  20260603105411_c769c9f8-c5bd-4fff-b772-c2bd2b85cac6.sql
 ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

 ------------------------------------------------------------------------------
 --  20260604121129_aea1f25b-326e-4741-b7c5-c998f70c1ad0.sql
 ------------------------------------------------------------------------------

-- 1) Revoke EXECUTE on trigger-only / internal SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.assign_anon_number(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.comments_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.posts_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2) post_likes: replace overly-permissive DELETE policy with owner-scoped RPC
DROP POLICY IF EXISTS "owners can unlike" ON public.post_likes;

CREATE OR REPLACE FUNCTION public.unlike_post(p_post_id uuid, p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  DELETE FROM public.post_likes
   WHERE post_id = p_post_id AND device_id = p_device_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unlike_post(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlike_post(uuid, text) TO anon, authenticated;

-- 3) device_aliases: stop exposing the full device_id -> number map publicly
DROP POLICY IF EXISTS "anyone reads aliases" ON public.device_aliases;
REVOKE SELECT ON public.device_aliases FROM anon, authenticated;
-- Keep service_role access for admin/server code
GRANT ALL ON public.device_aliases TO service_role;

-- 4) Storage: drop broad SELECT (listing) policy on attachments.
-- Bucket remains public so direct getPublicUrl downloads still work without listing.
DROP POLICY IF EXISTS "public read attachments" ON storage.objects;

-- 5) Storage: restrict uploads to safe mime types
DROP POLICY IF EXISTS "anyone upload attachments" ON storage.objects;
CREATE POLICY "anyone upload attachments safe"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND (
    lower(storage.extension(name)) = ANY (
      ARRAY['png','jpg','jpeg','gif','webp','pdf','txt','doc','docx','zip']
    )
  )
);

 ------------------------------------------------------------------------------
 --  20260604121350_0c5104e9-e974-4c11-80c4-54ba4085c07f.sql
 ------------------------------------------------------------------------------

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

 ------------------------------------------------------------------------------
 --  20260605174650_9c5f3376-72c1-44e8-a0d4-8edd271f8b6d.sql
 ------------------------------------------------------------------------------

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

 ------------------------------------------------------------------------------
 --  20260607040826_4b961023-8481-402d-b006-71eff50b02bb.sql
 ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.posts_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.anon_number := floor(random() * 9999 + 1)::int;
  IF NEW.user_id IS NOT NULL AND public.has_role(NEW.user_id, 'admin') THEN
    NEW.status := 'approved';
  ELSIF EXISTS (SELECT 1 FROM public.admin_devices WHERE device_id = NEW.device_id) THEN
    NEW.status := 'approved';
    NEW.pinned := false;
    NEW.user_id := NULL;
  ELSE
    NEW.status := 'pending';
    NEW.author_name := NULL;
    NEW.user_id := NULL;
    NEW.pinned := false;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.comments_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.anon_number := floor(random() * 9999 + 1)::int;
  RETURN NEW;
END $function$;

 ------------------------------------------------------------------------------
 --  20260608042802_204881f0-e820-45d6-9a90-4257e28ad7b2.sql
 ------------------------------------------------------------------------------

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_avatar_url text;
ALTER TABLE public.admin_devices ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.admin_devices ADD COLUMN IF NOT EXISTS avatar_url text;

 ------------------------------------------------------------------------------
 --  20260701023529_d5dc8fb4-3be5-4421-98d9-0bcc3645bf8d.sql
 ------------------------------------------------------------------------------

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

 ------------------------------------------------------------------------------
 --  20260701023616_dca51ee3-4d4e-447f-8ef6-d3c44b378df9.sql
 ------------------------------------------------------------------------------

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS author_avatar_url text;

CREATE OR REPLACE FUNCTION public.comments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
BEGIN
  NEW.anon_number := floor(random() * 9999 + 1)::int;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    NEW.is_admin := true;
    SELECT display_name, avatar_url INTO a
      FROM public.admin_devices WHERE device_id = NEW.device_id LIMIT 1;
    IF a IS NOT NULL THEN
      NEW.author_name := a.display_name;
      NEW.author_avatar_url := a.avatar_url;
    END IF;
  ELSE
    NEW.is_admin := false;
    NEW.author_name := NULL;
    NEW.author_avatar_url := NULL;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.comments_before_insert() FROM PUBLIC, anon, authenticated;

 ------------------------------------------------------------------------------
 --  20260701024033_44b7cfa4-b771-4e43-9eaf-2a86347b7026.sql
 ------------------------------------------------------------------------------

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

 ------------------------------------------------------------------------------
 --  20260702184213_c9f87a83-2554-4485-ae42-8e24ec825491.sql
 ------------------------------------------------------------------------------

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

 ------------------------------------------------------------------------------
 --  20260703104207_a06635ef-cc67-4913-8fb6-6a61c1b4c4c5.sql
 ------------------------------------------------------------------------------

-- 1. Fix mutable search_path on validate_attachments
CREATE OR REPLACE FUNCTION public.validate_attachments()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
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
$function$;

-- 2. Revoke EXECUTE from PUBLIC/anon/authenticated on all SECURITY DEFINER functions.
--    Trigger-only functions need no grants (triggers ignore EXECUTE grants and run as function owner).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.posts_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.comments_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_posts_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_comments_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_post_edit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_comment_edit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_attachments() FROM PUBLIC, anon, authenticated;

-- 3. RPC functions callable from the client: revoke from PUBLIC, grant only to the
--    roles that must call them. has_role is used inside RLS expressions so both
--    anon and authenticated need EXECUTE for policies to evaluate.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

-- Admin-only RPCs: only signed-in admins should call these; the function itself checks the role.
REVOKE EXECUTE ON FUNCTION public.get_device_dossier(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_device_dossier(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_device_label(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_device_label(text, text) TO authenticated;

-- Device-scoped RPCs the anonymous client needs (edits, unlikes, alias, heartbeat).
-- These stay SECURITY DEFINER because RLS on the underlying tables has no
-- device-scoped UPDATE/DELETE policy for anon; the functions do their own
-- device_id ownership check. Restrict to anon+authenticated (deny PUBLIC).
REVOKE EXECUTE ON FUNCTION public.edit_post(uuid, text, text)         FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.edit_post(uuid, text, text)         TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.edit_comment(uuid, text, text)      FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.edit_comment(uuid, text, text)      TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.edit_chat_post(uuid, text, text)    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.edit_chat_post(uuid, text, text)    TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.edit_chat_comment(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.edit_chat_comment(uuid, text, text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unlike_post(uuid, text)             FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.unlike_post(uuid, text)             TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unlike_chat_post(uuid, text)        FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.unlike_chat_post(uuid, text)        TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_anon_number(text)            FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.assign_anon_number(text)            TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.heartbeat_device(text, integer)     FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.heartbeat_device(text, integer)     TO anon, authenticated;

 ------------------------------------------------------------------------------
 --  20260703104659_3d21a73c-e80a-4d9e-a48c-7a867d4a2a46.sql
 ------------------------------------------------------------------------------

-- =========================================================
-- 1. FINGERPRINT TRACKING
-- =========================================================
CREATE TABLE IF NOT EXISTS public.device_fingerprints (
  device_id text NOT NULL,
  ip_hash   text NOT NULL,
  ua_hash   text NOT NULL DEFAULT '',
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  hits int NOT NULL DEFAULT 1,
  PRIMARY KEY (device_id, ip_hash)
);
GRANT ALL ON public.device_fingerprints TO service_role;
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read fingerprints" ON public.device_fingerprints
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS device_fingerprints_ip_idx  ON public.device_fingerprints(ip_hash);
CREATE INDEX IF NOT EXISTS device_fingerprints_dev_idx ON public.device_fingerprints(device_id);

-- =========================================================
-- 2. BANNED FINGERPRINTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.banned_fingerprints (
  ip_hash text PRIMARY KEY,
  reason  text,
  origin_device_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.banned_fingerprints TO service_role;
ALTER TABLE public.banned_fingerprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read banned fps" ON public.banned_fingerprints
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trigger: when a device is blocked, mirror all of its known fingerprints
CREATE OR REPLACE FUNCTION public.mirror_device_to_fingerprints()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.banned_fingerprints(ip_hash, reason, origin_device_id)
  SELECT df.ip_hash,
         COALESCE(NEW.reason, 'device ban'),
         NEW.device_id
    FROM public.device_fingerprints df
   WHERE df.device_id = NEW.device_id
  ON CONFLICT (ip_hash) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.mirror_device_to_fingerprints() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS blocked_devices_mirror_fps ON public.blocked_devices;
CREATE TRIGGER blocked_devices_mirror_fps
  AFTER INSERT ON public.blocked_devices
  FOR EACH ROW EXECUTE FUNCTION public.mirror_device_to_fingerprints();

-- =========================================================
-- 3. RECORD FINGERPRINT + AUTO-BAN NEW DEVICES ON MATCH
-- =========================================================
CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(
  p_device_id text,
  p_ip_hash   text,
  p_ua_hash   text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  banned boolean := false;
  reason_text text := null;
  match_reason text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;
  IF p_ip_hash IS NULL OR length(p_ip_hash) < 8 THEN
    p_ip_hash := 'unknown';
  END IF;

  -- Already device-banned?
  SELECT true, reason INTO banned, reason_text
    FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF banned THEN
    RETURN jsonb_build_object('banned', true, 'reason', COALESCE(reason_text,'محظور'));
  END IF;

  -- Record the fingerprint
  INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
       VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
  ON CONFLICT (device_id, ip_hash) DO UPDATE
       SET last_seen = now(),
           hits = public.device_fingerprints.hits + 1;

  -- Is the network fingerprint already banned?
  SELECT reason INTO match_reason
    FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash LIMIT 1;
  IF match_reason IS NOT NULL THEN
    -- Auto-ban this device_id too so RLS blocks it everywhere.
    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (p_device_id, 'fingerprint match: ' || match_reason)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('banned', true, 'reason', match_reason);
  END IF;

  RETURN jsonb_build_object('banned', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text) TO anon, authenticated;

-- Quick banned check (no fingerprint write)
CREATE OR REPLACE FUNCTION public.check_visitor_banned(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r text;
BEGIN
  SELECT reason INTO r FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF r IS NOT NULL THEN
    RETURN jsonb_build_object('banned', true, 'reason', COALESCE(r,'محظور'));
  END IF;
  RETURN jsonb_build_object('banned', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.check_visitor_banned(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_visitor_banned(text) TO anon, authenticated;

-- =========================================================
-- 4. REPORTS SYSTEM
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_device_id text NOT NULL,
  content_type       text NOT NULL CHECK (content_type IN ('post','comment','chat_post','chat_comment')),
  content_id         uuid NOT NULL,
  content_owner_device_id text,
  content_snapshot   text,
  reason_code        text NOT NULL,
  reason_text        text,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed','content_deleted')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  resolved_by        uuid,
  resolution_note    text,
  UNIQUE (reporter_device_id, content_type, content_id)
);
GRANT ALL ON public.reports TO service_role;
GRANT SELECT ON public.reports TO authenticated;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read reports" ON public.reports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage reports" ON public.reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_target_idx ON public.reports(content_type, content_id);

-- Submit report RPC
CREATE OR REPLACE FUNCTION public.submit_report(
  p_reporter_device_id text,
  p_content_type       text,
  p_content_id         uuid,
  p_reason_code        text,
  p_reason_text        text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_did text;
  snap text;
BEGIN
  IF p_reporter_device_id IS NULL OR length(p_reporter_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_content_type NOT IN ('post','comment','chat_post','chat_comment') THEN
    RAISE EXCEPTION 'invalid content type';
  END IF;
  IF p_reason_code IS NULL OR length(btrim(p_reason_code)) = 0 THEN
    RAISE EXCEPTION 'reason required';
  END IF;
  IF p_reason_text IS NOT NULL AND length(p_reason_text) > 500 THEN
    RAISE EXCEPTION 'reason too long';
  END IF;

  -- Reporter must not be banned
  IF EXISTS (SELECT 1 FROM public.blocked_devices WHERE device_id = p_reporter_device_id) THEN
    RAISE EXCEPTION 'banned';
  END IF;

  IF p_content_type = 'post' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.posts WHERE id = p_content_id;
  ELSIF p_content_type = 'comment' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.comments WHERE id = p_content_id;
  ELSIF p_content_type = 'chat_post' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.chat_posts WHERE id = p_content_id;
  ELSIF p_content_type = 'chat_comment' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.chat_comments WHERE id = p_content_id;
  END IF;

  IF owner_did IS NULL THEN
    RAISE EXCEPTION 'content not found';
  END IF;

  INSERT INTO public.reports(
    reporter_device_id, content_type, content_id,
    content_owner_device_id, content_snapshot,
    reason_code, reason_text
  ) VALUES (
    p_reporter_device_id, p_content_type, p_content_id,
    owner_did, snap,
    p_reason_code, NULLIF(btrim(p_reason_text),'')
  )
  ON CONFLICT (reporter_device_id, content_type, content_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_report(text,text,uuid,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_report(text,text,uuid,text,text) TO anon, authenticated;

-- Admin resolve report
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id uuid,
  p_action    text,       -- 'dismissed' | 'resolved' | 'content_deleted' | 'ban_owner'
  p_note      text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.reports;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO r FROM public.reports WHERE id = p_report_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;

  IF p_action = 'ban_owner' THEN
    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (r.content_owner_device_id, COALESCE(p_note,'report ban'))
    ON CONFLICT DO NOTHING;
    UPDATE public.reports
       SET status='resolved', resolved_at=now(), resolved_by=auth.uid(), resolution_note=COALESCE(p_note,'ban owner')
     WHERE id = p_report_id;
  ELSIF p_action = 'content_deleted' THEN
    IF r.content_type='post' THEN DELETE FROM public.posts WHERE id = r.content_id;
    ELSIF r.content_type='comment' THEN DELETE FROM public.comments WHERE id = r.content_id;
    ELSIF r.content_type='chat_post' THEN DELETE FROM public.chat_posts WHERE id = r.content_id;
    ELSIF r.content_type='chat_comment' THEN DELETE FROM public.chat_comments WHERE id = r.content_id;
    END IF;
    UPDATE public.reports
       SET status='content_deleted', resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
    -- mark all other open reports on same content as content_deleted
    UPDATE public.reports SET status='content_deleted', resolved_at=now(), resolved_by=auth.uid()
     WHERE content_type = r.content_type AND content_id = r.content_id AND status='open' AND id <> p_report_id;
  ELSIF p_action IN ('dismissed','resolved') THEN
    UPDATE public.reports
       SET status=p_action, resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
  ELSE
    RAISE EXCEPTION 'invalid action';
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_report(uuid,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_resolve_report(uuid,text,text) TO authenticated;

 ------------------------------------------------------------------------------
 --  20260704020026_ce2a080b-d1af-4524-a969-5dd5f7f8d083.sql
 ------------------------------------------------------------------------------

-- 1. Extend blocked_devices
ALTER TABLE public.blocked_devices
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_url text,
  ADD COLUMN IF NOT EXISTS evidence_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS banned_by uuid;

-- 2. When a block is removed, wipe related fingerprint bans + fingerprint rows
CREATE OR REPLACE FUNCTION public.cleanup_device_ban_artifacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.banned_fingerprints
    WHERE origin_device_id = OLD.device_id
       OR ip_hash IN (SELECT ip_hash FROM public.device_fingerprints WHERE device_id = OLD.device_id);
  DELETE FROM public.device_fingerprints WHERE device_id = OLD.device_id;
  RETURN OLD;
END $$;

REVOKE EXECUTE ON FUNCTION public.cleanup_device_ban_artifacts() FROM PUBLIC;

DROP TRIGGER IF EXISTS blocked_devices_cleanup_fps ON public.blocked_devices;
CREATE TRIGGER blocked_devices_cleanup_fps
AFTER DELETE ON public.blocked_devices
FOR EACH ROW EXECUTE FUNCTION public.cleanup_device_ban_artifacts();

-- 3. Update check_visitor_banned to auto-expire temp bans and expose evidence
CREATE OR REPLACE FUNCTION public.check_visitor_banned(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.blocked_devices;
BEGIN
  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NULL THEN
    RETURN jsonb_build_object('banned', false);
  END IF;
  IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
    DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    RETURN jsonb_build_object('banned', false);
  END IF;
  RETURN jsonb_build_object(
    'banned', true,
    'reason', COALESCE(b.reason, 'محظور'),
    'expires_at', b.expires_at,
    'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END
  );
END $$;

-- 4. Update record_visitor_fingerprint similarly
CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(p_device_id text, p_ip_hash text, p_ua_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.blocked_devices;
  match_reason text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;
  IF p_ip_hash IS NULL OR length(p_ip_hash) < 8 THEN
    p_ip_hash := 'unknown';
  END IF;

  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
      DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    ELSE
      RETURN jsonb_build_object(
        'banned', true,
        'reason', COALESCE(b.reason, 'محظور'),
        'expires_at', b.expires_at,
        'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END
      );
    END IF;
  END IF;

  INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
       VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
  ON CONFLICT (device_id, ip_hash) DO UPDATE
       SET last_seen = now(),
           hits = public.device_fingerprints.hits + 1;

  SELECT reason INTO match_reason
    FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash LIMIT 1;
  IF match_reason IS NOT NULL THEN
    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (p_device_id, 'fingerprint match: ' || match_reason)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('banned', true, 'reason', match_reason);
  END IF;

  RETURN jsonb_build_object('banned', false);
END $$;

-- 5. Admin ban with reason + optional evidence + optional expiry
CREATE OR REPLACE FUNCTION public.admin_ban_device(
  p_device_id text,
  p_reason text,
  p_evidence_url text,
  p_expires_at timestamptz,
  p_evidence_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason required';
  END IF;
  IF p_evidence_url IS NOT NULL AND length(p_evidence_url) > 0
     AND p_evidence_url !~ '^https?://[a-zA-Z0-9.-]+/storage/v1/object/public/attachments/' THEN
    RAISE EXCEPTION 'invalid evidence url';
  END IF;
  INSERT INTO public.blocked_devices(device_id, reason, expires_at, evidence_url, evidence_visible, banned_by)
  VALUES (p_device_id, btrim(p_reason), p_expires_at, NULLIF(p_evidence_url,''), COALESCE(p_evidence_visible, true), auth.uid())
  ON CONFLICT (device_id) DO UPDATE
    SET reason = EXCLUDED.reason,
        expires_at = EXCLUDED.expires_at,
        evidence_url = EXCLUDED.evidence_url,
        evidence_visible = EXCLUDED.evidence_visible,
        banned_by = EXCLUDED.banned_by;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_ban_device(text,text,text,timestamptz,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ban_device(text,text,text,timestamptz,boolean) TO authenticated;

-- 6. Admin unban helper (also usable by RLS via delete, but exposes an RPC for consistency)
CREATE OR REPLACE FUNCTION public.admin_unban_device(p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_unban_device(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unban_device(text) TO authenticated;

-- 7. Secret bypass code accessible to any visitor (device-scoped: only removes their own ban)
CREATE OR REPLACE FUNCTION public.bypass_ban_with_code(p_device_id text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  IF p_code IS NULL OR p_code <> '200920092009' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) TO anon, authenticated;

-- 8. Update admin_resolve_report ban action to require a reason and carry it into the block
CREATE OR REPLACE FUNCTION public.admin_resolve_report(p_report_id uuid, p_action text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.reports;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO r FROM public.reports WHERE id = p_report_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;

  IF p_action = 'ban_owner' THEN
    IF p_note IS NULL OR length(btrim(p_note)) = 0 THEN
      RAISE EXCEPTION 'reason required';
    END IF;
    INSERT INTO public.blocked_devices(device_id, reason, banned_by)
    VALUES (r.content_owner_device_id, btrim(p_note), auth.uid())
    ON CONFLICT (device_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by;
    UPDATE public.reports SET status='resolved', resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
  ELSIF p_action = 'content_deleted' THEN
    IF r.content_type='post' THEN DELETE FROM public.posts WHERE id = r.content_id;
    ELSIF r.content_type='comment' THEN DELETE FROM public.comments WHERE id = r.content_id;
    ELSIF r.content_type='chat_post' THEN DELETE FROM public.chat_posts WHERE id = r.content_id;
    ELSIF r.content_type='chat_comment' THEN DELETE FROM public.chat_comments WHERE id = r.content_id;
    END IF;
    UPDATE public.reports SET status='content_deleted', resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
    UPDATE public.reports SET status='content_deleted', resolved_at=now(), resolved_by=auth.uid()
     WHERE content_type = r.content_type AND content_id = r.content_id AND status='open' AND id <> p_report_id;
  ELSIF p_action IN ('dismissed','resolved') THEN
    UPDATE public.reports SET status=p_action, resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
  ELSE
    RAISE EXCEPTION 'invalid action';
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

 ------------------------------------------------------------------------------
 --  20260904000001_bot_admin_madrekjo.sql
 ------------------------------------------------------------------------------
-- ============================================================================
-- Migration: تكوين madrekjo@gmail.com كـ بوت ادمن في أنا مجهول
-- ============================================================================
-- الغرض: لما تدخل ادمن في الموقع، يبان اسمك "Bot" وملصق الجهاز "bot"
--
-- ملاحظة مهمة: جدول admin_devices في هذا المشروع ما لهش رابط بـ auth.users.id.
-- لازم تدخل الجهاز ID بتاعك بعد ما تدخل مرة واحدة للموقع عشان ي تسجل الجهاز.
-- تقدر تاخذ الجهاز ID من localStorage (مفتاح "anon_device_id") ومن الأدمن بانل.
--
-- بعد ما تدخل مرة واحدة، شغل الأمر ده في SQL Editor:
--   SELECT public.set_device_bot_label('YOUR_DEVICE_ID_HERE');
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_device_bot_label(p_device_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_device_exists boolean;
BEGIN
  -- تتأكد الجهاز مسجل في admin_devices
  SELECT EXISTS(SELECT 1 FROM public.admin_devices WHERE device_id = p_device_id) INTO v_device_exists;
  IF NOT v_device_exists THEN
    RAISE EXCEPTION 'الجهاز % مش مسجل في admin_devices. ادخل الموقع مرة اولى اول.';
  END IF;

  -- حط display_name = 'Bot' في admin_devices
  INSERT INTO public.admin_devices (device_id, display_name, note)
  VALUES (p_device_id, 'Bot 🤖', 'bot admin')
  ON CONFLICT (device_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    note = EXCLUDED.note;

  -- حط ملصق 'bot' في device_notes
  INSERT INTO public.device_notes (device_id, label, updated_by)
  VALUES (p_device_id, 'bot', auth.uid())
  ON CONFLICT (device_id) DO UPDATE SET
    label = EXCLUDED.label,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN 'تم تعيين Bot 🤖 كـ display_name و bot كـ label للجهاز ' || p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_device_bot_label(text) TO authenticated;

-- ============================================================================
-- شغّل الأمر ده بعد ما تدخل مرة واحدة للموقع:
--   SELECT public.set_device_bot_label('جهز_ك_هنا');
-- ============================================================================

 ------------------------------------------------------------------------------
 --  20260905000000_fix_fingerprint_unknown_cascade.sql
 ------------------------------------------------------------------------------
-- ============================================================================
-- FIX: بصمة الـ IP كانت ثابتة 'unknown' لكل الأجهزة، فكان كل بان بيبان ع كل الموقع
-- يمنع المطابقة/النسخ بصمة 'unknown' نهائيا + تنظيف أي بصمة متبقية منها
-- ============================================================================

-- 1) مسح أي بصمة 'unknown' متبقية (مصدر الانهيار)
DELETE FROM public.banned_fingerprints WHERE ip_hash = 'unknown';

-- 2) ما ننسخ أبدا بصمة 'unknown' لما بندنا جهاز (كانت بتعني "كل الأجهزة")
CREATE OR REPLACE FUNCTION public.mirror_device_to_fingerprints()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.banned_fingerprints(ip_hash, reason, origin_device_id)
  SELECT df.ip_hash,
         COALESCE(NEW.reason, 'device ban'),
         NEW.device_id
    FROM public.device_fingerprints df
   WHERE df.device_id = NEW.device_id
     AND df.ip_hash IS DISTINCT FROM 'unknown'
  ON CONFLICT (ip_hash) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.mirror_device_to_fingerprints() FROM PUBLIC, anon, authenticated;

-- 3) ما نطابق بصمة 'unknown' أبدا في فحص الزوار (كانت بتان كل الموقع بعده)
CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(p_device_id text, p_ip_hash text, p_ua_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.blocked_devices;
  match_reason text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
      DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    ELSE
      RETURN jsonb_build_object(
        'banned', true,
        'reason', COALESCE(b.reason, 'محظور'),
        'expires_at', b.expires_at,
        'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END
      );
    END IF;
  END IF;

  -- بصمة IP حقيقية فقط (10+ خانات) بتسجل؛ أما 'unknown' فمتجاهلة
  IF p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;

    SELECT reason INTO match_reason
      FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash LIMIT 1;
    IF match_reason IS NOT NULL THEN
      INSERT INTO public.blocked_devices(device_id, reason)
      VALUES (p_device_id, 'fingerprint match: ' || match_reason)
      ON CONFLICT DO NOTHING;
      RETURN jsonb_build_object('banned', true, 'reason', match_reason);
    END IF;
  END IF;

  RETURN jsonb_build_object('banned', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text) TO anon, authenticated;

 ------------------------------------------------------------------------------
 --  20260913000000_strong_fingerprint_signatures.sql
 ------------------------------------------------------------------------------
-- ============================================================================
-- STRONG FINGERPRINT: بصمة متعددة الأجزاء (multi-signature)
-- ----------------------------------------------------------------
-- المشكلة: المحظور كان يفلت بمجرد مسح localStorage / وضع التصفح المتخفي /
-- جهاز_id جديد، لأن الحظر كان يعتمد على معرف وهمي + IP فقط.
-- الحل:
--  1) device_signatures : كل جهاز يخزّن كل بصماته المستقلة
--     (canvas / webgl / webgl2 / audio / fonts / screen / hw / tz / ip / ua / fp)
--  2) banned_signatures : عند حظر جهاز، تنسخ كل بصماته إلى قائمة المحظورة
--  3) عند كل زيارة: أي تطابق بصمة جهاز "قوية" واحدة (canvas/webgl/audio/fonts/fp)
--     => حظر فوري حتى لو كان جهاز_id جديد كلياً أو IP مختلف (VPN).
-- ============================================================================

-- =========================================================
-- 1. جدول بصمات الأجهزة (تسجيل كل ما يعرّف الجهاز فعلياً)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.device_signatures (
  device_id text NOT NULL,
  sig_type  text NOT NULL,
  sig_value text NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, sig_type, sig_value)
);
GRANT ALL ON public.device_signatures TO service_role;
ALTER TABLE public.device_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read device signatures" ON public.device_signatures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS device_sigs_dev_idx  ON public.device_signatures(device_id);
CREATE INDEX IF NOT EXISTS device_sigs_val_idx ON public.device_signatures(sig_type, sig_value);

-- =========================================================
-- 2. جدول البصمات المحظورة (يُبَنى تلقائياً من الأجهزة المحظورة)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.banned_signatures (
  sig_type         text NOT NULL,
  sig_value        text NOT NULL,
  reason           text,
  origin_device_id text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sig_type, sig_value)
);
GRANT ALL ON public.banned_signatures TO service_role;
ALTER TABLE public.banned_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read banned signatures" ON public.banned_signatures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS banned_sigs_origin_idx ON public.banned_signatures(origin_device_id);

-- =========================================================
-- 3. عند حظر جهاز: انسخ كل بصماته (القديمة + الجديدة) لقائمة المحظورة
-- =========================================================
CREATE OR REPLACE FUNCTION public.mirror_device_to_fingerprints()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.banned_fingerprints(ip_hash, reason, origin_device_id)
  SELECT df.ip_hash,
         COALESCE(NEW.reason, 'device ban'),
         NEW.device_id
    FROM public.device_fingerprints df
   WHERE df.device_id = NEW.device_id
     AND df.ip_hash IS DISTINCT FROM 'unknown'
  ON CONFLICT (ip_hash) DO NOTHING;

  INSERT INTO public.banned_signatures(sig_type, sig_value, reason, origin_device_id)
  SELECT ds.sig_type, ds.sig_value,
         COALESCE(NEW.reason, 'device ban'),
         NEW.device_id
    FROM public.device_signatures ds
   WHERE ds.device_id = NEW.device_id
     AND ds.sig_value IS DISTINCT FROM 'unknown'
  ON CONFLICT (sig_type, sig_value) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.mirror_device_to_fingerprints() FROM PUBLIC, anon, authenticated;

-- =========================================================
-- 4. عند فك الحظر: امسح البصمات المرتبطة بالجهاز من كل الجداول
-- =========================================================
CREATE OR REPLACE FUNCTION public.cleanup_device_ban_artifacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.banned_fingerprints
    WHERE origin_device_id = OLD.device_id
       OR ip_hash IN (SELECT ip_hash FROM public.device_fingerprints WHERE device_id = OLD.device_id);
  DELETE FROM public.device_fingerprints WHERE device_id = OLD.device_id;

  DELETE FROM public.banned_signatures
    WHERE origin_device_id = OLD.device_id
       OR (sig_type, sig_value) IN (SELECT sig_type, sig_value FROM public.device_signatures WHERE device_id = OLD.device_id);
  DELETE FROM public.device_signatures WHERE device_id = OLD.device_id;
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.cleanup_device_ban_artifacts() FROM PUBLIC;

DROP TRIGGER IF EXISTS blocked_devices_cleanup_fps ON public.blocked_devices;
CREATE TRIGGER blocked_devices_cleanup_fps
  AFTER DELETE ON public.blocked_devices
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_device_ban_artifacts();

-- =========================================================
-- 5. فحص/تسجيل الزائر بنظام البصمة القوية
-- =========================================================
CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(
  p_device_id   text,
  p_ip_hash     text,
  p_ua_hash     text,
  p_canvas_hash text DEFAULT NULL,
  p_webgl_hash  text DEFAULT NULL,
  p_audio_hash  text DEFAULT NULL,
  p_fonts_hash  text DEFAULT NULL,
  p_screen_hash text DEFAULT NULL,
  p_fp_hash     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.blocked_devices;
  match_reason text;
  strong_hits int;
  ip_hit boolean;
  pair_hit boolean;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  -- 0) هل الجهاز محظور أصلاً؟
  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
      DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    ELSE
      RETURN jsonb_build_object(
        'banned', true,
        'reason', COALESCE(b.reason, 'محظور'),
        'expires_at', b.expires_at,
        'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END
      );
    END IF;
  END IF;

  -- 1) سجّل كل البصمات الواردة (بدون بصمة 'unknown' أو القصيرة)
  INSERT INTO public.device_signatures(device_id, sig_type, sig_value)
  SELECT p_device_id, v.t, v.val
    FROM (VALUES
      ('ip'::text,     p_ip_hash),
      ('ua',           p_ua_hash),
      ('canvas',       p_canvas_hash),
      ('webgl',        p_webgl_hash),
      ('audio',        p_audio_hash),
      ('fonts',        p_fonts_hash),
      ('screen',       p_screen_hash),
      ('fp',           p_fp_hash)
    ) AS v(t, val)
   WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  ON CONFLICT (device_id, sig_type, sig_value) DO UPDATE
    SET last_seen = now();

  -- 2) حافظ على الجدول القديم (للتوافق مع المطابقة السابقة وتصفح الأدمن)
  IF p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown' THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;
  END IF;

  -- 3) مطابقة البصمات المحظورة:
  --    a) أي بصمة جهاز قوية واحدة (canvas/webgl/audio/fonts/fp) متطابقة => حظر
  strong_hits := (
    SELECT count(*)::int
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('webgl',        p_webgl_hash),
        ('audio',        p_audio_hash),
        ('fonts',        p_fonts_hash),
        ('fp',           p_fp_hash)
      ) v(t, val)
      JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
     WHERE v.val IS NOT NULL AND length(v.val) >= 8
  );

  --    b) IP نفس IP محظور (السلوك التاريخي)
  ip_hit := (p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown')
        AND (EXISTS (SELECT 1 FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash)
          OR EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'ip' AND sig_value = p_ip_hash));

  --    c) أي مزيج screen+ua متطابق (يقبض على VPN + متصفح مختلف بنفس الشاشة)
  pair_hit := (p_screen_hash IS NOT NULL AND length(p_screen_hash) >= 8
               AND EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'screen' AND sig_value = p_screen_hash))
          AND (p_ua_hash IS NOT NULL AND length(p_ua_hash) >= 8
               AND EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'ua' AND sig_value = p_ua_hash));

  IF strong_hits >= 1 OR ip_hit OR pair_hit THEN
    SELECT bs.reason INTO match_reason
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('webgl',        p_webgl_hash),
        ('audio',        p_audio_hash),
        ('fonts',        p_fonts_hash),
        ('fp',           p_fp_hash)
      ) v(t, val)
      JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
     WHERE v.val IS NOT NULL AND length(v.val) >= 8
     LIMIT 1;

    IF match_reason IS NULL AND ip_hit THEN
      SELECT reason INTO match_reason FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash LIMIT 1;
    END IF;
    IF match_reason IS NULL THEN match_reason := 'fingerprint match'; END IF;

    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (p_device_id, 'fingerprint match: ' || COALESCE(match_reason, 'device ban'))
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('banned', true, 'reason', match_reason);
  END IF;

  RETURN jsonb_build_object('banned', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;

-- =========================================================
-- 6. لوحة الأدمن: عرض بصمات الجهاز داخل ملف الجهاز
-- =========================================================
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
    'sigs', (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', s.sig_type, 'value', left(s.sig_value, 40), 'last_seen', s.last_seen) ORDER BY s.last_seen DESC), '[]'::jsonb)
              FROM public.device_signatures s WHERE s.device_id = p_device_id),
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

 ------------------------------------------------------------------------------
 --  20260922000000_change_bypass_ban_code.sql
 ------------------------------------------------------------------------------
-- تغيير رمز كسر الحظر السري في دالة bypass_ban_with_code
-- الرمز الجديد: aabbdd99

CREATE OR REPLACE FUNCTION public.bypass_ban_with_code(p_device_id text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  IF p_code IS NULL OR p_code <> 'aabbdd99' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) TO anon, authenticated;

 ------------------------------------------------------------------------------
 --  20260922000001_posts_allow_comments.sql
 ------------------------------------------------------------------------------
-- السماح أو منع التعليقات على مستوى المنشور
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS allow_comments boolean NOT NULL DEFAULT true;

-- منع إدراج تعليقات على منشور عُطّلت التعليقات عنه (RLS يشمل الأبناء)
DROP POLICY IF EXISTS "non-blocked can comment" ON public.comments;
CREATE POLICY "non-blocked can comment" ON public.comments FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(content) > 0 AND length(content) <= 2000
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = comments.device_id)
    AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id AND p.allow_comments = true)
  );

GRANT SELECT, INSERT ON public.comments TO anon, authenticated;
GRANT ALL ON public.comments TO service_role;

 ------------------------------------------------------------------------------
 --  20260925000000_device_warnings.sql
 ------------------------------------------------------------------------------
-- =========================================================
-- نظام التحذير: رسالة تحذير من الإدارة تظهر للزائر
-- كشاشة حمراء كاملة + صوت إنذار + نص أبيض، بدون حظر.
-- =========================================================

-- 1) جدول التحذيرات (لا يُقرأ مباشرة من anon — الوصول عبر RPC فقط)
CREATE TABLE IF NOT EXISTS public.device_warnings (
  device_id  text PRIMARY KEY,
  message    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  seen_at    timestamptz
);

GRANT ALL ON public.device_warnings TO service_role;
ALTER TABLE public.device_warnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage warnings" ON public.device_warnings;
CREATE POLICY "admins manage warnings" ON public.device_warnings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS device_warnings_created_at_idx
  ON public.device_warnings (created_at DESC);

-- 2) الإدارة ترسل/تحدّث تحذيراً لجهاز (seen_at = NULL => يظهر من جديد)
CREATE OR REPLACE FUNCTION public.admin_warn_device(p_device_id text, p_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_message IS NULL OR length(btrim(p_message)) = 0 THEN
    RAISE EXCEPTION 'message required';
  END IF;
  INSERT INTO public.device_warnings(device_id, message, created_by, seen_at)
  VALUES (p_device_id, left(btrim(p_message), 500), auth.uid(), NULL)
  ON CONFLICT (device_id) DO UPDATE
    SET message = EXCLUDED.message,
        created_at = now(),
        created_by = EXCLUDED.created_by,
        seen_at = NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_warn_device(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_warn_device(text,text) TO authenticated;

-- 3) الإدارة تلغي التحذير
CREATE OR REPLACE FUNCTION public.admin_clear_warning(p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.device_warnings WHERE device_id = p_device_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_clear_warning(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_warning(text) TO authenticated;

-- 4) الزائر يؤكّد أنه قرأ التحذير (مرتبط بجهازه هو فقط)
CREATE OR REPLACE FUNCTION public.ack_device_warning(p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN;
  END IF;
  UPDATE public.device_warnings
     SET seen_at = now()
   WHERE device_id = p_device_id AND seen_at IS NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.ack_device_warning(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_device_warning(text) TO anon, authenticated;

-- 5) check_visitor_banned + carries the pending warning
CREATE OR REPLACE FUNCTION public.check_visitor_banned(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.blocked_devices;
        w jsonb;
BEGIN
  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NULL THEN
    RETURN jsonb_build_object('banned', false) || COALESCE(w, '{}'::jsonb);
  END IF;
  IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
    DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    RETURN jsonb_build_object('banned', false) || COALESCE(w, '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'banned', true,
    'reason', COALESCE(b.reason, 'محظور'),
    'expires_at', b.expires_at,
    'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END
  ) || COALESCE(w, '{}'::jsonb);
END $$;

-- 6) record_visitor_fingerprint + carries the pending warning
CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(
  p_device_id   text,
  p_ip_hash     text,
  p_ua_hash     text,
  p_canvas_hash text DEFAULT NULL,
  p_webgl_hash  text DEFAULT NULL,
  p_audio_hash  text DEFAULT NULL,
  p_fonts_hash  text DEFAULT NULL,
  p_screen_hash text DEFAULT NULL,
  p_fp_hash     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.blocked_devices;
  match_reason text;
  strong_hits int;
  ip_hit boolean;
  pair_hit boolean;
  w jsonb;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  -- التحذير المعلّق لهذا الجهاز (يظهر مرة واحدة حتى يؤكّدها المستخدم)
  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

  -- 0) هل الجهاز محظور أصلاً؟
  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
      DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    ELSE
      RETURN jsonb_build_object(
        'banned', true,
        'reason', COALESCE(b.reason, 'محظور'),
        'expires_at', b.expires_at,
        'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END
      ) || COALESCE(w, '{}'::jsonb);
    END IF;
  END IF;

  -- 1) سجّل كل البصمات الواردة (بدون بصمة 'unknown' أو القصيرة)
  INSERT INTO public.device_signatures(device_id, sig_type, sig_value)
  SELECT p_device_id, v.t, v.val
    FROM (VALUES
      ('ip'::text,     p_ip_hash),
      ('ua',           p_ua_hash),
      ('canvas',       p_canvas_hash),
      ('webgl',        p_webgl_hash),
      ('audio',        p_audio_hash),
      ('fonts',        p_fonts_hash),
      ('screen',       p_screen_hash),
      ('fp',           p_fp_hash)
    ) AS v(t, val)
   WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  ON CONFLICT (device_id, sig_type, sig_value) DO UPDATE
    SET last_seen = now();

  -- 2) حافظ على الجدول القديم (للتوافق مع المطابقة السابقة وتصفح الأدمن)
  IF p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown' THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;
  END IF;

  -- 3) مطابقة البصمات المحظورة:
  --    a) أي بصمة جهاز قوية واحدة (canvas/webgl/audio/fonts/fp) متطابقة => حظر
  strong_hits := (
    SELECT count(*)::int
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('webgl',        p_webgl_hash),
        ('audio',        p_audio_hash),
        ('fonts',        p_fonts_hash),
        ('fp',           p_fp_hash)
      ) v(t, val)
      JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
     WHERE v.val IS NOT NULL AND length(v.val) >= 8
  );

  --    b) IP نفس IP محظور (السلوك التاريخي)
  ip_hit := (p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown')
        AND (EXISTS (SELECT 1 FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash)
          OR EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'ip' AND sig_value = p_ip_hash));

  --    c) أي مزيج screen+ua متطابق (يقبض على VPN + متصفح مختلف بنفس الشاشة)
  pair_hit := (p_screen_hash IS NOT NULL AND length(p_screen_hash) >= 8
               AND EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'screen' AND sig_value = p_screen_hash))
          AND (p_ua_hash IS NOT NULL AND length(p_ua_hash) >= 8
               AND EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'ua' AND sig_value = p_ua_hash));

  IF strong_hits >= 1 OR ip_hit OR pair_hit THEN
    SELECT bs.reason INTO match_reason
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('webgl',        p_webgl_hash),
        ('audio',        p_audio_hash),
        ('fonts',        p_fonts_hash),
        ('fp',           p_fp_hash)
      ) v(t, val)
      JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
     WHERE v.val IS NOT NULL AND length(v.val) >= 8
     LIMIT 1;

    IF match_reason IS NULL AND ip_hit THEN
      SELECT reason INTO match_reason FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash LIMIT 1;
    END IF;
    IF match_reason IS NULL THEN match_reason := 'fingerprint match'; END IF;

    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (p_device_id, 'fingerprint match: ' || COALESCE(match_reason, 'device ban'))
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('banned', true, 'reason', match_reason) || COALESCE(w, '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object('banned', false) || COALESCE(w, '{}'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;

-- 7) ملف الجهاز في الأدمن يعرض التحذير الحالي
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
    'warning', (SELECT message FROM public.device_warnings WHERE device_id = p_device_id),
    'warning_at', (SELECT created_at FROM public.device_warnings WHERE device_id = p_device_id),
    'warning_seen', (SELECT seen_at FROM public.device_warnings WHERE device_id = p_device_id),
    'presence', (SELECT to_jsonb(dp) FROM public.device_presence dp WHERE dp.device_id = p_device_id),
    'sigs', (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', s.sig_type, 'value', left(s.sig_value, 40), 'last_seen', s.last_seen) ORDER BY s.last_seen DESC), '[]'::jsonb)
              FROM public.device_signatures s WHERE s.device_id = p_device_id),
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

 ------------------------------------------------------------------------------
 --  20260925010000_device_names.sql
 ------------------------------------------------------------------------------
-- =========================================================
-- اسم يختاره المستخدم لنفسه: يميّزه لدى الإدارة بدل كود الجهاز
-- لا يظهر لأحد غير الإدارة، والمستخدم يظل مجهولاً أمام الناس.
-- =========================================================

-- 1) جدول الأسماء (لا يُقرأ من anon إطلاقاً — الوصول عبر RPC)
CREATE TABLE IF NOT EXISTS public.device_names (
  device_id  text PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.device_names TO service_role;
ALTER TABLE public.device_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read device_names" ON public.device_names;
CREATE POLICY "admins read device_names" ON public.device_names
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS device_names_name_idx ON public.device_names (lower(name));

-- 2) المستخدم يختار/يغيّر/يحذف اسمه (مرتبط بجهازه هو، بدون حساب)
CREATE OR REPLACE FUNCTION public.set_device_name(p_device_id text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE clean text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid device');
  END IF;

  clean := btrim(regexp_replace(coalesce(p_name, ''), '[\u0000-\u001F\u007F]+', ' ', 'g'));
  clean := btrim(regexp_replace(clean, '\s{2,}', ' ', 'g'));

  IF clean = '' THEN
    DELETE FROM public.device_names WHERE device_id = p_device_id;
    RETURN jsonb_build_object('ok', true, 'name', NULL);
  END IF;

  IF char_length(clean) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too short');
  END IF;
  IF char_length(clean) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too long');
  END IF;
  IF clean ~ '(https?://|www\.|@)' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no links');
  END IF;

  INSERT INTO public.device_names(device_id, name, created_at, updated_at)
  VALUES (p_device_id, clean, now(), now())
  ON CONFLICT (device_id) DO UPDATE
    SET name = EXCLUDED.name, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'name', clean);
END $$;

REVOKE EXECUTE ON FUNCTION public.set_device_name(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_device_name(text,text) TO anon, authenticated;

-- 3) الأدمن: قائمة الأسماء مع بحث + عدد المنشورات والتعليقات
CREATE OR REPLACE FUNCTION public.admin_list_device_names(p_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.updated_at DESC), '[]'::jsonb) INTO result
  FROM (
    SELECT n.device_id,
           n.name,
           n.updated_at,
           COALESCE(sp.cnt, 0)::int AS post_count,
           COALESCE(sc.cnt, 0)::int AS comment_count,
           EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = n.device_id) AS is_blocked,
           (SELECT w.message FROM public.device_warnings w WHERE w.device_id = n.device_id) AS warning
      FROM public.device_names n
      LEFT JOIN (SELECT device_id, count(*) cnt FROM public.posts GROUP BY device_id) sp ON sp.device_id = n.device_id
      LEFT JOIN (SELECT device_id, count(*) cnt FROM public.comments GROUP BY device_id) sc ON sc.device_id = n.device_id
     WHERE p_search IS NULL
        OR btrim(p_search) = ''
        OR n.name ILIKE '%' || btrim(p_search) || '%'
        OR n.device_id ILIKE '%' || btrim(p_search) || '%'
  ) x;
  RETURN result;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_device_names(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_device_names(text) TO authenticated;

-- 4) الزائر يستلم اسمه مع نتيجة الفحص
CREATE OR REPLACE FUNCTION public.get_device_name(p_device_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name FROM public.device_names WHERE device_id = p_device_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_device_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_device_name(text) TO anon, authenticated;

-- 5) record_visitor_fingerprint + اسم الجهاز
CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(
  p_device_id   text,
  p_ip_hash     text,
  p_ua_hash     text,
  p_canvas_hash text DEFAULT NULL,
  p_webgl_hash  text DEFAULT NULL,
  p_audio_hash  text DEFAULT NULL,
  p_fonts_hash  text DEFAULT NULL,
  p_screen_hash text DEFAULT NULL,
  p_fp_hash     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.blocked_devices;
  match_reason text;
  strong_hits int;
  ip_hit boolean;
  pair_hit boolean;
  w jsonb;
  my_name text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

  my_name := public.get_device_name(p_device_id);

  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
      DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    ELSE
      RETURN jsonb_build_object(
        'banned', true,
        'reason', COALESCE(b.reason, 'محظور'),
        'expires_at', b.expires_at,
        'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END,
        'device_name', my_name
      ) || COALESCE(w, '{}'::jsonb);
    END IF;
  END IF;

  INSERT INTO public.device_signatures(device_id, sig_type, sig_value)
  SELECT p_device_id, v.t, v.val
    FROM (VALUES
      ('ip'::text,     p_ip_hash),
      ('ua',           p_ua_hash),
      ('canvas',       p_canvas_hash),
      ('webgl',        p_webgl_hash),
      ('audio',        p_audio_hash),
      ('fonts',        p_fonts_hash),
      ('screen',       p_screen_hash),
      ('fp',           p_fp_hash)
    ) AS v(t, val)
   WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  ON CONFLICT (device_id, sig_type, sig_value) DO UPDATE
    SET last_seen = now();

  IF p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown' THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;
  END IF;

  strong_hits := (
    SELECT count(*)::int
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('webgl',        p_webgl_hash),
        ('audio',        p_audio_hash),
        ('fonts',        p_fonts_hash),
        ('fp',           p_fp_hash)
      ) v(t, val)
      JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
     WHERE v.val IS NOT NULL AND length(v.val) >= 8
  );

  ip_hit := (p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown')
        AND (EXISTS (SELECT 1 FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash)
          OR EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'ip' AND sig_value = p_ip_hash));

  pair_hit := (p_screen_hash IS NOT NULL AND length(p_screen_hash) >= 8
               AND EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'screen' AND sig_value = p_screen_hash))
          AND (p_ua_hash IS NOT NULL AND length(p_ua_hash) >= 8
               AND EXISTS (SELECT 1 FROM public.banned_signatures WHERE sig_type = 'ua' AND sig_value = p_ua_hash));

  IF strong_hits >= 1 OR ip_hit OR pair_hit THEN
    SELECT bs.reason INTO match_reason
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('webgl',        p_webgl_hash),
        ('audio',        p_audio_hash),
        ('fonts',        p_fonts_hash),
        ('fp',           p_fp_hash)
      ) v(t, val)
      JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
     WHERE v.val IS NOT NULL AND length(v.val) >= 8
     LIMIT 1;

    IF match_reason IS NULL AND ip_hit THEN
      SELECT reason INTO match_reason FROM public.banned_fingerprints WHERE ip_hash = p_ip_hash LIMIT 1;
    END IF;
    IF match_reason IS NULL THEN match_reason := 'fingerprint match'; END IF;

    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (p_device_id, 'fingerprint match: ' || COALESCE(match_reason, 'device ban'))
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('banned', true, 'reason', match_reason, 'device_name', my_name)
      || COALESCE(w, '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object('banned', false, 'device_name', my_name) || COALESCE(w, '{}'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;

-- 6) check_visitor_banned + اسم الجهاز
CREATE OR REPLACE FUNCTION public.check_visitor_banned(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.blocked_devices;
        w jsonb;
        my_name text;
BEGIN
  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL LIMIT 1;

  my_name := public.get_device_name(p_device_id);

  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NULL THEN
    RETURN jsonb_build_object('banned', false, 'device_name', my_name) || COALESCE(w, '{}'::jsonb);
  END IF;
  IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
    DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    RETURN jsonb_build_object('banned', false, 'device_name', my_name) || COALESCE(w, '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'banned', true,
    'reason', COALESCE(b.reason, 'محظور'),
    'expires_at', b.expires_at,
    'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END,
    'device_name', my_name
  ) || COALESCE(w, '{}'::jsonb);
END $$;

-- 7) ملف الجهاز في الأدمن يعرض الاسم المختار
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
    'device_name', public.get_device_name(p_device_id),
    'label', (SELECT label FROM public.device_notes WHERE device_id = p_device_id),
    'is_admin', EXISTS(SELECT 1 FROM public.admin_devices WHERE device_id = p_device_id),
    'is_blocked', EXISTS(SELECT 1 FROM public.blocked_devices WHERE device_id = p_device_id),
    'warning', (SELECT message FROM public.device_warnings WHERE device_id = p_device_id),
    'warning_at', (SELECT created_at FROM public.device_warnings WHERE device_id = p_device_id),
    'warning_seen', (SELECT seen_at FROM public.device_warnings WHERE device_id = p_device_id),
    'presence', (SELECT to_jsonb(dp) FROM public.device_presence dp WHERE dp.device_id = p_device_id),
    'sigs', (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', s.sig_type, 'value', left(s.sig_value, 40), 'last_seen', s.last_seen) ORDER BY s.last_seen DESC), '[]'::jsonb)
              FROM public.device_signatures s WHERE s.device_id = p_device_id),
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

 ------------------------------------------------------------------------------
 --  20260925020000_admin_users.sql
 ------------------------------------------------------------------------------
-- =========================================================
-- فحص صلاحية الأدمن عبر RPC (يتجاوز RLS على user_roles)
-- + قائمة بكل المستخدمين للأدمن
-- =========================================================

-- 1) حالة الأدمن للحساب الحالي: تعتمد has_role مباشرة
CREATE OR REPLACE FUNCTION public.my_admin_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN jsonb_build_object('is_admin', false, 'user_id', NULL, 'email', NULL);
  END IF;
  RETURN jsonb_build_object(
    'is_admin', public.has_role(uid, 'admin'),
    'user_id', uid,
    'email', (SELECT email FROM auth.users WHERE id = uid)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.my_admin_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_admin_status() TO authenticated;

-- 2) كل الأجهزة/المستخدمين مع الاسم والعدد وال.last_seen
CREATE OR REPLACE FUNCTION public.admin_list_devices(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 100,
  p_offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb; total int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH devices AS (
    SELECT device_id FROM public.device_presence
    UNION
    SELECT device_id FROM public.device_names
    UNION
    SELECT device_id FROM public.posts
    UNION
    SELECT device_id FROM public.comments
    UNION
    SELECT device_id FROM public.blocked_devices
  ), rows AS (
    SELECT
      d.device_id,
      COALESCE(n.name, '')                      AS name,
      COALESCE(nt.label, '')                    AS label,
      COALESCE(al.number, 0)                     AS anon_number,
      COALESCE(sp.cnt, 0)::int                  AS post_count,
      COALESCE(sc.cnt, 0)::int                  AS comment_count,
      COALESCE(cp.cnt, 0)::int                  AS chat_count,
      pr.first_seen, pr.last_seen,
      COALESCE(pr.visits, 0)::int               AS visits,
      EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = d.device_id) AS is_blocked,
      EXISTS (SELECT 1 FROM public.admin_devices a WHERE a.device_id = d.device_id)   AS is_admin,
      (SELECT w.message FROM public.device_warnings w WHERE w.device_id = d.device_id) AS warning
    FROM devices d
    LEFT JOIN public.device_names n  ON n.device_id = d.device_id
    LEFT JOIN public.device_notes nt ON nt.device_id = d.device_id
    LEFT JOIN public.device_aliases al ON al.device_id = d.device_id
    LEFT JOIN public.device_presence pr ON pr.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.posts    GROUP BY device_id) sp ON sp.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.comments GROUP BY device_id) sc ON sc.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.chat_posts GROUP BY device_id) cp ON cp.device_id = d.device_id
    WHERE p_search IS NULL
       OR btrim(p_search) = ''
       OR COALESCE(n.name, '') ILIKE '%' || btrim(p_search) || '%'
       OR COALESCE(nt.label, '') ILIKE '%' || btrim(p_search) || '%'
       OR d.device_id ILIKE '%' || btrim(p_search) || '%'
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM rows),
    'rows',  COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY rows.last_seen DESC NULLS LAST)
                        FROM (SELECT * FROM rows ORDER BY rows.last_seen DESC NULLS LAST
                              LIMIT LEAST(GREATEST(p_limit,1),500) OFFSET GREATEST(p_offset,0)) rows), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_devices(text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_devices(text,int,int) TO authenticated;

 ------------------------------------------------------------------------------
 --  20260925030000_user_numbering.sql
 ------------------------------------------------------------------------------
-- =========================================================
-- ترقيم كل المستخدمين من الأقدم للأحدث + الترتيب في قائمة الأدمن
-- =========================================================

-- 1) ترقيم الأجهزة التي لا يوجد لها رقم (لم تنشر بعد) — تكملة للتسلسل,
--    فتبقى الأرقام متسلسلة زمنياً WITHOUT ما تتغير أرقام المنشورات القديمة
DO $$
DECLARE missing int;
BEGIN
  WITH known AS (
    SELECT device_id, MIN(created_at) AS first_at FROM (
      SELECT device_id, first_seen AS created_at FROM public.device_presence
      UNION ALL
      SELECT device_id, created_at             FROM public.device_names
      UNION ALL
      SELECT device_id, created_at             FROM public.admin_devices
      UNION ALL
      SELECT device_id, created_at             FROM public.blocked_devices
      UNION ALL
      SELECT device_id, created_at             FROM public.posts
    ) x GROUP BY device_id
  ), ordered AS (
    SELECT k.device_id
    FROM known k
    LEFT JOIN public.device_aliases a ON a.device_id = k.device_id
    WHERE a.device_id IS NULL
    ORDER BY k.first_at ASC NULLS LAST, k.device_id
  )
  INSERT INTO public.device_aliases (device_id)
  SELECT device_id FROM ordered
  ON CONFLICT (device_id) DO NOTHING;

  GET DIAGNOSTICS missing = ROW_COUNT;
  RAISE NOTICE 'تم ترقيم % جهاز جديد', missing;
END $$;

-- 2) قائمة الأدمن: مع خيار ترتيب (new / old / num)
DROP FUNCTION IF EXISTS public.admin_list_devices(text,int,int);

CREATE OR REPLACE FUNCTION public.admin_list_devices(
  p_search text  DEFAULT NULL,
  p_limit  int   DEFAULT 100,
  p_offset int   DEFAULT 0,
  p_sort   text  DEFAULT 'new'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH devices AS (
    SELECT device_id FROM public.device_presence
    UNION
    SELECT device_id FROM public.device_names
    UNION
    SELECT device_id FROM public.device_aliases
    UNION
    SELECT device_id FROM public.posts
    UNION
    SELECT device_id FROM public.comments
    UNION
    SELECT device_id FROM public.blocked_devices
  ), rows AS (
    SELECT
      d.device_id,
      COALESCE(n.name, '')           AS name,
      COALESCE(nt.label, '')         AS label,
      COALESCE(al.number, 0)         AS anon_number,
      COALESCE(sp.cnt, 0)::int       AS post_count,
      COALESCE(sc.cnt, 0)::int       AS comment_count,
      COALESCE(cp.cnt, 0)::int       AS chat_count,
      pr.first_seen, pr.last_seen, pr.visits,
      EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = d.device_id) AS is_blocked,
      EXISTS (SELECT 1 FROM public.admin_devices a WHERE a.device_id = d.device_id)   AS is_admin,
      (SELECT w.message FROM public.device_warnings w WHERE w.device_id = d.device_id) AS warning
    FROM devices d
    LEFT JOIN public.device_names n   ON n.device_id = d.device_id
    LEFT JOIN public.device_notes nt  ON nt.device_id = d.device_id
    LEFT JOIN public.device_aliases al ON al.device_id = d.device_id
    LEFT JOIN public.device_presence pr ON pr.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.posts    GROUP BY device_id) sp ON sp.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.comments GROUP BY device_id) sc ON sc.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.chat_posts GROUP BY device_id) cp ON cp.device_id = d.device_id
    WHERE p_search IS NULL
       OR btrim(p_search) = ''
       OR COALESCE(n.name, '')  ILIKE '%' || btrim(p_search) || '%'
       OR COALESCE(nt.label, '') ILIKE '%' || btrim(p_search) || '%'
       OR d.device_id ILIKE '%' || btrim(p_search) || '%'
  ), sorted AS (
    SELECT * FROM rows
    ORDER BY
      CASE WHEN p_sort = 'old' THEN COALESCE(first_seen, 'epoch'::timestamptz) END ASC NULLS LAST,
      CASE WHEN p_sort = 'num' THEN anon_number END ASC NULLS LAST,
      last_seen DESC NULLS LAST
    LIMIT LEAST(GREATEST(p_limit,1),500) OFFSET GREATEST(p_offset,0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM rows),
    'rows',  COALESCE((SELECT jsonb_agg(to_jsonb(sorted)) FROM sorted), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_devices(text,int,int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_devices(text,int,int,text) TO authenticated;

 ------------------------------------------------------------------------------
 --  20260925040000_fix_false_bans.sql
 ------------------------------------------------------------------------------
-- =========================================================
-- إصلاح عاجل: حظر خاطئ لناس عشوائية (بصمة/آيبي مشترك)
-- السبب: كان الحظر التلقائي يقع لو تطابقت بصمة واحدة ضعيفة
--        أو تطابق الـ IP — والـ IP مشترك بين كلdevices نفس الشبكة
--        (مدرسة/جامعة/شركة/شبكة الجوال) فتُحظر عشرات الأبرياء.
-- الحل: 1) حذف الحظور التلقائية الخاطئة  2) تطهير البصمات الضعيفة
--       3) إعادة تعريف الفحص:-ip لا يحظر، ولا تكفي بصمة واحدة.
-- =========================================================

-- 1) إزالة الحظور التي فُرضت تلقائياً بالبصمة (تبقي الحظور اليدوية)
DO $$
DECLARE removed int;
BEGIN
  DELETE FROM public.blocked_devices
   WHERE reason LIKE 'fingerprint match:%'
      OR reason LIKE '%fingerprint%';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'تم رفع % حظر تلقائي خاطئ', removed;
END $$;

-- 2) تطهير البصمات الضعيفة/المشتركة (IP + webgl + audio + fonts)
DO $$
DECLARE n1 int; n2 int;
BEGIN
  DELETE FROM public.banned_fingerprints;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  DELETE FROM public.banned_signatures
   WHERE sig_type IN ('ip', 'webgl', 'webgl2', 'audio', 'fonts');
  GET DIAGNOSTICS n2 = ROW_COUNT;
  RAISE NOTICE 'تم حذف % بصمة IP و % بصمة ضعيفة', n1, n2;
END $$;

-- 3) الفحص الجديد: لا حظر تلقائي بالـ IP إطلاقاً،
--    ويحتاج تطابق TWO على الأقل من البصمات القوية (canvas/fp/screen/ua)
DROP FUNCTION IF EXISTS public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(
  p_device_id text, p_ip_hash text, p_ua_hash text, p_canvas_hash text,
  p_webgl_hash text, p_audio_hash text, p_fonts_hash text,
  p_screen_hash text, p_fp_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.blocked_devices;
  match_reason text;
  strong_hits int;
  w jsonb;
  my_name text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

  my_name := public.get_device_name(p_device_id);

  -- الحظر اليدوي فقط
  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
      DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    ELSE
      RETURN jsonb_build_object(
        'banned', true,
        'reason', COALESCE(b.reason, 'محظور'),
        'expires_at', b.expires_at,
        'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END,
        'device_name', my_name
      ) || COALESCE(w, '{}'::jsonb);
    END IF;
  END IF;

  -- تسجيل البصمات (للعرض فقط — لا третьر حظر)
  INSERT INTO public.device_signatures(device_id, sig_type, sig_value)
  SELECT p_device_id, v.t, v.val
    FROM (VALUES
      ('ip'::text,     p_ip_hash),
      ('ua',           p_ua_hash),
      ('canvas',       p_canvas_hash),
      ('webgl',        p_webgl_hash),
      ('audio',        p_audio_hash),
      ('fonts',        p_fonts_hash),
      ('screen',       p_screen_hash),
      ('fp',           p_fp_hash)
    ) AS v(t, val)
   WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  ON CONFLICT (device_id, sig_type, sig_value) DO UPDATE
    SET last_seen = now();

  IF p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown' THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;
  END IF;

  -- البصمات القوية فقط: canvas + fp + (screen مع ua)
  strong_hits := (
    SELECT count(*)::int
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('fp',           p_fp_hash),
        ('ua',           p_ua_hash),
        ('screen',       p_screen_hash)
      ) v(t, val)
     JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
    WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  );

  IF strong_hits >= 2 THEN
    SELECT bs.reason INTO match_reason
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('fp',           p_fp_hash),
        ('ua',           p_ua_hash),
        ('screen',       p_screen_hash)
      ) v(t, val)
     JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
    WHERE v.val IS NOT NULL AND length(v.val) >= 8
    LIMIT 1;

    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (p_device_id, 'fingerprint match: ' || COALESCE(match_reason, 'device ban'))
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('banned', true, 'reason', match_reason, 'device_name', my_name)
      || COALESCE(w, '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object('banned', false, 'device_name', my_name) || COALESCE(w, '{}'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;

 ------------------------------------------------------------------------------
 --  20260925050000_link_identity.sql
 ------------------------------------------------------------------------------
-- =========================================================
-- ربط هوية المستخدم عبر الدومين الجديد
-- المشكلة: localStorage مرتبط بالدومين، فالدومين الجديد = معرّف جهاز جديد،
--          فيفقد المستخدم اسمه ورقمه المجهول وسجلّه.
-- الحل: مطابقة البصمات القوية (canvas/fp/screen) مع الجهاز المسجّل سابقاً،
--      وعند التطابق نرجّع المستخدم لمعرّفه الأصلي.
-- =========================================================

DROP FUNCTION IF EXISTS public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(
  p_device_id text, p_ip_hash text, p_ua_hash text, p_canvas_hash text,
  p_webgl_hash text, p_audio_hash text, p_fonts_hash text,
  p_screen_hash text, p_fp_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.blocked_devices;
  match_reason text;
  strong_hits int;
  w jsonb;
  my_name text;
  linked_id text;
  new_id text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  -- ربط الهوية عبر الدومين/المتصفح: لو الجهاز نفسه جاي بمعرّف جديد
  -- (دومين جديد أو مسح التخزين) بنرجّعه لمعرّفه الأصلي الص��ني
  -- حتى لا يفقد اسمه ولا رقمه المجهول ولا سجلّه.
  -- الشرط: تطابق بصمتين قويتين على الأقل (canvas/fp/screen) مع جهاز آخر.
  SELECT ds.device_id INTO linked_id
    FROM public.device_signatures ds
    JOIN (VALUES
      ('canvas'::text, p_canvas_hash),
      ('fp',           p_fp_hash),
      ('screen',       p_screen_hash)
    ) v(t, val) ON ds.sig_type = v.t AND ds.sig_value = v.val
   WHERE ds.device_id <> p_device_id
     AND v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
   GROUP BY ds.device_id
  HAVING count(DISTINCT v.t) >= 2
   ORDER BY count(DISTINCT v.t) DESC, max(ds.last_seen) DESC
   LIMIT 1;

  IF linked_id IS NOT NULL THEN
    new_id := p_device_id;
    -- انقل بصمات الشبكة/المتصفح الجديدة للمعرّف الأصلي واحذف المعرّف المزدوج
    UPDATE public.device_fingerprints SET device_id = linked_id WHERE device_id = new_id;
    DELETE FROM public.device_signatures WHERE device_id = new_id;
    p_device_id := linked_id;
  END IF;

  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

  my_name := public.get_device_name(p_device_id);

  -- الحظر اليدوي فقط
  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
      DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    ELSE
      RETURN jsonb_build_object(
        'banned', true,
        'reason', COALESCE(b.reason, 'محظور'),
        'expires_at', b.expires_at,
        'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END,
        'device_name', my_name,
        'device_id', p_device_id,
        'linked', linked_id IS NOT NULL
      ) || COALESCE(w, '{}'::jsonb);
    END IF;
  END IF;

  -- تسجيل البصمات (للعرض فقط — لا третьر حظر)
  INSERT INTO public.device_signatures(device_id, sig_type, sig_value)
  SELECT p_device_id, v.t, v.val
    FROM (VALUES
      ('ip'::text,     p_ip_hash),
      ('ua',           p_ua_hash),
      ('canvas',       p_canvas_hash),
      ('webgl',        p_webgl_hash),
      ('audio',        p_audio_hash),
      ('fonts',        p_fonts_hash),
      ('screen',       p_screen_hash),
      ('fp',           p_fp_hash)
    ) AS v(t, val)
   WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  ON CONFLICT (device_id, sig_type, sig_value) DO UPDATE
    SET last_seen = now();

  IF p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown' THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;
  END IF;

  -- البصمات القوية فقط: canvas + fp + (screen مع ua)
  strong_hits := (
    SELECT count(*)::int
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('fp',           p_fp_hash),
        ('ua',           p_ua_hash),
        ('screen',       p_screen_hash)
      ) v(t, val)
     JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
    WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  );

  IF strong_hits >= 2 THEN
    SELECT bs.reason INTO match_reason
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('fp',           p_fp_hash),
        ('ua',           p_ua_hash),
        ('screen',       p_screen_hash)
      ) v(t, val)
     JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
    WHERE v.val IS NOT NULL AND length(v.val) >= 8
    LIMIT 1;

    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (p_device_id, 'fingerprint match: ' || COALESCE(match_reason, 'device ban'))
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('banned', true, 'reason', match_reason, 'device_name', my_name,
                              'device_id', p_device_id, 'linked', linked_id IS NOT NULL)
      || COALESCE(w, '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object('banned', false, 'device_name', my_name,
                            'device_id', p_device_id, 'linked', linked_id IS NOT NULL)
    || COALESCE(w, '{}'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;

 ------------------------------------------------------------------------------
 --  20260929000001_night_bedtime_broadcast.sql
 ------------------------------------------------------------------------------
-- ============================================================================
-- تنبيه وقت النوم لقسم "أنا مجهول" (dqrzsllhdcvykoisisoy)
-- نفس آلية الشات: بث ليلي + نافذة حتى 3 فجراً + Realtime فوري
-- التنفيذ: Supabase Dashboard → SQL Editor → Run (يدوي من المالك)
-- ============================================================================

-- 1) جدول البث (إن لم يكن موجوداً) — متوافق مع جدول الشات
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content jsonb NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  kind text NOT NULL DEFAULT 'morning' CHECK (kind IN ('morning', 'night')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- فهرس خفيف للاستعلام الليلي
CREATE INDEX IF NOT EXISTS broadcasts_kind_created_at_idx
  ON public.broadcasts (kind, created_at DESC);

-- 2) بث وقت النوم
INSERT INTO public.broadcasts (kind, title, visible, content)
SELECT 'night', '🌙 وقت النوم', true,
'[
  {"t": "salam", "text": "يا أهل مدارك 🤍"},
  {"t": "p", "text": "قرب وقت النوم، وقبل ما تسكروا يومكم وتتركوا كل شيء لبكرا، خذوا منكم دقيقتين بس لأنفسكم."},
  {"t": "tipsHeader", "text": "🌙 قبل النوم:"},
  {"t": "li", "text": "توضأ إذا قدرت."},
  {"t": "li", "text": "صلِّ الوتر، وإذا عليك صلاة فحاول تقضيها."},
  {"t": "li", "text": "اقرأ آية الكرسي."},
  {"t": "li", "text": "اقرأ آخر آيتين من سورة البقرة."},
  {"t": "li", "text": "اقرأ الإخلاص والفلق والناس ثلاث مرات، وامسح بها جسدك."},
  {"t": "li", "text": "أكثر من الاستغفار والصلاة على النبي ﷺ."},
  {"t": "li", "text": "احمد الله على الأشياء الحلوة اللي صارت معك اليوم، حتى لو كان يومك صعب."},
  {"t": "li", "text": "اترك الهاتف قبل النوم بوقت، وخلي آخر شيء يدخل عقلك شيء هادئ ومطمئن."},
  {"t": "tipsHeader", "text": "🤲 ومن أجمل ما تقوله قبل النوم:"},
  {"t": "li", "text": "«باسمك اللهم أموت وأحيا.»"},
  {"t": "li", "text": "«اللهم قني عذابك يوم تبعث عبادك.»"},
  {"t": "li", "text": "«اللهم إني أسألك نومًا هادئًا، وقلبًا مطمئنًا، وصباحًا أجمل، وبارك لي في يومي القادم.»"},
  {"t": "p", "text": "وتذكروا… مش لازم كل يوم يكون يومًا مثاليًا."},
  {"t": "p", "text": "يمكن اليوم درست كثير، ويمكن قصّرت."},
  {"t": "p", "text": "يمكن أنجزت أشياء كنت فخورًا فيها، ويمكن ضاع منك وقت."},
  {"t": "p", "text": "المهم إنك ما زلت تحاول، وبكرا عندك فرصة جديدة تبدأ فيها من جديد."},
  {"t": "p", "text": "وأحب أذكركم بشيء يمكن ما بنحكيه كثير:"},
  {"t": "p", "text": "إحنا بنحاول نبني مكان تحسوا فيه إنكم مش لحالكم في طريقكم."},
  {"t": "p", "text": "المكان اللي تدخل عليه آخر الليل وتلاقي ناس مثلك بتحاول."},
  {"t": "p", "text": "المكان اللي تفتح فيه عيونك الصبح وتلاقي تحديًا جديدًا."},
  {"t": "p", "text": "المكان اللي ترجع له بعد يوم طويل، حتى لو ما أنجزت اللي كنت مخطط له."},
  {"t": "p", "text": "ويمكن بعد فترة، لما تخلصوا كل هذا الطريق، تتذكروا الأيام اللي كنتم تدخلوا فيها مدارك آخر الليل، وتقولوا:"},
  {"t": "closing", "text": "«كنا هون من البداية.» 🤍"},
  {"t": "p", "text": "ناموا وأنتم مرتاحين، سامحوا أنفسكم على تقصير اليوم، واتركوا بكرا لوقته."},
  {"t": "p", "text": "الله يريح قلوبكم، ويبارك في أعماركم وأوقاتكم، ويكتب لكم التوفيق في دراستكم وحياتكم، ويحقق لكم الأشياء اللي تتمنونها وأكثر."},
  {"t": "closing", "text": "تصبحون على خير يا أهل مدارك.\nنشوفكم بكرا. 🌙🤍"}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.broadcasts WHERE kind = 'night');

-- 3) نافذة العرض: من الآن حتى 3 فجر (بتوقيت عمّان)
UPDATE public.broadcasts
SET starts_at = now() - interval '1 minute',
    expires_at = (date_trunc('day', timezone('Asia/Amman', now()))
                  + interval '1 day' + interval '3 hours') AT TIME ZONE 'Asia/Amman'
WHERE kind = 'night';

-- 4) Realtime فوري — بدون استطلاع دوري
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;

-- 5) فحص
SELECT id, kind, title, starts_at, expires_at
FROM public.broadcasts
WHERE kind = 'night'
ORDER BY created_at DESC;

 ------------------------------------------------------------------------------
 --  20260929000002_fix_link_pk_privacy_ban.sql
 ------------------------------------------------------------------------------
-- =========================================================
-- إصلاحات ما بعد ربط الهوية:
--  1) تعارض PK في device_fingerprints أثناء نقل المعرّف الجديد
--     (device_id, ip_hash) — كان UPDATE يرمي 23505 فيقفل الربط.
--  2) الخصوصية: get_device_name وقراءة blocked_devices كانت متاحة
--     لكل زائر، أي تسريب أسماء المستخدمين وقائمة المحظورين.
--  3) قاعدة الحظر: كانت ua تكفي مع screen → حظر خاطئ لناس عاديين.
-- =========================================================

-- -------------------------------------------------------------
-- 1) دالة آمنة لوجود ميزة الأسماء (بدل كشف الاسم للزائر)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.device_name_feature()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_regclass('public.device_names') IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.device_name_feature() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.device_name_feature() TO anon, authenticated;

-- -------------------------------------------------------------
-- 2) منع تسريب الأسماء: لم تعد متاحة للزوار
--    (تبقى تعمل داخلياً لأن الدوال المستدعية SECURITY DEFINER)
-- -------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_device_name(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_device_name(text) TO service_role;

-- -------------------------------------------------------------
-- 3) منع تسريب قائمة المحظورين (الزائر لا يحتاج إلا check_visitor_banned)
-- -------------------------------------------------------------
REVOKE SELECT ON public.blocked_devices FROM anon;
DROP POLICY IF EXISTS "anyone can check blocks" ON public.blocked_devices;

-- -------------------------------------------------------------
-- 4) إعادة تعريف record_visitor_fingerprint بالاتجاهات الثلاثة
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(
  p_device_id text, p_ip_hash text, p_ua_hash text, p_canvas_hash text,
  p_webgl_hash text, p_audio_hash text, p_fonts_hash text,
  p_screen_hash text, p_fp_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.blocked_devices;
  match_reason text;
  strong_hits int;
  has_hard_sig boolean;
  w jsonb;
  my_name text;
  linked_id text;
  new_id text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  -- ربط الهوية عبر الدومين/المتصفح: نفس الجهاز بمعرّف جديد
  -- نرجّعه لمعرّفه الأصلي حتى لا يفقد اسمه ولا رقمه ولا سجلّه.
  -- الشرط: تطابق بصمتين قويتين على الأقل (canvas/fp/screen).
  SELECT ds.device_id INTO linked_id
    FROM public.device_signatures ds
    JOIN (VALUES
      ('canvas'::text, p_canvas_hash),
      ('fp',           p_fp_hash),
      ('screen',       p_screen_hash)
    ) v(t, val) ON ds.sig_type = v.t AND ds.sig_value = v.val
   WHERE ds.device_id <> p_device_id
     AND v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
   GROUP BY ds.device_id
  HAVING count(DISTINCT v.t) >= 2
   ORDER BY count(DISTINCT v.t) DESC, max(ds.last_seen) DESC
   LIMIT 1;

  IF linked_id IS NOT NULL THEN
    new_id := p_device_id;

    -- نقل بصمات الشبكة بلا تعارض: ندمج الصفوف ثم نحذف المعرّف المزدوج.
    -- (UPDATE مباشر كان يرمي unique violation على (device_id, ip_hash))
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash, first_seen, last_seen, hits)
    SELECT linked_id, df.ip_hash, df.ua_hash, df.first_seen, df.last_seen, df.hits
      FROM public.device_fingerprints df
     WHERE df.device_id = new_id
    ON CONFLICT (device_id, ip_hash) DO UPDATE
       SET last_seen = GREATEST(public.device_fingerprints.last_seen, EXCLUDED.last_seen),
           hits     = public.device_fingerprints.hits + EXCLUDED.hits,
           ua_hash  = EXCLUDED.ua_hash;
    DELETE FROM public.device_fingerprints WHERE device_id = new_id;

    -- الاسم: لو المعرّف الأصلي بلا اسم وكان الجديد له اسم، ننقله
    IF NOT EXISTS (SELECT 1 FROM public.device_names WHERE device_id = linked_id) THEN
      INSERT INTO public.device_names(device_id, name)
      SELECT linked_id, dn.name FROM public.device_names dn WHERE dn.device_id = new_id
      ON CONFLICT (device_id) DO NOTHING;
    END IF;

    -- تحذيرات غير مقروءة تنتقل معه
    UPDATE public.device_warnings dw
       SET device_id = linked_id
     WHERE dw.device_id = new_id
       AND dw.seen_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.device_warnings x
          WHERE x.device_id = linked_id AND x.message = dw.message AND x.seen_at IS NULL
       );

    DELETE FROM public.device_warnings   WHERE device_id = new_id;
    DELETE FROM public.device_signatures WHERE device_id = new_id;
    p_device_id := linked_id;
  END IF;

  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO w
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

  my_name := public.get_device_name(p_device_id);

  -- الحظر اليدوي فقط
  SELECT * INTO b FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    IF b.expires_at IS NOT NULL AND b.expires_at <= now() THEN
      DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
    ELSE
      RETURN jsonb_build_object(
        'banned', true,
        'reason', COALESCE(b.reason, 'محظور'),
        'expires_at', b.expires_at,
        'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END,
        'device_name', my_name,
        'device_id', p_device_id,
        'linked', linked_id IS NOT NULL
      ) || COALESCE(w, '{}'::jsonb);
    END IF;
  END IF;

  -- تسجيل البصمات (للعرض والربط فقط — لا يُمنع على أساسها)
  INSERT INTO public.device_signatures(device_id, sig_type, sig_value)
  SELECT p_device_id, v.t, v.val
    FROM (VALUES
      ('ip'::text,     p_ip_hash),
      ('ua',           p_ua_hash),
      ('canvas',       p_canvas_hash),
      ('webgl',        p_webgl_hash),
      ('audio',        p_audio_hash),
      ('fonts',        p_fonts_hash),
      ('screen',       p_screen_hash),
      ('fp',           p_fp_hash)
    ) AS v(t, val)
   WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  ON CONFLICT (device_id, sig_type, sig_value) DO UPDATE
    SET last_seen = now();

  IF p_ip_hash IS NOT NULL AND length(p_ip_hash) >= 8 AND p_ip_hash <> 'unknown' THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;
  END IF;

  -- الحظر التلقائي: إشارتان مطابقتان على الأقل، مع اشتراط
  -- بصمة صعبة (canvas أو fp). الجمع بين ua و screen وحده لا يكفي.
  strong_hits := (
    SELECT count(*)::int
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('fp',           p_fp_hash),
        ('ua',           p_ua_hash),
        ('screen',       p_screen_hash)
      ) v(t, val)
     JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
    WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  );

  has_hard_sig := EXISTS (
    SELECT 1
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('fp',           p_fp_hash)
      ) v(t, val)
     JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
    WHERE v.val IS NOT NULL AND length(v.val) >= 8 AND v.val <> 'unknown'
  );

  IF strong_hits >= 2 AND has_hard_sig THEN
    SELECT bs.reason INTO match_reason
      FROM (VALUES
        ('canvas'::text, p_canvas_hash),
        ('fp',           p_fp_hash),
        ('ua',           p_ua_hash),
        ('screen',       p_screen_hash)
      ) v(t, val)
     JOIN public.banned_signatures bs ON bs.sig_type = v.t AND bs.sig_value = v.val
    WHERE v.val IS NOT NULL AND length(v.val) >= 8
    LIMIT 1;

    INSERT INTO public.blocked_devices(device_id, reason)
    VALUES (p_device_id, 'fingerprint match: ' || COALESCE(match_reason, 'device ban'))
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('banned', true, 'reason', match_reason, 'device_name', my_name,
                              'device_id', p_device_id, 'linked', linked_id IS NOT NULL)
      || COALESCE(w, '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object('banned', false, 'device_name', my_name,
                            'device_id', p_device_id, 'linked', linked_id IS NOT NULL)
    || COALESCE(w, '{}'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;

 ------------------------------------------------------------------------------
 --  20260929000003_restore_orphaned_names.sql
 ------------------------------------------------------------------------------
-- =========================================================
-- استرجاع الأسماء التي فقدها المستخدمون بعد تغيّر الدومين
-- (ربط الهوية نقل device_id، والاسم بقي مربوطاً بالمعرّف القديم)
--
-- ⚠ نفّذ الجملتين بالترتيب:
--   1) الجملة الأولى: معاينة فقط (لا تغيّر شيئاً) — راجع النتيجة قبل التالي
--   2) الجملة الثانية: الترميم الفعلي
-- =========================================================


-- -------------------------------------------------------------
-- 1) معاينة: من سيسترجع اسمه ومن أي اسم
-- -------------------------------------------------------------
WITH pairs AS (
  SELECT cur.device_id                        AS cur_id,
         dn.device_id                        AS src_id,
         dn.name                             AS src_name,
         count(DISTINCT cs.sig_type)         AS shared
    FROM public.device_signatures cur
    JOIN public.device_signatures cs
      ON cs.sig_value = cur.sig_value
     AND cs.sig_type  = cur.sig_type
     AND cs.sig_type IN ('canvas', 'fp', 'screen')
     AND cs.device_id <> cur.device_id
    JOIN public.device_names dn
      ON dn.device_id = cs.device_id
   WHERE NOT EXISTS (SELECT 1 FROM public.device_names x WHERE x.device_id = cur.device_id)
   GROUP BY cur.device_id, dn.device_id, dn.name
),
best AS (
  SELECT DISTINCT ON (cur_id) cur_id, src_id, src_name, shared
    FROM pairs
   WHERE shared >= 2
   ORDER BY cur_id, shared DESC, src_id
)
SELECT cur_id AS "المعرّف_الحالي", src_id AS "المعرّف_القديم", src_name AS "الاسم_المستعاد", shared AS "عدد_البصمات"
  FROM best
 ORDER BY shared DESC, cur_id;


-- -------------------------------------------------------------
-- 2) الترميم الفعلي (يتجاهل أي جهاز صار له اسم بالفعل)
-- -------------------------------------------------------------
WITH pairs AS (
  SELECT cur.device_id                AS cur_id,
         dn.device_id                AS src_id,
         dn.name                     AS src_name,
         count(DISTINCT cs.sig_type) AS shared
    FROM public.device_signatures cur
    JOIN public.device_signatures cs
      ON cs.sig_value = cur.sig_value
     AND cs.sig_type  = cur.sig_type
     AND cs.sig_type IN ('canvas', 'fp', 'screen')
     AND cs.device_id <> cur.device_id
    JOIN public.device_names dn
      ON dn.device_id = cs.device_id
   WHERE NOT EXISTS (SELECT 1 FROM public.device_names x WHERE x.device_id = cur.device_id)
   GROUP BY cur.device_id, dn.device_id, dn.name
),
best AS (
  SELECT DISTINCT ON (cur_id) cur_id, src_name
    FROM pairs
   WHERE shared >= 2
   ORDER BY cur_id, shared DESC, src_id
)
INSERT INTO public.device_names(device_id, name)
SELECT cur_id, src_name FROM best
ON CONFLICT (device_id) DO NOTHING;

 ------------------------------------------------------------------------------
 --  20260929000004_restore_writes.sql
 ------------------------------------------------------------------------------
-- =========================================================
-- إصلاح عاجل: كتابة الزوار توقفت
-- السبب: migration 29000002 سحب SELECT على blocked_devices من anon،
--        لكن سياسات RLS نفسها تستعلم من blocked_devices داخل WITH CHECK،
--        والسياسة بتنفيذ بإذونات anon → permission denied → كل INSERT بيفشل.
-- الحل: دالة SECURITY DEFINER تفحص الحظر بصلاحيات المالك،
--        ونخلي السياسات تناديها بدل الاستعلام المباشر.
-- =========================================================

-- 1) دالة فحص الحظر (تعمل بصلاحيات المالك، الزائر ما بيقدر يقرأ الجدول)
CREATE OR REPLACE FUNCTION public.device_is_blocked(p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_devices
     WHERE device_id = p_device_id
       AND (expires_at IS NULL OR expires_at > now())
  )
$$;

REVOKE EXECUTE ON FUNCTION public.device_is_blocked(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.device_is_blocked(text) TO anon, authenticated;

-- 2) إعادة تعريف السياسات باستخدام الدالة
DROP POLICY IF EXISTS "non-blocked can insert" ON public.posts;
DROP POLICY IF EXISTS "non-blocked can post" ON public.posts;
CREATE POLICY "non-blocked can insert"
  ON public.posts FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(content) > 0 AND length(content) <= 5000
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT public.device_is_blocked(posts.device_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "non-blocked can comment" ON public.comments;
CREATE POLICY "non-blocked can comment" ON public.comments FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(content) > 0 AND length(content) <= 2000
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT public.device_is_blocked(comments.device_id)
    AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id AND p.allow_comments = true)
  );

DROP POLICY IF EXISTS "non-blocked can like" ON public.post_likes;
CREATE POLICY "non-blocked can like" ON public.post_likes
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(device_id) >= 8 AND length(device_id) <= 128
    AND NOT public.device_is_blocked(post_likes.device_id)
  );

DROP POLICY IF EXISTS "non-blocked can post chat" ON public.chat_posts;
CREATE POLICY "non-blocked can post chat" ON public.chat_posts FOR INSERT WITH CHECK (
  length(content) > 0 AND length(content) <= 5000
  AND length(display_name) BETWEEN 1 AND 40
  AND length(device_id) BETWEEN 8 AND 128
  AND NOT public.device_is_blocked(chat_posts.device_id)
);

DROP POLICY IF EXISTS "non-blocked non-muted can comment" ON public.chat_comments;
CREATE POLICY "non-blocked non-muted can comment" ON public.chat_comments FOR INSERT WITH CHECK (
  length(content) > 0 AND length(content) <= 2000
  AND length(display_name) BETWEEN 1 AND 40
  AND length(device_id) BETWEEN 8 AND 128
  AND NOT public.device_is_blocked(chat_comments.device_id)
  AND NOT EXISTS (SELECT 1 FROM public.chat_post_mutes m WHERE m.post_id = chat_comments.post_id AND m.device_id = chat_comments.device_id)
);

DROP POLICY IF EXISTS "non-blocked can like chat" ON public.chat_likes;
CREATE POLICY "non-blocked can like chat" ON public.chat_likes FOR INSERT WITH CHECK (
  length(device_id) BETWEEN 8 AND 128
  AND NOT public.device_is_blocked(chat_likes.device_id)
);

 ------------------------------------------------------------------------------
 --  20260930000000_anonymous_ban_scoring.sql
 ------------------------------------------------------------------------------
-- ============================================================================
--  Anonymous Ban Scoring System  —  نظام الحظر بالإشارات المتعددة
-- ============================================================================
--  المشكلة التي يحلّها هذا الملف:
--    كان الحظر التلقائي مبنياً على جدول مسطّح (banned_signatures) يجمع
--    البصمات من *كل* الأجهزة المحظورة، والقرار كان:
--        strong_hits >= 2  AND (canvas OR fp مطابق)
--    => false positives كثيرة:
--       • canvas + ua لنفس المتصفح/الجهاز المتشابه
--       • screen + ua على شبكة مدرسة (نفس الشاشة ونفس المتصفح) => حظر جماعي
--       • ونقاط الإشارات كانت تُجمع من أجهزة محظورة مختلفة كأنها جهاز واحد.
--
--  الحل: Anonymous Ban Scoring System
--    1) كل جهاز محظور له "fingerprint profile" واحد (ban_fingerprint_profiles).
--    2) النقاط تُحسب لكل profile على حدة، ثم يُؤخذ *أعلى* تطابق منطقي فقط.
--       لا تُجمع نقاط من أجهزة مختلفة.
--    3) أوزان الإشارات (weights):
--         device_id = 100 | fp = 55 | canvas = 15 | webgl = 15
--         audio = 10 | fonts = 5 | ip = 5 | screen = 3 | ua = 2
--    4) مستويات القرار:
--         score >= 100                          => BLOCK
--         90..99  مع 3+ إشارات قوية             => BLOCK
--         70..89  مع 2+ إشارات قوية             => CHALLENGE (تسجيل، لا حظر)
--         < 70                                  => ALLOW
--       => لا يمكن لأي إشارة مفردة أن تبلغ الحظر.
--    5) لا يوجد "اكتشاف Incognito": الاعتماد على عدة إشارات معاً.
--    6) الخادم (هذه الدوال SECURITY DEFINER) هو من يحسب النقاط ويقرر.
--       العميل يرسل إشارات (hashes) فقط ولا يستطيع تعديل score/ban_status.
--
--  ملاحظة مهمة: banned_signatures / banned_fingerprints لم تُحذف (قد يحتاجها
--  الأدمن للتشخيص، وتُهاجَر بياناتها إلى الـ profiles في القسم 6) لكنها لم
--  تعد تُستخدم في اتخاذ قرار الحظر إطلاقاً.
-- ============================================================================


-- ============================================================================
-- 1) إعدادات النظام (weights / strong signals / thresholds / escalation)
--    قابلة للضبط من الأدمن بدون migration جديد.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ban_scoring_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT ALL ON public.ban_scoring_config TO service_role;
ALTER TABLE public.ban_scoring_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ban scoring config" ON public.ban_scoring_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ban_scoring_config(key, value) VALUES
  ('weights', '{"device_id":100,"fp":55,"canvas":15,"webgl":15,"audio":10,"fonts":5,"screen":3,"ua":2,"ip":5}'::jsonb),
  ('strong_signals', '["fp","canvas","webgl","audio"]'::jsonb),
  ('thresholds', '{"block":100,"block_soft":90,"block_soft_min_strong":3,"challenge":70,"challenge_min_strong":2}'::jsonb),
  ('escalate_after', '3'::jsonb),
  ('link_identity_min_strong', '2'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- قارئ الأرقام مع قيمة افتراضية آمنة
CREATE OR REPLACE FUNCTION public.cfg_num(src jsonb, k text, def numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(src ->> k, '')::numeric, def)
$$;
REVOKE EXECUTE ON FUNCTION public.cfg_num(jsonb,text,numeric) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ban_scoring_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'weights', COALESCE(
      (SELECT value FROM public.ban_scoring_config WHERE key = 'weights'),
      '{"device_id":100,"fp":55,"canvas":15,"webgl":15,"audio":10,"fonts":5,"screen":3,"ua":2,"ip":5}'::jsonb),
    'strong_signals', COALESCE(
      (SELECT value FROM public.ban_scoring_config WHERE key = 'strong_signals'),
      '["fp","canvas","webgl","audio"]'::jsonb),
    'thresholds', COALESCE(
      (SELECT value FROM public.ban_scoring_config WHERE key = 'thresholds'),
      '{"block":100,"block_soft":90,"block_soft_min_strong":3,"challenge":70,"challenge_min_strong":2}'::jsonb),
    'escalate_after', COALESCE(
      (SELECT value FROM public.ban_scoring_config WHERE key = 'escalate_after'),
      '3'::jsonb),
    'link_identity_min_strong', COALESCE(
      (SELECT value FROM public.ban_scoring_config WHERE key = 'link_identity_min_strong'),
      '2'::jsonb)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.ban_scoring_settings() FROM PUBLIC;


-- ============================================================================
-- 2) توسيع blocked_devices (الجدول القائم يُطوَّر — لا جدول بديل)
--    ban_id / user_id / ban_status / decision / confidence_score / matched_signals
--    ban_expires_at + ban_created_at كأعمدة مولّدة من expires_at / created_at
--    حتى يبقى هناك مصدر واحد للحقيقة.
-- ============================================================================
ALTER TABLE public.blocked_devices
  ADD COLUMN IF NOT EXISTS ban_id          uuid,
  ADD COLUMN IF NOT EXISTS user_id         uuid,
  ADD COLUMN IF NOT EXISTS ban_status      text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS decision        text,
  ADD COLUMN IF NOT EXISTS confidence_score integer,
  ADD COLUMN IF NOT EXISTS matched_signals text[],
  ADD COLUMN IF NOT EXISTS matched_profile_device_id text,
  ADD COLUMN IF NOT EXISTS match_reason    text,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen       timestamptz,
  ADD COLUMN IF NOT EXISTS unbanned_at     timestamptz,
  ADD COLUMN IF NOT EXISTS unbanned_by     uuid;

-- الصفوف القديمة تبقى ACTIVE (لا حذف لأي بيانات حظر قائمة)
UPDATE public.blocked_devices
   SET ban_id = gen_random_uuid()
 WHERE ban_id IS NULL;

ALTER TABLE public.blocked_devices
  ALTER COLUMN ban_id SET DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blocked_devices_ban_id_uniq') THEN
    ALTER TABLE public.blocked_devices
      ADD CONSTRAINT blocked_devices_ban_id_uniq UNIQUE (ban_id);
  END IF;
END $$;

-- أعمدة مولّدة (مصدر واحد للحقيقة مع expires_at / created_at)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='blocked_devices' AND column_name='ban_expires_at') THEN
    ALTER TABLE public.blocked_devices
      ADD COLUMN ban_expires_at timestamptz GENERATED ALWAYS AS (expires_at) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='blocked_devices' AND column_name='ban_created_at') THEN
    ALTER TABLE public.blocked_devices
      ADD COLUMN ban_created_at timestamptz GENERATED ALWAYS AS (created_at) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blocked_devices_ban_status_chk') THEN
    ALTER TABLE public.blocked_devices
      ADD CONSTRAINT blocked_devices_ban_status_chk
      CHECK (ban_status IN ('ACTIVE','UNBANNED','REVOKED','EXPIRED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blocked_devices_decision_chk') THEN
    ALTER TABLE public.blocked_devices
      ADD CONSTRAINT blocked_devices_decision_chk
      CHECK (decision IS NULL OR decision IN
        ('MANUAL','AUTO_BLOCK','CHALLENGE_ESCALATED','LEGACY_AUTO'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS blocked_devices_status_idx
  ON public.blocked_devices(ban_status, created_at DESC);
CREATE INDEX IF NOT EXISTS blocked_devices_profile_idx
  ON public.blocked_devices(matched_profile_device_id) WHERE ban_status = 'ACTIVE';


-- ============================================================================
-- 3) fingerprint profile لكل حظر (الوحدة التي تُقارَن عليها النقاط)
--    profile واحد لكل ban — قيم hash فقط، لا بيانات خام.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ban_fingerprint_profiles (
  profile_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ban_id       uuid NOT NULL UNIQUE
                 REFERENCES public.blocked_devices(ban_id) ON DELETE CASCADE,
  device_id    text NOT NULL,
  fp           text,
  canvas       text,
  webgl        text,
  audio        text,
  fonts        text,
  screen       text,
  ua           text,
  ip           text,
  signal_count int NOT NULL DEFAULT 0,
  strong_count int NOT NULL DEFAULT 0,
  source       text NOT NULL DEFAULT 'device_signatures',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ban_fingerprint_profiles TO service_role;
ALTER TABLE public.ban_fingerprint_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ban profiles" ON public.ban_fingerprint_profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- فهارس جزئية على الإشارات القوية فقط: الاستعلام الساخن لا يلمس إلا الـ profiles النشطة
CREATE INDEX IF NOT EXISTS ban_profiles_fp_idx     ON public.ban_fingerprint_profiles(fp)     WHERE active;
CREATE INDEX IF NOT EXISTS ban_profiles_canvas_idx ON public.ban_fingerprint_profiles(canvas) WHERE active;
CREATE INDEX IF NOT EXISTS ban_profiles_webgl_idx  ON public.ban_fingerprint_profiles(webgl)  WHERE active;
CREATE INDEX IF NOT EXISTS ban_profiles_audio_idx  ON public.ban_fingerprint_profiles(audio)  WHERE active;
CREATE INDEX IF NOT EXISTS ban_profiles_device_idx ON public.ban_fingerprint_profiles(device_id);


-- ============================================================================
-- 4) سجل التدقيق + جدول التحديات (CHALLENGE)
--    لا تُسجَّل بيانات خام: فقط مؤشرات/هاشات ومعرّفات.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ban_audit_log (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id                 text NOT NULL,
  ban_id                    uuid,
  ban_status                text,
  decision                  text NOT NULL,
  score                     int  NOT NULL DEFAULT 0,
  strong_count              int  NOT NULL DEFAULT 0,
  matched_signals           text[] NOT NULL DEFAULT '{}',
  matched_profile_device_id text,
  matched_profile_id        uuid,
  reason                    text,
  actor                     text NOT NULL DEFAULT 'system',
  created_at                timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ban_audit_log TO service_role;
ALTER TABLE public.ban_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ban audit" ON public.ban_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS ban_audit_device_idx ON public.ban_audit_log(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ban_audit_time_idx   ON public.ban_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS ban_audit_ban_idx    ON public.ban_audit_log(ban_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ban_challenges (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id                 text NOT NULL,
  score                     int  NOT NULL DEFAULT 0,
  strong_count              int  NOT NULL DEFAULT 0,
  matched_signals           text[] NOT NULL DEFAULT '{}',
  matched_profile_device_id text,
  matched_profile_id        uuid,
  reason                    text,
  status                    text NOT NULL DEFAULT 'OPEN',
  created_at                timestamptz NOT NULL DEFAULT now(),
  resolved_at               timestamptz,
  resolved_by               uuid
);
GRANT ALL ON public.ban_challenges TO service_role;
ALTER TABLE public.ban_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ban challenges" ON public.ban_challenges
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS ban_challenges_device_idx ON public.ban_challenges(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ban_challenges_open_idx   ON public.ban_challenges(device_id) WHERE status = 'OPEN';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ban_challenges_status_chk') THEN
    ALTER TABLE public.ban_challenges
      ADD CONSTRAINT ban_challenges_status_chk
      CHECK (status IN ('OPEN','CLEARED','ESCALATED'));
  END IF;
END $$;


-- ============================================================================
-- 5) بناء/تحديث الـ profile تلقائياً عند الحظر
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ban_sync_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st  jsonb := public.ban_scoring_settings();
  sig text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT s.sig_type), '{}')
    INTO sig
    FROM public.device_signatures s
   WHERE s.device_id = NEW.device_id;

  INSERT INTO public.ban_fingerprint_profiles AS p
    (ban_id, device_id, fp, canvas, webgl, audio, fonts, screen, ua, ip,
     signal_count, strong_count, source, active, created_at, updated_at)
  SELECT NEW.ban_id,
         NEW.device_id,
         max(s.sig_value) FILTER (WHERE s.sig_type = 'fp'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'canvas'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'webgl'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'audio'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'fonts'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'screen'),
         max(s.sig_value) FILTER (WHERE s.sig_type = 'ua'),
         (SELECT df.ip_hash FROM public.device_fingerprints df
           WHERE df.device_id = NEW.device_id ORDER BY df.last_seen DESC LIMIT 1),
         count(*),
         (SELECT count(*) FROM unnest(sig) t
           WHERE t IN (SELECT jsonb_array_elements_text(st))),
         'device_signatures',
         (NEW.ban_status = 'ACTIVE'),
         now(), now()
    FROM public.device_signatures s
   WHERE s.device_id = NEW.device_id
     AND s.sig_value IS DISTINCT FROM 'unknown'
  ON CONFLICT (ban_id) DO UPDATE SET
    fp       = COALESCE(EXCLUDED.fp,       p.fp),
    canvas   = COALESCE(EXCLUDED.canvas,   p.canvas),
    webgl    = COALESCE(EXCLUDED.webgl,    p.webgl),
    audio    = COALESCE(EXCLUDED.audio,    p.audio),
    fonts    = COALESCE(EXCLUDED.fonts,    p.fonts),
    screen   = COALESCE(EXCLUDED.screen,   p.screen),
    ua       = COALESCE(EXCLUDED.ua,       p.ua),
    ip       = COALESCE(EXCLUDED.ip,       p.ip),
    signal_count = GREATEST(p.signal_count, EXCLUDED.signal_count),
    strong_count = GREATEST(p.strong_count, EXCLUDED.strong_count),
    active   = EXCLUDED.active,
    updated_at = now();

  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.ban_sync_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS blocked_devices_sync_profile ON public.blocked_devices;
CREATE TRIGGER blocked_devices_sync_profile
  AFTER INSERT OR UPDATE OF ban_status ON public.blocked_devices
  FOR EACH ROW EXECUTE FUNCTION public.ban_sync_profile();


-- ============================================================================
-- 6) هجرة البيانات القديمة: بناء profile لكل حظر قائم
--    لا حذف — فقط إضافة الـ profiles حتى يستمر النظام الجديد بالمقارنة معها.
--    6.a) من device_signatures (المصدر الأدق)
-- ============================================================================
INSERT INTO public.ban_fingerprint_profiles AS p
  (ban_id, device_id, fp, canvas, webgl, audio, fonts, screen, ua, ip,
   signal_count, source, active)
SELECT bd.ban_id,
       bd.device_id,
       max(s.sig_value) FILTER (WHERE s.sig_type = 'fp'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'canvas'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'webgl'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'audio'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'fonts'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'screen'),
       max(s.sig_value) FILTER (WHERE s.sig_type = 'ua'),
       (SELECT df.ip_hash FROM public.device_fingerprints df
         WHERE df.device_id = bd.device_id ORDER BY df.last_seen DESC LIMIT 1),
       count(*),
       'device_signatures',
       (bd.ban_status = 'ACTIVE')
  FROM public.blocked_devices bd
  JOIN public.device_signatures s ON s.device_id = bd.device_id
 WHERE s.sig_value IS DISTINCT FROM 'unknown'
 GROUP BY bd.ban_id, bd.device_id
ON CONFLICT (ban_id) DO NOTHING;

-- 6.b) من banned_signatures (يغطّي الحالات القديمة التي فُقدت منها device_signatures)
INSERT INTO public.ban_fingerprint_profiles AS p
  (ban_id, device_id, fp, canvas, webgl, audio, fonts, screen, ua, ip,
   signal_count, source, active)
SELECT bd.ban_id,
       bs.origin_device_id,
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'fp'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'canvas'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'webgl'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'audio'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'fonts'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'screen'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'ua'),
       max(bs.sig_value) FILTER (WHERE bs.sig_type = 'ip'),
       count(*),
       'banned_signatures',
       (bd.ban_status = 'ACTIVE')
  FROM public.banned_signatures bs
  JOIN public.blocked_devices bd ON bd.device_id = bs.origin_device_id
 WHERE bs.origin_device_id IS NOT NULL
   AND bd.ban_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.ban_fingerprint_profiles x WHERE x.ban_id = bd.ban_id)
 -- ban_status لازم يكون في GROUP BY: ban_id_constraint UNIQUE وليس PRIMARY KEY،
 -- فـ Postgres ما بيستنتج الاعتماد الوظيفي تلقائياً مثل ما يفعل مع PK حقيقي.
 -- ban_id واحد = ban_status واحد، فإضافة العمود لا تغيّر التقسيم.
 GROUP BY bd.ban_id, bd.ban_status, bs.origin_device_id
ON CONFLICT (ban_id) DO UPDATE SET
  fp     = COALESCE(p.fp,     EXCLUDED.fp),
  canvas = COALESCE(p.canvas, EXCLUDED.canvas),
  webgl  = COALESCE(p.webgl,  EXCLUDED.webgl),
  audio  = COALESCE(p.audio,  EXCLUDED.audio),
  fonts  = COALESCE(p.fonts,  EXCLUDED.fonts),
  screen = COALESCE(p.screen, EXCLUDED.screen),
  ua     = COALESCE(p.ua,     EXCLUDED.ua),
  ip     = COALESCE(p.ip,     EXCLUDED.ip);

-- 6.c) الحظر التلقائي القديم (reason يبدأ بـ 'fingerprint match:') كان مبنياً على
--      قاعدة معيبة => نعلّمه للمراجعة اليدوية بدل إبقائه مطمئناً. لا حذف.
UPDATE public.blocked_devices
   SET requires_review = true,
       decision = COALESCE(decision, 'LEGACY_AUTO')
 WHERE decision IS NULL
   AND reason LIKE 'fingerprint match:%';


-- ============================================================================
-- 7) محرّك النقاط: ban_score_visitor
--    يرجع أفضل profile محظور مطابق (score + matched) — مرة واحدة لكل visit.
--    Candidate selection = الـ profiles النشطة التي تطابق إشارة قوية واحدة
--    على الأقل (fp/canvas/webgl/audio/device_id). بدون إشارة قوية أقصى score
--    هو 15 فقط، وهو أقل من عتبة CHALLENGE (70) => لا حاجة لفحصها أصلاً.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ban_score_visitor(
  p_device_id text, p_fp text, p_canvas text, p_webgl text,
  p_audio text, p_fonts text, p_screen text, p_ua text, p_ip text
)
RETURNS TABLE (
  profile_id        uuid,
  ban_id            uuid,
  profile_device_id text,
  score             int,
  strong_count      int,
  matched           text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb := public.ban_scoring_settings();
  wt  jsonb := cfg -> 'weights';
  st  jsonb := cfg -> 'strong_signals';
BEGIN
  RETURN QUERY
  WITH cand AS (
    SELECT pr.*
      FROM public.ban_fingerprint_profiles pr
     WHERE pr.active
       AND (
            pr.device_id = p_device_id
         OR (p_fp     IS NOT NULL AND pr.fp     = p_fp)
         OR (p_canvas IS NOT NULL AND pr.canvas = p_canvas)
         OR (p_webgl  IS NOT NULL AND pr.webgl  = p_webgl)
         OR (p_audio  IS NOT NULL AND pr.audio  = p_audio)
       )
  ),
  scored AS (
    SELECT pr.profile_id,
           pr.ban_id,
           pr.device_id AS profile_device_id,
           ARRAY_REMOVE(ARRAY[
             CASE WHEN pr.device_id = p_device_id  THEN 'device_id' END,
             CASE WHEN p_fp     IS NOT NULL AND pr.fp     = p_fp     THEN 'fp'     END,
             CASE WHEN p_canvas IS NOT NULL AND pr.canvas = p_canvas THEN 'canvas' END,
             CASE WHEN p_webgl  IS NOT NULL AND pr.webgl  = p_webgl  THEN 'webgl'  END,
             CASE WHEN p_audio  IS NOT NULL AND pr.audio  = p_audio  THEN 'audio'  END,
             CASE WHEN p_fonts  IS NOT NULL AND pr.fonts  = p_fonts  THEN 'fonts'  END,
             CASE WHEN p_ip     IS NOT NULL AND pr.ip     = p_ip     THEN 'ip'     END,
             CASE WHEN p_screen IS NOT NULL AND pr.screen = p_screen THEN 'screen' END,
             CASE WHEN p_ua     IS NOT NULL AND pr.ua     = p_ua     THEN 'ua'     END
           ], NULL) AS matched,
           (CASE WHEN pr.device_id = p_device_id  THEN public.cfg_num(wt,'device_id',100) ELSE 0 END
          + CASE WHEN p_fp     IS NOT NULL AND pr.fp     = p_fp     THEN public.cfg_num(wt,'fp',55)     ELSE 0 END
          + CASE WHEN p_canvas IS NOT NULL AND pr.canvas = p_canvas THEN public.cfg_num(wt,'canvas',15) ELSE 0 END
          + CASE WHEN p_webgl  IS NOT NULL AND pr.webgl  = p_webgl  THEN public.cfg_num(wt,'webgl',15)  ELSE 0 END
          + CASE WHEN p_audio  IS NOT NULL AND pr.audio  = p_audio  THEN public.cfg_num(wt,'audio',10)  ELSE 0 END
          + CASE WHEN p_fonts  IS NOT NULL AND pr.fonts  = p_fonts  THEN public.cfg_num(wt,'fonts',5)   ELSE 0 END
          + CASE WHEN p_ip     IS NOT NULL AND pr.ip     = p_ip     THEN public.cfg_num(wt,'ip',5)      ELSE 0 END
          + CASE WHEN p_screen IS NOT NULL AND pr.screen = p_screen THEN public.cfg_num(wt,'screen',3)  ELSE 0 END
          + CASE WHEN p_ua     IS NOT NULL AND pr.ua     = p_ua     THEN public.cfg_num(wt,'ua',2)      ELSE 0 END
           )::int AS raw_score
      FROM cand pr
  ),
  final AS (
    SELECT s.*,
           (SELECT count(*)::int FROM unnest(s.matched) m
             WHERE m IN (SELECT jsonb_array_elements_text(st))) AS strong_count
      FROM scored s
  )
  SELECT f.profile_id,
         f.ban_id,
         f.profile_device_id,
         LEAST(100, f.raw_score)::int,
         f.strong_count,
         f.matched
    FROM final f
   WHERE f.raw_score > 0
   ORDER BY LEAST(100, f.raw_score) DESC, f.strong_count DESC, f.profile_device_id
   LIMIT 5;
END $$;
REVOKE EXECUTE ON FUNCTION public.ban_score_visitor(text,text,text,text,text,text,text,text,text) FROM PUBLIC;


-- ============================================================================
-- 8) دالة القرار: من score إلى BLOCK / CHALLENGE / ALLOW
--    >= 100                    => BLOCK
--    >= 90 و 3+ إشارات قوية    => BLOCK
--    >= 70 و 2+ إشارات قوية    => CHALLENGE
--    < 70                      => ALLOW
--    (شرط 2+ إشارة قوية لـ CHALLENGE يمنع أخطاء الحجب على شبكات المدارس:
--    أجهزة حاسوب متطابقة داخل معمل واحد قد تتطابق في fp مع شاشة وخطوط
--    ومتصفح وIP مشتركة = 70 نقطة بالضبط، وهي غير كافية للحظر أو للتحقق.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ban_decide(p_score int, p_strong_count int)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (SELECT public.ban_scoring_settings() c),
       t AS (SELECT c -> 'thresholds' th FROM s)
  SELECT CASE
           WHEN COALESCE(p_score,0) >= public.cfg_num(th,'block',100) THEN 'BLOCK'
           WHEN COALESCE(p_score,0) >= public.cfg_num(th,'block_soft',90)
             AND COALESCE(p_strong_count,0) >= public.cfg_num(th,'block_soft_min_strong',3) THEN 'BLOCK'
           WHEN COALESCE(p_score,0) >= public.cfg_num(th,'challenge',70)
             AND COALESCE(p_strong_count,0) >= public.cfg_num(th,'challenge_min_strong',2) THEN 'CHALLENGE'
           ELSE 'ALLOW'
         END
    FROM t
$$;
REVOKE EXECUTE ON FUNCTION public.ban_decide(int,int) FROM PUBLIC;


-- ============================================================================
-- 9) سجل التدقيق
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ban_log_audit(
  p_device_id text, p_ban_id uuid, p_ban_status text,
  p_decision text, p_score int, p_strong_count int,
  p_matched text[], p_profile_device_id text, p_profile_id uuid,
  p_reason text, p_actor text DEFAULT 'system'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ban_audit_log(
    device_id, ban_id, ban_status, decision, score, strong_count,
    matched_signals, matched_profile_device_id, matched_profile_id, reason, actor)
  VALUES (
    p_device_id, p_ban_id, p_ban_status, p_decision, COALESCE(p_score,0),
    COALESCE(p_strong_count,0), COALESCE(p_matched,'{}'::text[]),
    p_profile_device_id, p_profile_id,
    left(COALESCE(p_reason,''), 500), COALESCE(p_actor,'system'));
END $$;
REVOKE EXECUTE ON FUNCTION public.ban_log_audit(text,uuid,text,text,int,int,text[],text,uuid,text,text)
  FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 10) الحظر الفعّال فقط: device_is_blocked (تستخدمه سياسات RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.device_is_blocked(p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_devices
     WHERE device_id = p_device_id
       AND ban_status = 'ACTIVE'
       AND (expires_at IS NULL OR expires_at > now())
  )
$$;
REVOKE EXECUTE ON FUNCTION public.device_is_blocked(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.device_is_blocked(text) TO anon, authenticated;

-- التحديات المفتوحة: تقييد خفيف (منع الإبلاغ فقط) — ليست حظراً
CREATE OR REPLACE FUNCTION public.device_has_open_challenge(p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ban_challenges
     WHERE device_id = p_device_id
       AND status = 'OPEN'
       AND created_at > now() - interval '7 days'
  )
$$;
REVOKE EXECUTE ON FUNCTION public.device_has_open_challenge(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.device_has_open_challenge(text) TO anon, authenticated;


-- ============================================================================
-- 11) check_visitor_banned — الحظر النشط فقط + انتهاء المدة
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_visitor_banned(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.blocked_devices;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false, 'decision', 'ALLOW', 'score', 0);
  END IF;

  -- إنهاء الحظر المؤقت: تغيير حالة (لا حذف) حتى يبقى سجل التدقيق
  UPDATE public.blocked_devices
     SET ban_status = 'EXPIRED'
   WHERE device_id = p_device_id
     AND ban_status = 'ACTIVE'
     AND expires_at IS NOT NULL
     AND expires_at <= now();

  SELECT * INTO b FROM public.blocked_devices
   WHERE device_id = p_device_id AND ban_status = 'ACTIVE' LIMIT 1;
  IF b.device_id IS NULL THEN
    RETURN jsonb_build_object('banned', false, 'decision', 'ALLOW', 'score', 0);
  END IF;

  RETURN jsonb_build_object(
    'banned', true,
    'decision', 'BLOCK',
    'reason', COALESCE(b.reason, 'محظور'),
    'expires_at', b.expires_at,
    'ban_expires_at', b.ban_expires_at,
    'score', COALESCE(b.confidence_score, 100),
    'matched', COALESCE(b.matched_signals, ARRAY['device_id']::text[]),
    'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.check_visitor_banned(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_visitor_banned(text) TO anon, authenticated;


-- ============================================================================
-- 12) record_visitor_fingerprint — الدالة الرئيسية (نفس الـ signature)
--     ترجع: banned / decision / score / matched / challenge / …
--     الخادم يحسب كل شيء. العميل لا يرسل score أبداً.
-- ============================================================================
DROP FUNCTION IF EXISTS public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.record_visitor_fingerprint(
  p_device_id text, p_ip_hash text, p_ua_hash text, p_canvas_hash text,
  p_webgl_hash text, p_audio_hash text, p_fonts_hash text,
  p_screen_hash text, p_fp_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b        public.blocked_devices;
  linked_id text;
  new_id    text;
  my_name   text;
  warn      jsonb;
  best_ban      uuid;
  best_prof     uuid;
  best_prof_dev text;
  best_score    int := 0;
  best_strong   int := 0;
  best_matched  text[] := '{}'::text[];
  cfg       jsonb := public.ban_scoring_settings();
  decision  text := 'ALLOW';
  score     int  := 0;
  strong_n  int  := 0;
  matched   text[] := '{}'::text[];
  prof_dev  text;
  prof_id   uuid;
  open_ch   int := 0;
  esc_after int;
  reason    text;
  out       jsonb;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('banned', false, 'decision', 'ALLOW', 'score', 0,
                              'matched', '[]'::jsonb);
  END IF;

  -- 0) تنقية الإشارات: تحويل 'unknown' والقصير إلى NULL
  IF p_ip_hash     IS NULL OR length(p_ip_hash)     < 8 OR p_ip_hash     = 'unknown' THEN p_ip_hash     := NULL; END IF;
  IF p_ua_hash     IS NULL OR length(p_ua_hash)     < 8 OR p_ua_hash     = 'unknown' THEN p_ua_hash     := NULL; END IF;
  IF p_canvas_hash IS NULL OR length(p_canvas_hash) < 8 OR p_canvas_hash = 'unknown' THEN p_canvas_hash := NULL; END IF;
  IF p_webgl_hash  IS NULL OR length(p_webgl_hash)  < 8 OR p_webgl_hash  = 'unknown' THEN p_webgl_hash  := NULL; END IF;
  IF p_audio_hash  IS NULL OR length(p_audio_hash)  < 8 OR p_audio_hash  = 'unknown' THEN p_audio_hash  := NULL; END IF;
  IF p_fonts_hash  IS NULL OR length(p_fonts_hash)  < 8 OR p_fonts_hash  = 'unknown' THEN p_fonts_hash  := NULL; END IF;
  IF p_screen_hash IS NULL OR length(p_screen_hash) < 8 OR p_screen_hash = 'unknown' THEN p_screen_hash := NULL; END IF;
  IF p_fp_hash     IS NULL OR length(p_fp_hash)     < 8 OR p_fp_hash     = 'unknown' THEN p_fp_hash     := NULL; END IF;

  -- 1) ربط الهوية (نفس الجهاز بمعرّف جديد بعد مسح التخزين/تغيّر الدومين)
  --    قاعدة مُصلَحة: لا نربط أبداً عبر screen أو ip وحدهما (مصدر حظر أبرياء
  --    على الشبكة المشتركة). نشترط إشارتين قويتين على الأقل.
  SELECT ds.device_id INTO linked_id
    FROM public.device_signatures ds
    JOIN (VALUES
      ('canvas'::text, p_canvas_hash),
      ('fp',           p_fp_hash),
      ('webgl',        p_webgl_hash),
      ('audio',        p_audio_hash)
    ) v(t, val) ON ds.sig_type = v.t AND ds.sig_value = v.val
   WHERE ds.device_id <> p_device_id
     AND v.val IS NOT NULL
   GROUP BY ds.device_id
  HAVING count(DISTINCT v.t) >= public.cfg_num(cfg, 'link_identity_min_strong', 2)
   ORDER BY count(DISTINCT v.t) DESC, max(ds.last_seen) DESC
   LIMIT 1;

  IF linked_id IS NOT NULL THEN
    new_id := p_device_id;

    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash, first_seen, last_seen, hits)
    SELECT linked_id, df.ip_hash, df.ua_hash, df.first_seen, df.last_seen, df.hits
      FROM public.device_fingerprints df
     WHERE df.device_id = new_id
    ON CONFLICT (device_id, ip_hash) DO UPDATE
       SET last_seen = GREATEST(public.device_fingerprints.last_seen, EXCLUDED.last_seen),
           hits     = public.device_fingerprints.hits + EXCLUDED.hits,
           ua_hash  = EXCLUDED.ua_hash;
    DELETE FROM public.device_fingerprints WHERE device_id = new_id;

    IF NOT EXISTS (SELECT 1 FROM public.device_names WHERE device_id = linked_id) THEN
      INSERT INTO public.device_names(device_id, name)
      SELECT linked_id, dn.name FROM public.device_names dn WHERE dn.device_id = new_id
      ON CONFLICT (device_id) DO NOTHING;
    END IF;

    UPDATE public.device_warnings dw
       SET device_id = linked_id
     WHERE dw.device_id = new_id
       AND dw.seen_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.device_warnings x
          WHERE x.device_id = linked_id AND x.message = dw.message AND x.seen_at IS NULL
       );

    DELETE FROM public.device_warnings   WHERE device_id = new_id;
    DELETE FROM public.device_signatures WHERE device_id = new_id;
    p_device_id := linked_id;
  END IF;

  -- 2) التحذير المعلّق
  SELECT jsonb_build_object('warning', dw.message, 'warning_at', dw.created_at)
    INTO warn
    FROM public.device_warnings dw
   WHERE dw.device_id = p_device_id AND dw.seen_at IS NULL
   LIMIT 1;

  my_name := public.get_device_name(p_device_id);

  -- 3) إنهاء الحظر المؤقت (تغيير حالة، لا حذف — يبقى سجل التدقيق)
  UPDATE public.blocked_devices
     SET ban_status = 'EXPIRED'
   WHERE device_id = p_device_id
     AND ban_status = 'ACTIVE'
     AND expires_at IS NOT NULL
     AND expires_at <= now();

  -- 4) الحظر المباشر بمعرّف الجهاز (أقوى إشارة: 100 ⇒ BLOCK فوري)
  SELECT * INTO b FROM public.blocked_devices
   WHERE device_id = p_device_id AND ban_status = 'ACTIVE' LIMIT 1;
  IF b.device_id IS NOT NULL THEN
    UPDATE public.blocked_devices SET last_seen = now() WHERE device_id = p_device_id;
    out := jsonb_build_object(
      'banned', true,
      'decision', 'BLOCK',
      'score', 100,
      'strong_count', 0,
      'matched', jsonb_build_array('device_id'),
      'reason', COALESCE(b.reason, 'محظور'),
      'expires_at', b.expires_at,
      'ban_expires_at', b.ban_expires_at,
      'evidence_url', CASE WHEN b.evidence_visible THEN b.evidence_url ELSE NULL END,
      'device_name', my_name,
      'device_id', p_device_id,
      'linked', linked_id IS NOT NULL
    ) || COALESCE(warn, '{}'::jsonb);
    RETURN out;
  END IF;

  -- 5) تسجيل الإشارات (hashes فقط)
  INSERT INTO public.device_signatures(device_id, sig_type, sig_value)
  SELECT p_device_id, v.t, v.val
    FROM (VALUES
      ('ip'::text,     p_ip_hash),
      ('ua',           p_ua_hash),
      ('canvas',       p_canvas_hash),
      ('webgl',        p_webgl_hash),
      ('audio',        p_audio_hash),
      ('fonts',        p_fonts_hash),
      ('screen',       p_screen_hash),
      ('fp',           p_fp_hash)
    ) AS v(t, val)
   WHERE v.val IS NOT NULL
  ON CONFLICT (device_id, sig_type, sig_value) DO UPDATE SET last_seen = now();

  IF p_ip_hash IS NOT NULL THEN
    INSERT INTO public.device_fingerprints(device_id, ip_hash, ua_hash)
         VALUES (p_device_id, p_ip_hash, COALESCE(p_ua_hash,''))
    ON CONFLICT (device_id, ip_hash) DO UPDATE
         SET last_seen = now(),
             hits = public.device_fingerprints.hits + 1;
  END IF;

  -- 6) حساب النقاط: أعلى تطابق منطقي مع profile واحد فقط
  --    (لا تُجمع نقاط من أجهزة مختلفة — هذا هو مفتاح تقليل الحجب الخاطئ)
  SELECT s.score, s.strong_count, s.matched, s.profile_device_id, s.profile_id, s.ban_id
    INTO best_score, best_strong, best_matched, best_prof_dev, best_prof, best_ban
    FROM public.ban_score_visitor(
           p_device_id, p_fp_hash, p_canvas_hash, p_webgl_hash,
           p_audio_hash, p_fonts_hash, p_screen_hash, p_ua_hash, p_ip_hash) s
   LIMIT 1;

  IF best_score IS NOT NULL AND best_score > 0 THEN
    score    := best_score;
    strong_n := best_strong;
    matched  := best_matched;
    prof_dev := best_prof_dev;
    prof_id  := best_prof;
    decision := public.ban_decide(score, strong_n);
  ELSE
    decision := 'ALLOW';
  END IF;

  -- 7) القرار
  IF decision = 'BLOCK' THEN
    reason := 'تطابق بصمة مع جهاز محظور (' || array_to_string(matched, '+') || ')';

    INSERT INTO public.blocked_devices(
      device_id, reason, ban_status, decision, confidence_score,
      matched_signals, matched_profile_device_id, match_reason, requires_review, last_seen)
    VALUES (
      p_device_id, reason, 'ACTIVE', 'AUTO_BLOCK', score,
      matched, prof_dev, reason, false, now())
    ON CONFLICT (device_id) DO UPDATE
      SET reason = EXCLUDED.reason,
          ban_status = 'ACTIVE',
          decision = EXCLUDED.decision,
          confidence_score = EXCLUDED.confidence_score,
          matched_signals = EXCLUDED.matched_signals,
          matched_profile_device_id = EXCLUDED.matched_profile_device_id,
          match_reason = EXCLUDED.match_reason,
          unbanned_at = NULL, unbanned_by = NULL,
          last_seen = now()
    RETURNING ban_id INTO b.ban_id;

    PERFORM public.ban_log_audit(
      p_device_id, b.ban_id, 'ACTIVE', 'BLOCK', score, strong_n,
      matched, prof_dev, prof_id, reason, 'auto');

    out := jsonb_build_object(
      'banned', true,
      'decision', 'BLOCK',
      'score', score,
      'strong_count', strong_n,
      'matched', to_jsonb(matched),
      'reason', reason,
      'device_name', my_name,
      'device_id', p_device_id,
      'linked', linked_id IS NOT NULL
    ) || COALESCE(warn, '{}'::jsonb);
    RETURN out;

  ELSIF decision = 'CHALLENGE' THEN
    -- ليس حظراً: تسجيل + إشعار + منع الإبلاغ + ترقية عند التكرار
    reason := 'تطابق جزئي مشبوه (' || array_to_string(matched, '+') || ')';

    INSERT INTO public.ban_challenges(
      device_id, score, strong_count, matched_signals,
      matched_profile_device_id, matched_profile_id, reason)
    VALUES (p_device_id, score, strong_n, matched, prof_dev, prof_id, reason);

    SELECT count(*)::int INTO open_ch
      FROM public.ban_challenges
     WHERE device_id = p_device_id
       AND status = 'OPEN'
       AND created_at > now() - interval '7 days';

    esc_after := public.cfg_num(cfg, 'escalate_after', 3);
    IF esc_after > 0 AND open_ch >= esc_after THEN
      -- ترقية للحظر، مع علم المراجعة اليدوية
      INSERT INTO public.blocked_devices(
        device_id, reason, ban_status, decision, confidence_score,
        matched_signals, matched_profile_device_id, match_reason, requires_review, last_seen)
      VALUES (
        p_device_id,
        'تصعيد: ' || open_ch || ' تحقق مشبوه خلال 7 أيام — ' || reason,
        'ACTIVE', 'CHALLENGE_ESCALATED', score,
        matched, prof_dev, reason, true, now())
      ON CONFLICT (device_id) DO UPDATE
        SET reason = EXCLUDED.reason,
            ban_status = 'ACTIVE',
            decision = EXCLUDED.decision,
            confidence_score = EXCLUDED.confidence_score,
            matched_signals = EXCLUDED.matched_signals,
            matched_profile_device_id = EXCLUDED.matched_profile_device_id,
            match_reason = EXCLUDED.match_reason,
            requires_review = true,
            unbanned_at = NULL, unbanned_by = NULL,
            last_seen = now()
      RETURNING ban_id INTO b.ban_id;

      UPDATE public.ban_challenges
         SET status = 'ESCALATED', resolved_at = now()
       WHERE device_id = p_device_id AND status = 'OPEN';

      PERFORM public.ban_log_audit(
        p_device_id, b.ban_id, 'ACTIVE', 'BLOCK', score, strong_n,
        matched, prof_dev, prof_id,
        'تصعيد بعد ' || open_ch || ' تحقق', 'escalation');

      out := jsonb_build_object(
        'banned', true, 'decision', 'BLOCK', 'score', score,
        'strong_count', strong_n, 'matched', to_jsonb(matched),
        'reason', 'تصعيد تلقائي: ' || open_ch || ' تحقق مشبوه',
        'device_name', my_name, 'device_id', p_device_id,
        'linked', linked_id IS NOT NULL
      ) || COALESCE(warn, '{}'::jsonb);
      RETURN out;
    END IF;

    PERFORM public.ban_log_audit(
      p_device_id, NULL, 'ACTIVE', 'CHALLENGE', score, strong_n,
      matched, prof_dev, prof_id, reason, 'system');

    out := jsonb_build_object(
      'banned', false,
      'decision', 'CHALLENGE',
      'score', score,
      'strong_count', strong_n,
      'matched', to_jsonb(matched),
      'challenge', jsonb_build_object(
        'reason', reason,
        'open_count', open_ch,
        'restrict_reporting', true
      ),
      'device_name', my_name,
      'device_id', p_device_id,
      'linked', linked_id IS NOT NULL
    ) || COALESCE(warn, '{}'::jsonb);
    RETURN out;
  END IF;

  -- 8) ALLOW
  RETURN jsonb_build_object(
    'banned', false, 'decision', 'ALLOW', 'score', score,
    'strong_count', strong_n, 'matched', to_jsonb(matched),
    'device_name', my_name, 'device_id', p_device_id,
    'linked', linked_id IS NOT NULL
  ) || COALESCE(warn, '{}'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_visitor_fingerprint(text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- ============================================================================
-- 13) الإبلاغ: المحظور والمتحقق منه لا يبلّغان
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_report(
  p_reporter_device_id text, p_content_type text, p_content_id uuid,
  p_reason_code text, p_reason_text text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_did text;
  snap text;
BEGIN
  IF p_reporter_device_id IS NULL OR length(p_reporter_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_content_type NOT IN ('post','comment','chat_post','chat_comment') THEN
    RAISE EXCEPTION 'invalid content type';
  END IF;
  IF p_reason_code IS NULL OR length(btrim(p_reason_code)) = 0 THEN
    RAISE EXCEPTION 'reason required';
  END IF;
  IF p_reason_text IS NOT NULL AND length(p_reason_text) > 500 THEN
    RAISE EXCEPTION 'reason too long';
  END IF;

  UPDATE public.blocked_devices SET ban_status = 'EXPIRED'
   WHERE device_id = p_reporter_device_id
     AND ban_status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= now();

  IF public.device_is_blocked(p_reporter_device_id) THEN
    RAISE EXCEPTION 'banned';
  END IF;
  IF public.device_has_open_challenge(p_reporter_device_id) THEN
    RAISE EXCEPTION 'challenge';
  END IF;

  IF p_content_type = 'post' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.posts         WHERE id = p_content_id;
  ELSIF p_content_type = 'comment' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.comments      WHERE id = p_content_id;
  ELSIF p_content_type = 'chat_post' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.chat_posts    WHERE id = p_content_id;
  ELSIF p_content_type = 'chat_comment' THEN
    SELECT device_id, left(content, 800) INTO owner_did, snap FROM public.chat_comments WHERE id = p_content_id;
  END IF;

  IF owner_did IS NULL THEN
    RAISE EXCEPTION 'content not found';
  END IF;

  INSERT INTO public.reports(
    reporter_device_id, content_type, content_id,
    content_owner_device_id, content_snapshot, reason_code, reason_text)
  VALUES (
    p_reporter_device_id, p_content_type, p_content_id,
    owner_did, snap, p_reason_code, NULLIF(btrim(p_reason_text),''))
  ON CONFLICT (reporter_device_id, content_type, content_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_report(text,text,uuid,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_report(text,text,uuid,text,text) TO anon, authenticated;


-- ============================================================================
-- 14) الحظر اليدوي: يسجّل ban_id + قرار MANUAL + سجل تدقيق
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_ban_device(
  p_device_id text, p_reason text, p_evidence_url text,
  p_expires_at timestamptz, p_evidence_visible boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_ban_id   uuid;
  v_user_id  uuid;
  v_matched  text[];
  v_score    int;
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason required';
  END IF;
  IF p_evidence_url IS NOT NULL AND length(p_evidence_url) > 0
     AND p_evidence_url !~ '^https?://[a-zA-Z0-9.-]+/storage/v1/object/public/attachments/' THEN
    RAISE EXCEPTION 'invalid evidence url';
  END IF;

  UPDATE public.blocked_devices SET ban_status = 'EXPIRED'
   WHERE device_id = p_device_id
     AND ban_status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= now();

  SELECT ban_id, matched_signals, confidence_score, user_id
    INTO v_ban_id, v_matched, v_score, v_user_id
    FROM public.blocked_devices WHERE device_id = p_device_id LIMIT 1;

  INSERT INTO public.blocked_devices(
    device_id, reason, expires_at, evidence_url, evidence_visible, banned_by,
    user_id, ban_status, decision, confidence_score, matched_signals, match_reason,
    requires_review, last_seen, unbanned_at, unbanned_by)
  VALUES (
    p_device_id, btrim(p_reason), p_expires_at,
    NULLIF(p_evidence_url,''), COALESCE(p_evidence_visible, true), v_user,
    v_user_id, 'ACTIVE', 'MANUAL', COALESCE(v_score, 100),
    COALESCE(v_matched, ARRAY['device_id']::text[]),
    'حظر يدوي من الإدارة', false, now(), NULL, NULL)
  ON CONFLICT (device_id) DO UPDATE
    SET reason           = EXCLUDED.reason,
        expires_at       = EXCLUDED.expires_at,
        evidence_url     = EXCLUDED.evidence_url,
        evidence_visible = EXCLUDED.evidence_visible,
        banned_by        = EXCLUDED.banned_by,
        ban_status       = 'ACTIVE',
        decision         = 'MANUAL',
        confidence_score = EXCLUDED.confidence_score,
        matched_signals  = EXCLUDED.matched_signals,
        match_reason     = EXCLUDED.match_reason,
        requires_review  = false,
        unbanned_at      = NULL,
        unbanned_by      = NULL,
        last_seen        = now()
  RETURNING ban_id INTO v_ban_id;

  PERFORM public.ban_log_audit(
    p_device_id, v_ban_id, 'ACTIVE', 'BLOCK', COALESCE(v_score,100), 0,
    COALESCE(v_matched, ARRAY['device_id']::text[]), NULL, NULL,
    btrim(p_reason), 'admin:' || v_user::text);

  RETURN jsonb_build_object('ok', true, 'ban_id', v_ban_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_ban_device(text,text,text,timestamptz,boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_ban_device(text,text,text,timestamptz,boolean) TO authenticated;


-- ============================================================================
-- 15) فك الحظر: تغيير حالة (لا حذف)
--     - ban_status = UNBANNED
--     - سجل التدقيق يبقى
--     - الـ profile يُعطَّل ⇒ لا يبقى الحظر بسبب سجل قديم تم إلغاؤه
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_unban_device(p_device_id text, p_status text DEFAULT 'UNBANNED')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_ban   uuid;
  v_score int;
  v_matched text[];
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid device';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('UNBANNED','REVOKED') THEN
    p_status := 'UNBANNED';
  END IF;

  UPDATE public.blocked_devices
     SET ban_status = p_status,
         unbanned_at = now(),
         unbanned_by = v_user,
         requires_review = false
   WHERE device_id = p_device_id
  RETURNING ban_id, confidence_score, matched_signals INTO v_ban, v_score, v_matched;

  IF v_ban IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no ban record');
  END IF;

  -- تعطيل الـ profile حتى لا يبقى التطابق مفعّلاً
  UPDATE public.ban_fingerprint_profiles
     SET active = false, updated_at = now()
   WHERE ban_id = v_ban AND active;

  -- إغلاق التحديات المعلّقة
  UPDATE public.ban_challenges
     SET status = 'CLEARED', resolved_at = now(), resolved_by = v_user
   WHERE device_id = p_device_id AND status = 'OPEN';

  PERFORM public.ban_log_audit(
    p_device_id, v_ban, p_status, 'ALLOW', COALESCE(v_score,0), 0,
    COALESCE(v_matched,'{}'::text[]), NULL, NULL,
    'رفع الحظر من الإدارة', 'admin:' || v_user::text);

  RETURN jsonb_build_object('ok', true, 'ban_status', p_status);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_unban_device(text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_unban_device(text,text) TO authenticated;


-- 15.b) كسر الحظر بالرمز السري: نفس المنطق (تغيير حالة، لا حذف)
CREATE OR REPLACE FUNCTION public.bypass_ban_with_code(p_device_id text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ban uuid;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  IF p_code IS NULL OR p_code <> 'aabbdd99' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.blocked_devices
     SET ban_status = 'UNBANNED', unbanned_at = now(), requires_review = false
   WHERE device_id = p_device_id AND ban_status = 'ACTIVE'
  RETURNING ban_id INTO v_ban;

  IF v_ban IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.ban_fingerprint_profiles
     SET active = false, updated_at = now()
   WHERE ban_id = v_ban AND active;

  UPDATE public.ban_challenges
     SET status = 'CLEARED', resolved_at = now()
   WHERE device_id = p_device_id AND status = 'OPEN';

  PERFORM public.ban_log_audit(
    p_device_id, v_ban, 'UNBANNED', 'ALLOW', 0, 0, '{}'::text[],
    NULL, NULL, 'كسر الحظر برمز الاستثناء', 'bypass');

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) TO anon, authenticated;


-- ============================================================================
-- 16) تقرير البلاغات: ينشئ ban بدل INSERT مغلق
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_resolve_report(p_report_id uuid, p_action text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.reports;
  v_ban uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO r FROM public.reports WHERE id = p_report_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;

  IF p_action = 'ban_owner' THEN
    IF p_note IS NULL OR length(btrim(p_note)) = 0 THEN
      RAISE EXCEPTION 'reason required';
    END IF;
    INSERT INTO public.blocked_devices(
      device_id, reason, banned_by, ban_status, decision,
      confidence_score, matched_signals, match_reason, last_seen)
    VALUES (
      r.content_owner_device_id, btrim(p_note), auth.uid(), 'ACTIVE', 'MANUAL',
      100, ARRAY['device_id']::text[], 'حظر من تقرير', now())
    ON CONFLICT (device_id) DO UPDATE
      SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by,
          ban_status = 'ACTIVE', decision = 'MANUAL',
          confidence_score = 100, match_reason = EXCLUDED.match_reason,
          unbanned_at = NULL, unbanned_by = NULL, requires_review = false
    RETURNING ban_id INTO v_ban;

    PERFORM public.ban_log_audit(
      r.content_owner_device_id, v_ban, 'ACTIVE', 'BLOCK', 100, 0,
      ARRAY['device_id']::text[], NULL, NULL, btrim(p_note), 'report:' || p_report_id::text);

    UPDATE public.reports
       SET status='resolved', resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
  ELSIF p_action = 'content_deleted' THEN
    IF r.content_type='post' THEN DELETE FROM public.posts WHERE id = r.content_id;
    ELSIF r.content_type='comment' THEN DELETE FROM public.comments WHERE id = r.content_id;
    ELSIF r.content_type='chat_post' THEN DELETE FROM public.chat_posts WHERE id = r.content_id;
    ELSIF r.content_type='chat_comment' THEN DELETE FROM public.chat_comments WHERE id = r.content_id;
    END IF;
    UPDATE public.reports
       SET status='content_deleted', resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
    UPDATE public.reports SET status='content_deleted', resolved_at=now(), resolved_by=auth.uid()
     WHERE content_type = r.content_type AND content_id = r.content_id
       AND status='open' AND id <> p_report_id;
  ELSIF p_action IN ('dismissed','resolved') THEN
    UPDATE public.reports
       SET status=p_action, resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     WHERE id = p_report_id;
  ELSE
    RAISE EXCEPTION 'invalid action';
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_report(uuid,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_resolve_report(uuid,text,text) TO authenticated;


-- ============================================================================
-- 17) الحذف الفعلي من الأدمن يبقى ممكناً وينظّف كل الأثر
--     (غير مستخدم في الرفع العادي — الرفع الآن = تغيير حالة)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_device_ban_artifacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ban_fingerprint_profiles
   WHERE device_id = OLD.device_id OR ban_id = OLD.ban_id;
  DELETE FROM public.banned_fingerprints
   WHERE origin_device_id = OLD.device_id
      OR ip_hash IN (SELECT ip_hash FROM public.device_fingerprints WHERE device_id = OLD.device_id);
  DELETE FROM public.device_fingerprints WHERE device_id = OLD.device_id;

  DELETE FROM public.banned_signatures
   WHERE origin_device_id = OLD.device_id
      OR (sig_type, sig_value) IN (SELECT sig_type, sig_value FROM public.device_signatures WHERE device_id = OLD.device_id);
  DELETE FROM public.device_signatures WHERE device_id = OLD.device_id;
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.cleanup_device_ban_artifacts() FROM PUBLIC;

DROP TRIGGER IF EXISTS blocked_devices_cleanup_fps ON public.blocked_devices;
CREATE TRIGGER blocked_devices_cleanup_fps
  AFTER DELETE ON public.blocked_devices
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_device_ban_artifacts();


-- ============================================================================
-- 18) لوحة الأدمن: ملف الجهاز + سجل الحظر (بند واحد، بدون طلبات زيادة)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_device_dossier(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'device_id', p_device_id,
    'device_name', public.get_device_name(p_device_id),
    'label', (SELECT label FROM public.device_notes WHERE device_id = p_device_id),
    'is_admin', EXISTS(SELECT 1 FROM public.admin_devices WHERE device_id = p_device_id),
    'is_blocked', public.device_is_blocked(p_device_id),
    'ban', (SELECT jsonb_build_object(
              'ban_id',       bd.ban_id,
              'status',       bd.ban_status,
              'decision',     bd.decision,
              'score',        COALESCE(bd.confidence_score, 100),
              'matched',      COALESCE(bd.matched_signals, '{}'::text[]),
              'match_reason', bd.match_reason,
              'reason',       bd.reason,
              'created_at',   bd.created_at,
              'ban_created_at', bd.ban_created_at,
              'expires_at',   bd.expires_at,
              'ban_expires_at', bd.ban_expires_at,
              'requires_review', bd.requires_review,
              'banned_by',    bd.banned_by,
              'unbanned_at',  bd.unbanned_at,
              'matched_profile_device_id', bd.matched_profile_device_id
            )
          FROM public.blocked_devices bd
         WHERE bd.device_id = p_device_id
         ORDER BY bd.created_at DESC LIMIT 1),
    'last_seen', (SELECT max(last_seen) FROM public.device_signatures WHERE device_id = p_device_id),
    'challenge', (SELECT jsonb_build_object(
                    'score',    bc.score,
                    'matched',  bc.matched_signals,
                    'reason',   bc.reason,
                    'since',    bc.created_at,
                    'open_count', (SELECT count(*)::int FROM public.ban_challenges x
                                    WHERE x.device_id = p_device_id AND x.status='OPEN')
                  )
                  FROM public.ban_challenges bc
                 WHERE bc.device_id = p_device_id AND bc.status = 'OPEN'
                 ORDER BY bc.created_at DESC LIMIT 1),
    'ban_history', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
                       FROM (SELECT decision, score, strong_count, matched_signals,
                                    matched_profile_device_id, reason, actor, created_at, ban_status
                               FROM public.ban_audit_log
                              WHERE device_id = p_device_id
                              ORDER BY created_at DESC LIMIT 20) a),
    'profile', (SELECT jsonb_build_object(
                    'fp',     left(p.fp,     12),
                    'canvas', left(p.canvas, 12),
                    'webgl',  left(p.webgl,  12),
                    'audio',  left(p.audio,  12),
                    'fonts',  left(p.fonts,  12),
                    'screen', left(p.screen, 12),
                    'ua',     left(p.ua,     12),
                    'ip',     left(p.ip,     12),
                    'active', p.active
                  )
                  FROM public.ban_fingerprint_profiles p
                 WHERE p.device_id = p_device_id AND p.active
                 LIMIT 1),
    'warning', (SELECT message FROM public.device_warnings WHERE device_id = p_device_id),
    'warning_at', (SELECT created_at FROM public.device_warnings WHERE device_id = p_device_id),
    'warning_seen', (SELECT seen_at FROM public.device_warnings WHERE device_id = p_device_id),
    'presence', (SELECT to_jsonb(dp) FROM public.device_presence dp WHERE dp.device_id = p_device_id),
    'sigs', (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', s.sig_type, 'value', left(s.sig_value, 40), 'last_seen', s.last_seen) ORDER BY s.last_seen DESC), '[]'::jsonb)
              FROM public.device_signatures s WHERE s.device_id = p_device_id),
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


-- 18.b) قائمة الأجهزة: ban_status بدل is_blocked فقط
--  شرط مهم: التوقيع يجب أن يطابق نداء Admin.tsx تماماً
--  (p_search, p_limit, p_offset, p_sort). لو اختلف التوقيع اختار PostgREST
--  نسخة أخرى وأعادت الحقول الناقصة (ban_score/ban_status/...) فاختفت كل
--  شارات نظام النقاط من اللوحة. لذلك نوحّدها هنا على 4 وسائط ونحذف
--  نسخة 3-الوسائط حتى لا يبقى بديل يتنافس عليها.
DROP FUNCTION IF EXISTS public.admin_list_devices(text,int,int);

CREATE OR REPLACE FUNCTION public.admin_list_devices(
  p_search text DEFAULT NULL, p_limit int DEFAULT 100, p_offset int DEFAULT 0,
  p_sort   text DEFAULT 'new'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH devices AS (
    SELECT device_id FROM public.device_presence
    UNION SELECT device_id FROM public.device_names
    UNION SELECT device_id FROM public.device_aliases
    UNION SELECT device_id FROM public.posts
    UNION SELECT device_id FROM public.comments
    UNION SELECT device_id FROM public.blocked_devices
  ), rows AS (
    SELECT
      d.device_id,
      COALESCE(n.name, '')                      AS name,
      COALESCE(nt.label, '')                    AS label,
      COALESCE(al.number, 0)                     AS anon_number,
      COALESCE(sp.cnt, 0)::int                  AS post_count,
      COALESCE(sc.cnt, 0)::int                  AS comment_count,
      COALESCE(cp.cnt, 0)::int                  AS chat_count,
      pr.first_seen, pr.last_seen,
      COALESCE(pr.visits, 0)::int               AS visits,
      EXISTS (SELECT 1 FROM public.blocked_devices b
               WHERE b.device_id = d.device_id AND b.ban_status = 'ACTIVE') AS is_blocked,
      (SELECT b.ban_status FROM public.blocked_devices b WHERE b.device_id = d.device_id
        ORDER BY b.created_at DESC LIMIT 1)                                AS ban_status,
      (SELECT b.confidence_score FROM public.blocked_devices b WHERE b.device_id = d.device_id
        ORDER BY b.created_at DESC LIMIT 1)                                AS ban_score,
      (SELECT b.requires_review FROM public.blocked_devices b WHERE b.device_id = d.device_id
        ORDER BY b.created_at DESC LIMIT 1)                                AS ban_needs_review,
      EXISTS (SELECT 1 FROM public.ban_challenges c
               WHERE c.device_id = d.device_id AND c.status = 'OPEN')       AS is_challenged,
      EXISTS (SELECT 1 FROM public.admin_devices a WHERE a.device_id = d.device_id) AS is_admin,
      (SELECT w.message FROM public.device_warnings w WHERE w.device_id = d.device_id) AS warning
    FROM devices d
    LEFT JOIN public.device_names n  ON n.device_id = d.device_id
    LEFT JOIN public.device_notes nt ON nt.device_id = d.device_id
    LEFT JOIN public.device_aliases al ON al.device_id = d.device_id
    LEFT JOIN public.device_presence pr ON pr.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.posts    GROUP BY device_id) sp ON sp.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.comments GROUP BY device_id) sc ON sc.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.chat_posts GROUP BY device_id) cp ON cp.device_id = d.device_id
    WHERE p_search IS NULL OR btrim(p_search) = ''
       OR COALESCE(n.name, '') ILIKE '%' || btrim(p_search) || '%'
       OR COALESCE(nt.label, '') ILIKE '%' || btrim(p_search) || '%'
       OR d.device_id ILIKE '%' || btrim(p_search) || '%'
  ), sorted AS (
    SELECT * FROM rows
    ORDER BY
      CASE WHEN p_sort = 'old' THEN COALESCE(first_seen, 'epoch'::timestamptz) END ASC NULLS LAST,
      CASE WHEN p_sort = 'num' THEN anon_number END ASC NULLS LAST,
      last_seen DESC NULLS LAST
    LIMIT LEAST(GREATEST(p_limit,1),500) OFFSET GREATEST(p_offset,0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM rows),
    'rows',  COALESCE((SELECT jsonb_agg(to_jsonb(sorted)) FROM sorted), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_list_devices(text,int,int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_devices(text,int,int,text) TO authenticated;


-- ============================================================================
-- 19) ضبط الإعدادات من الأدمن
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_ban_scoring_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'settings', public.ban_scoring_settings(),
    'rows', (SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
               FROM public.ban_scoring_config)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.admin_ban_scoring_config() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_ban_scoring_config() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_ban_scoring_config(p_key text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_key IS NULL OR p_key NOT IN
     ('weights','strong_signals','thresholds','escalate_after','link_identity_min_strong') THEN
    RAISE EXCEPTION 'invalid key';
  END IF;
  IF p_value IS NULL THEN RAISE EXCEPTION 'invalid value'; END IF;

  INSERT INTO public.ban_scoring_config(key, value, updated_at, updated_by)
  VALUES (p_key, p_value, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by;

  RETURN jsonb_build_object('ok', true, 'settings', public.ban_scoring_settings());
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_ban_scoring_config(text,jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_ban_scoring_config(text,jsonb) TO authenticated;


-- ============================================================================
-- 20) تنظيف دوري: إنهاء الحظور المؤقتة المنتهية (تغيير حالة فقط، لا حذف)
--     استدعِه من Cron/Edge كل ساعة، أو يدوياً من SQL Editor.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ban_expire_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  WITH done AS (
    UPDATE public.blocked_devices
       SET ban_status = 'EXPIRED'
     WHERE ban_status = 'ACTIVE'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
    RETURNING device_id, ban_id, confidence_score, matched_signals
  )
  INSERT INTO public.ban_audit_log(
    device_id, ban_id, ban_status, decision, score, matched_signals, reason, actor)
  SELECT device_id, ban_id, 'EXPIRED', 'ALLOW',
         COALESCE(confidence_score,0), COALESCE(matched_signals,'{}'::text[]),
         'انتهت مدة الحظر', 'system'
    FROM done;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.ban_expire_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ban_expire_due() TO service_role;

-- ============================================================================
-- 21) تنظيف التحديات القديمة حتى لا تتراكم
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ban_challenge_gc(p_days int DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.ban_challenges
   WHERE created_at < now() - make_interval(days => GREATEST(p_days, 7));
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.ban_audit_log
   WHERE created_at < now() - interval '180 days';
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.ban_challenge_gc(int) FROM PUBLIC, anon, authenticated;

 ------------------------------------------------------------------------------
 --  20261001000000_unique_device_names.sql
 ------------------------------------------------------------------------------
-- ============================================================================
--  منع تبادل الأسماء — اسم واحد = جهاز واحد
-- ============================================================================
--  المشكلة:
--    device_names كان له PRIMARY KEY على device_id فقط، وعمود name بلا أي
--    قيد تفرّد. أي جهاز يقدر يكتب أي اسم — حتى اسم جهاز آخر تماماً.
--    النتيجة: الاسم ما عاد يميّز حدا، لأن جهازين أو عشرة يحملون نفس
--    الاسم، وتختلط سجلات الإدارة فتصبح التوقيفات على أساس الاسم خاطئة.
--
--  الحل:
--    1) قيد تفرّد على lower(name) — الاسم بعد التطبيع (case-insensitive)
--       يتبع جهازاً واحداً فقط.
--    2) تطبيع الأسماء المكرّرة الموجودة: نُبقي الأقدم ونحذف الباقي.
--    3) set_device_name يرفض الاسم المحجوز برسالة واضحة بدل أن يبتلعه
--       صامتاً في ON CONFLICT.
--
--  ملاحظة: لا يمس هذا الملف أي بيانات محتوى (منشورات/تعليقات)، ويهتم
--  بجدول device_names فقط.
-- ============================================================================


-- ============================================================================
-- 1) تطبيع المكرر الحالي: الأقدم يبقى، الباقي يُحذف
--    نستخدم row_number لا DISTINCT ON حتى يعمل على أي نسخة Postgres.
-- ============================================================================
DO $$
DECLARE
  removed int;
BEGIN
  WITH ranked AS (
    SELECT device_id,
           row_number() OVER (
             PARTITION BY lower(btrim(name))
             ORDER BY created_at ASC, device_id ASC
           ) AS rn
      FROM public.device_names
     WHERE btrim(name) <> ''
  ), dupes AS (
    SELECT device_id FROM ranked WHERE rn > 1
  ), del AS (
    DELETE FROM public.device_names d
     USING dupes
     WHERE d.device_id = dupes.device_id
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM del;

  -- أسماء فارغة/مسافات لا معنى لها
  DELETE FROM public.device_names WHERE btrim(name) = '';

  RAISE NOTICE 'device_names: حُذف % اسم مكرر', removed;
END $$;


-- ============================================================================
-- 2) قيد التفرّد على الاسم (غير حسّاس لحالة الأحرف)
--    lower(name) وليس name: «ابو محمد» و«ابو محمد» اسمان واحدان عملياً،
--    ولو سمحنا بهما لأعادنا المشكلة نفسها بحلقة.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS device_names_uniq_lower_name
  ON public.device_names (lower(btrim(name)))
  WHERE btrim(name) <> '';

-- الفهرس القديم غير الفريد أصبح بلا فائدة
DROP INDEX IF EXISTS public.device_names_name_idx;


-- ============================================================================
-- 3) set_device_name: ترفض الاسم المحجوز برسالة مفهومة
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_device_name(p_device_id text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid device');
  END IF;

  clean := btrim(regexp_replace(coalesce(p_name, ''), '[\u0000-\u001F\u007F]+', ' ', 'g'));
  clean := btrim(regexp_replace(clean, '\s{2,}', ' ', 'g'));

  -- حذف الاسم (ما زال مسموحاً — يحرّر الاسم للغير)
  IF clean = '' THEN
    DELETE FROM public.device_names WHERE device_id = p_device_id;
    RETURN jsonb_build_object('ok', true, 'name', NULL);
  END IF;

  IF char_length(clean) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too short');
  END IF;
  IF char_length(clean) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too long');
  END IF;
  IF clean ~ '(https?://|www\.|@)' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no links');
  END IF;

  -- الاسم محجوز لجهاز آخر => نرفض بوضوح
  IF EXISTS (
    SELECT 1 FROM public.device_names n
     WHERE lower(btrim(n.name)) = lower(clean)
       AND n.device_id <> p_device_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name taken');
  END IF;

  -- نقود سباق محتمل بين جهازين يطلبان الاسم نفسه في اللحظة نفسها:
  -- القيد الفريد هو الحَكَم، ونلتقطه ونحوّله لنفس الرسالة بدل خطأ 500.
  BEGIN
    INSERT INTO public.device_names(device_id, name, created_at, updated_at)
    VALUES (p_device_id, clean, now(), now())
    ON CONFLICT (device_id) DO UPDATE
      SET name = EXCLUDED.name, updated_at = now();
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name taken');
  END;

  RETURN jsonb_build_object('ok', true, 'name', clean);
END $$;

REVOKE EXECUTE ON FUNCTION public.set_device_name(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_device_name(text,text) TO anon, authenticated;
