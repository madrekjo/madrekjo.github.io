-- ============================================================================
-- chat23.sql — صور متعددة + تنظيف المحذوفات بعد 3 أيام
-- ============================================================================
-- شغّل هذا الملف من Supabase SQL Editor

-- 1. عمود الصور المتعددة
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_urls text[];

-- 2. تنظيف المحذوفات: بدل يوم واحد يصير 3 أيام
CREATE OR REPLACE FUNCTION public.delete_old_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- إزالة المنشورات/التعليقات القديمة
  DELETE FROM public.notifications WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.likes WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comments WHERE created_at < now() - INTERVAL '24 hours';
  DELETE FROM public.posts WHERE created_at < now() - INTERVAL '24 hours';

  -- المحذوفات: إزالة أي شيء محذوف لأكثر من 3 أيام
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days');
  DELETE FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days';
  DELETE FROM public.notifications WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days');
  DELETE FROM public.likes WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days');
  DELETE FROM public.comments WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days');
  DELETE FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '3 days';
END;
$function$;