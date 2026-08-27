
DROP POLICY IF EXISTS "ayah_recordings_select_admin" ON storage.objects;

-- Allow read so the client can mint signed URLs; raw public access still requires the signed token
CREATE POLICY "ayah_recordings_select"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'ayah-recordings');
