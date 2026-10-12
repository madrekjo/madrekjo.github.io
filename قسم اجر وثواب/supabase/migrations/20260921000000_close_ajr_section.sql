-- ============================================================================
-- إغلاق قسم «أجر وثواب» مؤقتًا — منع أي مساهمة جديدة نهائيًا
-- يُنفَّذ يدويًا في: https://supabase.com/dashboard/project/njdvogvquzofnqqwyvyl/sql
-- لإعادة الفتح لاحقًا: أعد تعريف الدالة بنسختها الأصلية (من
--   20260907000010_ajr_admin_system.sql الفقرة [6]).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_ajr_contribution(
  p_type text,
  p_content text,
  p_name text DEFAULT NULL,
  p_author_token text DEFAULT NULL
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT false, 'القسم مغلق مؤقتًا 🙏'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_ajr_contribution(text, text, text, text) TO anon, authenticated;
