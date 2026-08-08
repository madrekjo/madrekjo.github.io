
-- round_creators: restrict SELECT
DROP POLICY IF EXISTS "Authenticated can view round creators" ON public.round_creators;

CREATE POLICY "Admins can view all round creators"
  ON public.round_creators FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own round-creator row"
  ON public.round_creators FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- tasks: drop broad SELECT policy exposing all successful tasks
DROP POLICY IF EXISTS "Anyone authenticated can view successful tasks" ON public.tasks;

-- Safe leaderboard function: aggregates without exposing titles
CREATE OR REPLACE FUNCTION public.get_public_successful_tasks()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  category task_category,
  duration integer,
  daily_unit text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.user_id, t.category, t.duration, t.daily_unit, t.created_at, t.updated_at
  FROM public.tasks t
  WHERE t.completed = true
    AND t.is_success = true
    AND auth.uid() IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_successful_tasks() TO authenticated;

-- Safe per-user analytics function: no title/details
CREATE OR REPLACE FUNCTION public.get_user_successful_tasks(_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  category task_category,
  duration integer,
  daily_unit text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.user_id, t.category, t.duration, t.daily_unit, t.created_at, t.updated_at
  FROM public.tasks t
  WHERE t.user_id = _user_id
    AND t.completed = true
    AND t.is_success = true
    AND auth.uid() IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_successful_tasks(uuid) TO authenticated;
