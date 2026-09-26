-- ============================================================================
-- SUPABASE SQL EDITOR — شغّل هذا الملف يدوياً
-- المشروع الحي: chat (hvrtzzouasqseyswjcex)
-- الرابط: https://supabase.com/dashboard/project/hvrtzzouasqseyswjcex/sql-editor
-- ============================================================================
-- تفعيل إدارة الرتب "owner" من واجهة الرتب (RolesDialog) — للمالك وحده:
--   * يستطيع أي مالك إضافة مالكين جدد (كان يعمل أصلاً).
--   * يستطيع المالك إزالة رتبة المالك عن أي حساب آخر.
--   * حساب الجراح (ب5177f22...) محمي دائماً — لا تُحذف رتبته ولا يُغيّرها أحد
--     (لا هو نفسه، ولا أي مالك، ولا SQL).
-- يعتمد على ملف الحصانة (20260926000003) — يجب أن يكون مشغّلاً قبله.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_owner_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- إدراج رتبة مالك: المالك فقط
  IF TG_OP = 'INSERT' AND NEW.role = 'owner'::app_role
     AND NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'فقط المالك يمكنه منح رتبة المالك';
  END IF;

  -- حذف رتبة مالك:
  IF TG_OP = 'DELETE' AND OLD.role = 'owner'::app_role THEN
    -- (1) الجراح محمي دستورياً — لا حذف أبداً
    IF OLD.user_id = 'b5177f22-2240-494e-b84d-d2b44dac84b7' THEN
      RAISE EXCEPTION 'لا يمكن إزالة رتبة المالك الجراح';
    END IF;
    -- (2) إزالة مالك آخر: مالك فقط (من جلسة حقيقية، لا من SQL)
    IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
      RAISE EXCEPTION 'فقط المالك يمكنه إزالة رتبة المالك';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

-- ملاحظة: trigger trg_protect_owner_roles مربوط بهذه الدالة مسبقاً
-- (CREATE OR REPLACE FUNCTION أحدّثها دون إعادة إنشاء أي trigger).

-- تأكيد: وظيفة الحماية المحدّثة
SELECT proname FROM pg_proc
WHERE proname = 'protect_owner_roles' AND pronamespace = 'public'::regnamespace;
SELECT u.email, ur.role FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'owner'::public.app_role
ORDER BY u.email;