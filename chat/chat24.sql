-- chat24.sql — Support images
-- اضافة دعم ارسال الصور في رسائل الدعم

-- 1) عمود الصور في رسائل الدعم
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS image_urls text[];

-- 2) انشاء باكت (bucket) لتخزين صور الدعم اذا ما موجود
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-media', 'support-media', true)
ON CONFLICT (id) DO NOTHING;

-- 3) سياسات الوصول للملفات داخل الباكت (نفس نمط post-media)
DROP POLICY IF EXISTS "Support media is publicly accessible" ON storage.objects;
CREATE POLICY "Support media is publicly accessible"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'support-media');

DROP POLICY IF EXISTS "Users can upload support media" ON storage.objects;
CREATE POLICY "Users can upload support media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'support-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete their support media" ON storage.objects;
CREATE POLICY "Users can delete their support media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'support-media' AND auth.uid()::text = (storage.foldername(name))[1]);