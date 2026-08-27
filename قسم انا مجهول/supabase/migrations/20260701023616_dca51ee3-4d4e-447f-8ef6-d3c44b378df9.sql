
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS author_avatar_url text;

CREATE OR REPLACE FUNCTION public.comments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
BEGIN
  NEW.anon_number := floor(random() * 9999 + 1)::int;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    NEW.is_admin := true;
    SELECT display_name, avatar_url INTO a
      FROM public.admin_devices WHERE device_id = NEW.device_id LIMIT 1;
    IF a IS NOT NULL THEN
      NEW.author_name := a.display_name;
      NEW.author_avatar_url := a.avatar_url;
    END IF;
  ELSE
    NEW.is_admin := false;
    NEW.author_name := NULL;
    NEW.author_avatar_url := NULL;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.comments_before_insert() FROM PUBLIC, anon, authenticated;
