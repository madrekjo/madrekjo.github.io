-- Table for ayah voice recordings
CREATE TABLE public.ayah_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  surah_number INTEGER NOT NULL,
  ayah_number INTEGER NOT NULL,
  reciter_name TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  author_token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ayah_recordings_lookup ON public.ayah_recordings (surah_number, ayah_number, created_at DESC);

ALTER TABLE public.ayah_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view recordings"
  ON public.ayah_recordings FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert recordings"
  ON public.ayah_recordings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can delete recordings"
  ON public.ayah_recordings FOR DELETE
  USING (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ayah-recordings', 'ayah-recordings', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read ayah recordings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ayah-recordings');

CREATE POLICY "Public upload ayah recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ayah-recordings');

CREATE POLICY "Public delete ayah recordings"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'ayah-recordings');