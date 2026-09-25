-- السماح أو منع التعليقات على مستوى المنشور
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS allow_comments boolean NOT NULL DEFAULT true;

-- منع إدراج تعليقات على منشور عُطّلت التعليقات عنه (RLS يشمل الأبناء)
DROP POLICY IF EXISTS "non-blocked can comment" ON public.comments;
CREATE POLICY "non-blocked can comment" ON public.comments FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(content) > 0 AND length(content) <= 2000
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = comments.device_id)
    AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id AND p.allow_comments = true)
  );

GRANT SELECT, INSERT ON public.comments TO anon, authenticated;
GRANT ALL ON public.comments TO service_role;