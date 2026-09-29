-- ============================================================================
-- 20260929000005_wheel_reset.sql
--
-- دالة إدارية: إعادة ضبط عجلة الحظ لمستخدم واحد، أو للجميع.
-- ليش؟ العجلة "مرة واحدة بحيات الحساب"، فالمستخدم/الأدمن اللي جرّبها
-- ما عاد يشوفها — بدون هالدالة ما في طريقة للتجربة مرتين.
--
-- مين يقدر يناديها:
--   • SQL Editor (postgres)  ← مسموح (auth.uid() فارغ هناك)
--   • أدمن/owner من داخل التطبيق عبر PostgREST
--   أي حساب ثاني ⇒ خطأ.
--
-- ملاحظة عن السجل: النقاط الممنوحة سابقاً ما بتنترجع (سجل المعاملات
-- point_transactions يضل كما هو — سجل تدقيق محاسبي). الملف بيحذف "حق السحب"
-- فقط، والسحب التالي يوزّع جائزة جديدة ويسجّل حركة جديدة.
--
-- آمن إعادة التشغيل (idempotent).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_wheel(p_user_id uuid DEFAULT NULL)
RETURNS TABLE(reset_count integer, note text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_n integer := 0;
  v_is_staff boolean := false;
BEGIN
  -- 1) التفويض: إما SQL Editor (postgres)، أو أدمن/owner داخل التطبيق
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    v_is_staff := COALESCE(
      public.has_role(auth.uid(), 'admin'::app_role), false)
      OR COALESCE(public.has_role(auth.uid(), 'owner'::app_role), false);
    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'غير مصرّح: الأدمن فقط' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2) التنفيذ
  IF p_user_id IS NULL THEN
    DELETE FROM public.wheel_prizes;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN QUERY SELECT v_n,
      format('أُعيد ضبط العجلة لـ %s مستخدم (الجميع)', v_n)::TEXT;
  ELSE
    DELETE FROM public.wheel_prizes WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RETURN QUERY SELECT 0,
        format('لا يوجد سجل سحب للمستخدم %s (ما جرّب العجلة أصلاً)', p_user_id)::TEXT;
    ELSE
      RETURN QUERY SELECT v_n,
        format('أُعيد ضبط العجلة للمستخدم %s — يقدر يدور تاني', p_user_id)::TEXT;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_wheel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_wheel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_wheel(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- طريقة الاستخدام (SQL Editor):
--
--   -- 1) كل السجلات (معاينة قبل):
--   SELECT u.email, w.prize_points, w.claimed_at
--   FROM wheel_prizes w JOIN auth.users u ON u.id = w.user_id
--   ORDER BY w.claimed_at DESC;
--
--   -- 2) إعادة ضبط مستخدم واحد (انسخ user_id من الكود أعلى):
--   SELECT public.admin_reset_wheel('00000000-0000-0000-0000-000000000000');
--
--   -- 3) إعادة ضبط الجميع (ينظّف السجلات ⇒ كل الحسابات تقدر تدور):
--   SELECT public.admin_reset_wheel();
--
--   -- 4) رصيدك أنت بعد ما تدور (للتأكد من وصول النقاط):
--   SELECT * FROM user_points WHERE user_id = 'your-uuid';
-- ---------------------------------------------------------------------------
