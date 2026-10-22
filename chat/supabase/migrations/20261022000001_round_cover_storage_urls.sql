-- ============================================================================
-- ★ صورة غلاف الجولة: السماح بروابط تخزين المنصة (chat-media) ★
-- التاريخ: 2026-10-22
-- التنفيذ: Supabase Dashboard -> SQL Editor -> New Query -> Run
--
-- السبب:
--   بعد نقل الوسائط من Cloudinary إلى Supabase Storage (دلو chat-media)، بقي
--   trigger enforce_round_cover_image يرفض أي رابط غير Cloudinary، فتفشل
--   إنشاء/تعديل الجولة عند اختيار صورة برسالة invalid_cover_image_url
--   (تظهر للمستخدم كـ «فشل إنشاء الجولة»).
--
--   نسمح الآن بروابط دلو chat-media العامة، ونُبقي Cloudinary مسموحاً حتى
--   لا تتعطّل الجولات القديمة عند تعديلها.
--
-- آمن لإعادة التشغيل.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_round_cover_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cover_image_url IS NOT NULL
     AND NEW.cover_image_url <> ''
     AND NEW.cover_image_url !~ '^https://romocwtqzdnovfgtmwzb\.supabase\.co/storage/v1/object/public/chat-media/'
     AND NEW.cover_image_url !~ '^https://res\.cloudinary\.com/iahnnsgu/'
  THEN
    RAISE EXCEPTION 'invalid_cover_image_url'
      USING HINT = 'الصورة يجب أن تكون من تخزين المنصة';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_round_cover_image ON public.study_rounds;
CREATE TRIGGER trg_round_cover_image
  BEFORE INSERT OR UPDATE ON public.study_rounds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_round_cover_image();
