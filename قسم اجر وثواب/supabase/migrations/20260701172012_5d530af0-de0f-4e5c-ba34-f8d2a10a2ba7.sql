
CREATE TABLE public.post_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.post_replies TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.post_replies TO authenticated;
GRANT ALL ON public.post_replies TO service_role;

ALTER TABLE public.post_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view replies" ON public.post_replies
  FOR SELECT USING (true);

CREATE POLICY "Only admin can insert replies" ON public.post_replies
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can update replies" ON public.post_replies
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can delete replies" ON public.post_replies
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER update_post_replies_updated_at
  BEFORE UPDATE ON public.post_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_post_replies_post_id ON public.post_replies(post_id);
