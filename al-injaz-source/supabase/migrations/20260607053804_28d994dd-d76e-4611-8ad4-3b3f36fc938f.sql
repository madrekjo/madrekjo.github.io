
-- 1) Restrict messages UPDATE to is_read column only
REVOKE UPDATE ON public.messages FROM authenticated;
GRANT UPDATE (is_read) ON public.messages TO authenticated;

-- 2) Add UPDATE policy on round-images storage scoped to owner folder
CREATE POLICY "round-images user update own folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'round-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'round-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
