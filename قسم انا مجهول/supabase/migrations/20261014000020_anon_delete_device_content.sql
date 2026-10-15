-- ============================================================================
-- ⚠️ إجراء مدمّر — «أنا مجهول»: حذف المحتوى غير المرتبط بحساب إيميل
-- يُنفَّذ يدويًا في SQL Editor لمشروع: jmucsccdxxizvqtkyieq
--
-- بعد إضافة author_email (ملف الهوية)، كل الصفوف القديمة author_email = NULL،
-- لذا هذا الملف يحذفها كلها (لا رجعة). خُذ نسخة احتياطية قبل التنفيذ إن أردت.
--
-- نفّذ ملف الهوية أولاً (20261014000010_anon_email_identity.sql).
-- ============================================================================

BEGIN;

-- الأطفال أولاً
DELETE FROM public.comments      WHERE author_email IS NULL;
DELETE FROM public.chat_comments WHERE author_email IS NULL;

DELETE FROM public.posts         WHERE author_email IS NULL;
DELETE FROM public.chat_posts    WHERE author_email IS NULL;

-- الإعجابات لا تحمل عمود إيميل (هوية جهاز بحت) — تُحذف بالكامل إن أردت:
-- DELETE FROM public.post_likes WHERE true;
-- DELETE FROM public.chat_likes WHERE true;

COMMIT;
