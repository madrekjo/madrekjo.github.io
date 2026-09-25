-- تغيير رمز كسر الحظر السري في دالة bypass_ban_with_code
-- الرمز الجديد: aabbdd99

CREATE OR REPLACE FUNCTION public.bypass_ban_with_code(p_device_id text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  IF p_code IS NULL OR p_code <> 'aabbdd99' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  DELETE FROM public.blocked_devices WHERE device_id = p_device_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bypass_ban_with_code(text,text) TO anon, authenticated;