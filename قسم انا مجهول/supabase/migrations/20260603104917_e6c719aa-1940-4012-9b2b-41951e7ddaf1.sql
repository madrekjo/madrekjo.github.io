
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
