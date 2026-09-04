-- ============================================================================
-- Migration: تكوين madrekjo@gmail.com كـ بوت ادمن في أنا مجهول
-- ============================================================================
-- الغرض: لما تدخل ادمن في الموقع، يبان اسمك "Bot" وملصق الجهاز "bot"
--
-- ملاحظة مهمة: جدول admin_devices في هذا المشروع ما لهش رابط بـ auth.users.id.
-- لازم تدخل الجهاز ID بتاعك بعد ما تدخل مرة واحدة للموقع عشان ي تسجل الجهاز.
-- تقدر تاخذ الجهاز ID من localStorage (مفتاح "anon_device_id") ومن الأدمن بانل.
--
-- بعد ما تدخل مرة واحدة، شغل الأمر ده في SQL Editor:
--   SELECT public.set_device_bot_label('YOUR_DEVICE_ID_HERE');
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_device_bot_label(p_device_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_device_exists boolean;
BEGIN
  -- تتأكد الجهاز مسجل في admin_devices
  SELECT EXISTS(SELECT 1 FROM public.admin_devices WHERE device_id = p_device_id) INTO v_device_exists;
  IF NOT v_device_exists THEN
    RAISE EXCEPTION 'الجهاز % مش مسجل في admin_devices. ادخل الموقع مرة اولى اول.';
  END IF;

  -- حط display_name = 'Bot' في admin_devices
  INSERT INTO public.admin_devices (device_id, display_name, note)
  VALUES (p_device_id, 'Bot 🤖', 'bot admin')
  ON CONFLICT (device_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    note = EXCLUDED.note;

  -- حط ملصق 'bot' في device_notes
  INSERT INTO public.device_notes (device_id, label, updated_by)
  VALUES (p_device_id, 'bot', auth.uid())
  ON CONFLICT (device_id) DO UPDATE SET
    label = EXCLUDED.label,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN 'تم تعيين Bot 🤖 كـ display_name و bot كـ label للجهاز ' || p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_device_bot_label(text) TO authenticated;

-- ============================================================================
-- شغّل الأمر ده بعد ما تدخل مرة واحدة للموقع:
--   SELECT public.set_device_bot_label('جهز_ك_هنا');
-- ============================================================================
