
-- 1) Profiles: track last display_name change
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name_updated_at timestamptz;

-- 2) Trigger: enforce one name change per 30 days for non-admins; admins bypass
CREATE OR REPLACE FUNCTION public.enforce_display_name_change_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  is_admin_caller boolean := false;
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    IF caller IS NOT NULL THEN
      is_admin_caller := public.has_role(caller, 'admin');
    END IF;

    IF NOT is_admin_caller THEN
      IF OLD.display_name_updated_at IS NOT NULL
         AND OLD.display_name_updated_at > (now() - interval '30 days') THEN
        RAISE EXCEPTION 'display_name_change_too_soon'
          USING HINT = 'You can change your name once every 30 days';
      END IF;
    END IF;

    NEW.display_name_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_display_name_change ON public.profiles;
CREATE TRIGGER trg_enforce_display_name_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_display_name_change_limit();

-- 3) Allow admins to update ANY profile
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) Tasks: heartbeat for stopwatch offline detection
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
