-- =========================================================
-- إصلاح عاجل: كتابة الزوار توقفت
-- السبب: migration 29000002 سحب SELECT على blocked_devices من anon،
--        لكن سياسات RLS نفسها تستعلم من blocked_devices داخل WITH CHECK،
--        والسياسة بتنفيذ بإذونات anon → permission denied → كل INSERT بيفشل.
-- الحل: دالة SECURITY DEFINER تفحص الحظر بصلاحيات المالك،
--        ونخلي السياسات تناديها بدل الاستعلام المباشر.
-- =========================================================

-- 1) دالة فحص الحظر (تعمل بصلاحيات المالك، الزائر ما بيقدر يقرأ الجدول)
CREATE OR REPLACE FUNCTION public.device_is_blocked(p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_devices
     WHERE device_id = p_device_id
       AND (expires_at IS NULL OR expires_at > now())
  )
$$;

REVOKE EXECUTE ON FUNCTION public.device_is_blocked(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.device_is_blocked(text) TO anon, authenticated;

-- 2) إعادة تعريف السياسات باستخدام الدالة
DROP POLICY IF EXISTS "non-blocked can insert" ON public.posts;
DROP POLICY IF EXISTS "non-blocked can post" ON public.posts;
CREATE POLICY "non-blocked can insert"
  ON public.posts FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(content) > 0 AND length(content) <= 5000
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT public.device_is_blocked(posts.device_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "non-blocked can comment" ON public.comments;
CREATE POLICY "non-blocked can comment" ON public.comments FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(content) > 0 AND length(content) <= 2000
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT public.device_is_blocked(comments.device_id)
    AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id AND p.allow_comments = true)
  );

DROP POLICY IF EXISTS "non-blocked can like" ON public.post_likes;
CREATE POLICY "non-blocked can like" ON public.post_likes
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(device_id) >= 8 AND length(device_id) <= 128
    AND NOT public.device_is_blocked(post_likes.device_id)
  );

DROP POLICY IF EXISTS "non-blocked can post chat" ON public.chat_posts;
CREATE POLICY "non-blocked can post chat" ON public.chat_posts FOR INSERT WITH CHECK (
  length(content) > 0 AND length(content) <= 5000
  AND length(display_name) BETWEEN 1 AND 40
  AND length(device_id) BETWEEN 8 AND 128
  AND NOT public.device_is_blocked(chat_posts.device_id)
);

DROP POLICY IF EXISTS "non-blocked non-muted can comment" ON public.chat_comments;
CREATE POLICY "non-blocked non-muted can comment" ON public.chat_comments FOR INSERT WITH CHECK (
  length(content) > 0 AND length(content) <= 2000
  AND length(display_name) BETWEEN 1 AND 40
  AND length(device_id) BETWEEN 8 AND 128
  AND NOT public.device_is_blocked(chat_comments.device_id)
  AND NOT EXISTS (SELECT 1 FROM public.chat_post_mutes m WHERE m.post_id = chat_comments.post_id AND m.device_id = chat_comments.device_id)
);

DROP POLICY IF EXISTS "non-blocked can like chat" ON public.chat_likes;
CREATE POLICY "non-blocked can like chat" ON public.chat_likes FOR INSERT WITH CHECK (
  length(device_id) BETWEEN 8 AND 128
  AND NOT public.device_is_blocked(chat_likes.device_id)
);
