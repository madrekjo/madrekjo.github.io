-- ============================================================================
-- SUPABASE SQL EDITOR — شغّل هذا الملف يدوياً
-- المشروع: chat (biabdoatwfteqwgjdxzc)
-- الرابط: https://supabase.com/dashboard/project/biabdoatwfteqwgjdxzc/sql-editor
-- ============================================================================
-- الغرض: السماح للمالك (owner) وكل صاحب صلاحية can_warn بإرسال التحذيرات.
-- السبب: البوليسي القديم كان يقبل رتبة admin فقط، والمالك رتبته owner.
-- ============================================================================

DROP POLICY IF EXISTS "Admin can insert warnings" ON public.user_warnings;
CREATE POLICY "Staff can insert warnings" ON public.user_warnings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'can_warn'));

-- تأكيد
SELECT policyname
FROM pg_policies
WHERE tablename = 'user_warnings'
ORDER BY policyname;