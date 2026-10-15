-- ============================================================================
-- «أنا مجهول» — الهوية بالإيميل بدل الجهاز (الأساس)
-- يُنفَّذ يدويًا في SQL Editor لمشروع: jmucsccdxxizvqtkyieq
--
-- الهدف:
--   [1] عمود author_email في جداول المحتوى (مفتاح الربط بالحساب الموحّد).
--   [2] إغلاق النشر المجهول: لا INSERT إلا لحساب مسجّل (authenticated).
--   [3] مُشغّل قبل الإدراج يختم author_email من jwt الجلسة تلقائيًا.
--
-- ملاحظة: الهوية الموحّدة تُكتب في نفس المشروع عبر /login/ (setSession)،
--         فالطلبات من التطبيق تحمل توكن المستخدم → auth.jwt() يعطي الإيميل.
-- (غير مدمّر: لا يحذف شيئًا. الحذف في ملف منفصل.)
-- ============================================================================

-- [1] أعمدة الربط
ALTER TABLE public.posts         ADD COLUMN IF NOT EXISTS author_email text;
ALTER TABLE public.comments      ADD COLUMN IF NOT EXISTS author_email text;
ALTER TABLE public.chat_posts    ADD COLUMN IF NOT EXISTS author_email text;
ALTER TABLE public.chat_comments ADD COLUMN IF NOT EXISTS author_email text;

CREATE INDEX IF NOT EXISTS idx_posts_author_email         ON public.posts(author_email);
CREATE INDEX IF NOT EXISTS idx_comments_author_email      ON public.comments(author_email);
CREATE INDEX IF NOT EXISTS idx_chat_posts_author_email    ON public.chat_posts(author_email);
CREATE INDEX IF NOT EXISTS idx_chat_comments_author_email ON public.chat_comments(author_email);

-- [2] سحب الإدراج من الزوار + إعادة تعريف السياسات لِـ authenticated فقط
REVOKE INSERT ON public.posts, public.comments, public.chat_posts, public.chat_comments,
                 public.post_likes, public.chat_likes FROM anon;

DROP POLICY IF EXISTS "non-blocked can insert" ON public.posts;
CREATE POLICY "authenticated can insert"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND length(content) > 0 AND length(content) <= 5000
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT public.device_is_blocked(posts.device_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "non-blocked can comment" ON public.comments;
CREATE POLICY "authenticated can comment"
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND length(content) > 0 AND length(content) <= 2000
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT public.device_is_blocked(comments.device_id)
    AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id AND p.allow_comments = true)
  );

DROP POLICY IF EXISTS "non-blocked can post chat" ON public.chat_posts;
CREATE POLICY "authenticated can post chat"
  ON public.chat_posts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND length(content) > 0 AND length(content) <= 5000
    AND length(display_name) BETWEEN 1 AND 40
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT public.device_is_blocked(chat_posts.device_id)
  );

DROP POLICY IF EXISTS "non-blocked non-muted can comment" ON public.chat_comments;
CREATE POLICY "authenticated can comment chat"
  ON public.chat_comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND length(content) > 0 AND length(content) <= 2000
    AND length(display_name) BETWEEN 1 AND 40
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT public.device_is_blocked(chat_comments.device_id)
    AND NOT EXISTS (SELECT 1 FROM public.chat_post_mutes m WHERE m.post_id = chat_comments.post_id AND m.device_id = chat_comments.device_id)
  );

DROP POLICY IF EXISTS "non-blocked can like" ON public.post_likes;
CREATE POLICY "authenticated can like"
  ON public.post_likes FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT public.device_is_blocked(post_likes.device_id)
  );

DROP POLICY IF EXISTS "non-blocked can like chat" ON public.chat_likes;
CREATE POLICY "authenticated can like chat"
  ON public.chat_likes FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND length(device_id) BETWEEN 8 AND 128
    AND NOT public.device_is_blocked(chat_likes.device_id)
  );

-- [3] ختم الإيميل من الجلسة
CREATE OR REPLACE FUNCTION public.stamp_author_email()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.author_email := COALESCE(auth.jwt() ->> 'email', NEW.author_email);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.stamp_author_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS posts_stamp_email ON public.posts;
CREATE TRIGGER posts_stamp_email         BEFORE INSERT ON public.posts         FOR EACH ROW EXECUTE FUNCTION public.stamp_author_email();
DROP TRIGGER IF EXISTS comments_stamp_email ON public.comments;
CREATE TRIGGER comments_stamp_email      BEFORE INSERT ON public.comments      FOR EACH ROW EXECUTE FUNCTION public.stamp_author_email();
DROP TRIGGER IF EXISTS chat_posts_stamp_email ON public.chat_posts;
CREATE TRIGGER chat_posts_stamp_email    BEFORE INSERT ON public.chat_posts    FOR EACH ROW EXECUTE FUNCTION public.stamp_author_email();
DROP TRIGGER IF EXISTS chat_comments_stamp_email ON public.chat_comments;
CREATE TRIGGER chat_comments_stamp_email BEFORE INSERT ON public.chat_comments FOR EACH ROW EXECUTE FUNCTION public.stamp_author_email();
