-- ============================================================================
-- ★ إصلاح اللايك على الاقتراحات (suggestion_likes / suggestion_reply_likes) ★
-- شغّلها من: Supabase → SQL Editor → New Query → Paste → Run
-- يعيد إنشاء كامل سياسات RLS الخاصة باللايكات بشكل Idempotent،
-- بحيث يتمكن المستخدمون المسجّلون من الإعجاب/إلغاء الإعجاب على الاقتراحات
-- وردود الإدارة مهما كانت حالة السياسات الحالية في القاعدة.
-- ============================================================================

-- ضمان تفعيل RLS على الجدولين
ALTER TABLE public.suggestion_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestion_reply_likes ENABLE ROW LEVEL SECURITY;

-- ===== suggestion_likes =====
DROP POLICY IF EXISTS "Suggestion likes viewable by everyone" ON public.suggestion_likes;
CREATE POLICY "Suggestion likes viewable by everyone"
ON public.suggestion_likes FOR SELECT TO public
USING (true);

DROP POLICY IF EXISTS "Authenticated users can like suggestions" ON public.suggestion_likes;
CREATE POLICY "Authenticated users can like suggestions"
ON public.suggestion_likes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike suggestions" ON public.suggestion_likes;
CREATE POLICY "Users can unlike suggestions"
ON public.suggestion_likes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ===== suggestion_reply_likes =====
DROP POLICY IF EXISTS "Reply likes viewable by everyone" ON public.suggestion_reply_likes;
CREATE POLICY "Reply likes viewable by everyone"
ON public.suggestion_reply_likes FOR SELECT TO public
USING (true);

DROP POLICY IF EXISTS "Authenticated users can like replies" ON public.suggestion_reply_likes;
CREATE POLICY "Authenticated users can like replies"
ON public.suggestion_reply_likes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike replies" ON public.suggestion_reply_likes;
CREATE POLICY "Users can unlike replies"
ON public.suggestion_reply_likes FOR DELETE TO authenticated
USING (auth.uid() = user_id);