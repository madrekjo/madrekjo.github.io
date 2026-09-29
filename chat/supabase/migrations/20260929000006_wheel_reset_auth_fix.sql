-- ============================================================================
-- 20260929000006_wheel_reset_auth_fix.sql
-- إصلاح أمني + إصلاح الحذف الجماعي في admin_reset_wheel
--
-- ثغرتان:
--  (1) التفويض كان معطّل بالكامل:
--      داخل SECURITY DEFINER الـ current_user يصير مالك الدالة (postgres)
--      وليس النCaller ⇒ فحص "current_user IN ('postgres'...)" كان يمرّ دائماً،
--      ومعه شرط has_role لم يُختبر. النتيجة: أي مستخدم — بل甚至 مفتاح anon —
--      يقدر يمسح سجلات العجلة لأي حد.
--      ⇒ الفحص الصحيح: auth.uid() (يقرأ الـ JWT، ولا يتأثر بـ SECURITY DEFINER)
--        + التمييز بين SQL Editor (بلا طلب HTTP) و PostgREST.
--
--  (2) المسار "إعادة ضبط الجميع" كان يفشل:
--      DELETE FROM wheel_prizes;  (بلا WHERE) ⇒
--      {"code":"21000","message":"DELETE requires a WHERE clause"}
--      ⇒ WHERE true يحقق نفس النتيجة ويعدّي الحارس.
--
-- القاعدة: لا تُمنح صلاحية "postgres" لأي مستخدم؛ الفحص دائماً على UID
--          ما جاي من التوكن.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_wheel(p_user_id uuid DEFAULT NULL)
RETURNS TABLE(reset_count integer, note text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_n integer := 0;
  v_uid uuid := auth.uid();
  v_via_http boolean;
  v_is_staff boolean;
BEGIN
  -- هل الطلب جاي من HTTP (المتصفح/PostgREST) ولا من SQL Editor؟
  v_via_http := COALESCE(current_setting('request.headers', true), '') <> '';

  IF v_via_http THEN
    -- من التطبيق: الأدمن/المالك فقط (.uid من التوكن — لا يُspoof)
    v_is_staff := COALESCE(public.has_role(v_uid, 'admin'::app_role), false)
               OR COALESCE(public.has_role(v_uid, 'owner'::app_role), false);
    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'غير مصرّح: الأدمن أو المالك فقط'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  -- من SQL Editor (بلا طلب HTTP) ⇒ مسموح: صاحب القاعدة يديرها يدوياً.

  IF p_user_id IS NULL THEN
    DELETE FROM public.wheel_prizes WHERE true;     -- WHERE true: يمرّ من حارس Supabase
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN QUERY SELECT v_n,
      format('أُعيد ضبط العجلة لـ %s سجل (الجميع)', v_n)::TEXT;
  ELSE
    DELETE FROM public.wheel_prizes WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RETURN QUERY SELECT 0,
        format('ما في سجل سحب للمستخدم %s (ما جرّب العجلة أصلاً)', p_user_id)::TEXT;
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

-- فحص سريع بعد التشغيل:
--   ① SELECT public.admin_reset_wheel();               -- من SQL Editor: يُرجع عدد السجلات
--   ② SELECT public.admin_reset_wheel('some-uuid');    -- لمستخدم واحد
--   ③ من المتصفح بحساب عادي ⇒ لازم يرمي: غير مصرّح
