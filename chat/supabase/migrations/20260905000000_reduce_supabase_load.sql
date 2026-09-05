-- ============================================================================
-- Migration: تخفيف الحمل على القاعدة (Layer 3)
-- إضافة فهارس داعمة للاستعلامات الساخنة التي ظهرت في سجل الطلبات
-- (الفيد: comments لكل منشور، منشورات المستخدم، أوقات الجلسات الدراسية).
-- جميع العبارات آمنة للتكرار (IF NOT EXISTS) ولا تغيّر البنية.
-- ============================================================================

-- 1) تعليقات كل منشور: الفييد يقرأ comments WHERE post_id IN (...)
--    كان لا يوجد فهرس سوى على deleted_at.
CREATE INDEX IF NOT EXISTS idx_comments_post_id_created
  ON public.comments (post_id, created_at ASC);

-- 2) منشورات مستخدم واحد (صفحة المستخدم / تعديلات لوحة الإدارة)
CREATE INDEX IF NOT EXISTS idx_posts_user_id_created
  ON public.posts (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 3) الجلسات الدراسية: الاستعلام يفلتر بـ starts_at القريبة من الآن
CREATE INDEX IF NOT EXISTS idx_study_rounds_starts_at
  ON public.study_rounds (starts_at DESC);

-- 4) مرشّحات لوحة الإدارة على المنشورات في الحالة "قيد المراجعة"
--    (إن وُجد عمود status في نسختك — غير مؤذٍ في حال خلوه).
CREATE INDEX IF NOT EXISTS idx_posts_status_created
  ON public.posts (status, created_at DESC);