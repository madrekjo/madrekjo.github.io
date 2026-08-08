CREATE OR REPLACE FUNCTION public.get_user_email(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_email text;
BEGIN
  -- Only admins can see emails
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NULL;
  END IF;
  SELECT email INTO result_email FROM auth.users WHERE id = _user_id;
  RETURN result_email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO authenticated;