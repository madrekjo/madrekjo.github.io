-- =========================================================================
-- إرفاق صورة/الغيف بالتعليقات (2026-10-06)
-- عمود واحد لرابط Cloudinary + السماح بتعليق "صورة فقط" بدون نص.
-- =========================================================================

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.comments ALTER COLUMN content DROP NOT NULL;

COMMENT ON COLUMN public.comments.image_url IS
  'رابط صورة/الغيف المرفقة بالتعليق (Cloudinary) — يُترك NULL إذا لا مرفق';

-- تحقّق: يتوقع content nullable + image_url موجود
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'comments'
  AND column_name IN ('content', 'image_url')
ORDER BY column_name;
