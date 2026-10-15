-- ============================================================================
-- ★ دلو وسائط الدردشة: chat-media (بديل Cloudinary) ★
-- التاريخ: 2026-10-15
-- التنفيذ: Supabase Dashboard -> SQL Editor -> New Query -> Run
--
-- الغرض:
--   حفظ صور/فيديو الدردشة (الرسائل، المنشورات، البروفايل، الجداول، الجولات،
--   اجتماعات الجولات، تواصل المالك، الدعم) داخل قاعدة الدردشة نفسها بدل
--   الحساب الخارجي Cloudinary.
--
-- الدلو عام للقراءة (public) لأن الكود يعرض الروابط مباشرة في <img src>،
-- ولا نضيف سياسة SELECT كي لا يظهر تحذير السرد (public_bucket_allows_listing)
-- — الروابط العامة تعمل بلا سياسة قراءة أصلاً.
--
-- بنية المسار: <auth.uid()>/<timestamp>-<random>.<ext>
--   لذلك كل سياسة كتابة تقيّد المستخدم بمجلده (storage.foldername(name))[1].
--
-- آمن لإعادة التشغيل (ON CONFLICT / DROP POLICY IF EXISTS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) إنشاء الدلو (عام للقراءة) — حد 50 ميغابايت للملف (حد الخطة المجانية)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-media', 'chat-media', true, 52428800)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit;

-- ---------------------------------------------------------------------------
-- (2) سياسات الكتابة — المسجّل يرفع/يعدّل/يحذف داخل مجلده فقط
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "chat media authenticated upload" ON storage.objects;
CREATE POLICY "chat media authenticated upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "chat media owner update" ON storage.objects;
CREATE POLICY "chat media owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "chat media owner delete" ON storage.objects;
CREATE POLICY "chat media owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- التراجع (إن احتجت):
--   DROP POLICY IF EXISTS "chat media owner delete" ON storage.objects;
--   DROP POLICY IF EXISTS "chat media owner update" ON storage.objects;
--   DROP POLICY IF EXISTS "chat media authenticated upload" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'chat-media';
-- (حذف الدلو يمسح كل ملفاته — احذر.)
-- ============================================================================
