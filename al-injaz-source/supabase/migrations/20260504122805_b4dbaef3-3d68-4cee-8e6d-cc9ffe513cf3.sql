-- Create public bucket for support message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view (bucket is public)
CREATE POLICY "Support attachments are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'support-attachments');

-- Authenticated users can upload to their own folder
CREATE POLICY "Users can upload own support attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own attachments
CREATE POLICY "Users can delete own support attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Admins can manage all
CREATE POLICY "Admins can manage all support attachments"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'support-attachments' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'support-attachments' AND has_role(auth.uid(), 'admin'::app_role));