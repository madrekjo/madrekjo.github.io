
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
