DROP POLICY IF EXISTS "ayah_recordings_insert" ON storage.objects;
CREATE POLICY "ayah_recordings_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'ayah-recordings'
    AND name ~ '^[A-Za-z0-9_-]{8,128}/[0-9]+\.(webm|ogg|mpeg|mp4|wav)$'
    AND NOT EXISTS (
      SELECT 1 FROM public.banned_users b
      WHERE b.author_token = split_part(name, '/', 1)
    )
  );