
CREATE OR REPLACE FUNCTION public.posts_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.anon_number := floor(random() * 9999 + 1)::int;
  IF NEW.user_id IS NOT NULL AND public.has_role(NEW.user_id, 'admin') THEN
    NEW.status := 'approved';
  ELSIF EXISTS (SELECT 1 FROM public.admin_devices WHERE device_id = NEW.device_id) THEN
    NEW.status := 'approved';
    NEW.pinned := false;
    NEW.user_id := NULL;
  ELSE
    NEW.status := 'pending';
    NEW.author_name := NULL;
    NEW.user_id := NULL;
    NEW.pinned := false;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.comments_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.anon_number := floor(random() * 9999 + 1)::int;
  RETURN NEW;
END $function$;
