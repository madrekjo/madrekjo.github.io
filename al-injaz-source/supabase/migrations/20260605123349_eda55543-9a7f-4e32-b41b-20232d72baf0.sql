
DROP POLICY IF EXISTS "Owners can read own support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owners or admins can delete support attachments" ON storage.objects;

CREATE POLICY "Owners can read own support attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role))
);

CREATE POLICY "Users can upload own support attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owners or admins can delete support attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role))
);
