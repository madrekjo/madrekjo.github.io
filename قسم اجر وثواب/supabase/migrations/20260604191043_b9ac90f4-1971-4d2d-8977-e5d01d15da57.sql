
CREATE TABLE public.recitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  caption text NOT NULL DEFAULT '',
  storage_path text NOT NULL,
  author_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.recitations TO anon, authenticated;
GRANT ALL ON public.recitations TO service_role;

ALTER TABLE public.recitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view recitations" ON public.recitations FOR SELECT USING (true);
CREATE POLICY "Anyone can insert recitations" ON public.recitations FOR INSERT WITH CHECK (true);
CREATE POLICY "Only admin can delete recitations" ON public.recitations FOR DELETE USING (is_admin());

-- Storage policies on ayah-recordings bucket (keep bucket private, use signed/public read via policy)
CREATE POLICY "Public read recitation files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ayah-recordings');

CREATE POLICY "Anyone can upload recitation files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ayah-recordings');

CREATE POLICY "Admin can delete recitation files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'ayah-recordings' AND is_admin());
