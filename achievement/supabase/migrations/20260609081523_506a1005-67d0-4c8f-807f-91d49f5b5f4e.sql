
-- Remove user from ACTIVE rounds only (called on tab close / page hide)
CREATE OR REPLACE FUNCTION public.leave_active_rounds()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.round_participants p
  USING public.rounds r
  WHERE p.user_id = auth.uid()
    AND p.round_id = r.id
    AND r.status = 'active'
    AND r.ends_at > now();
$$;

REVOKE EXECUTE ON FUNCTION public.leave_active_rounds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_active_rounds() TO authenticated;

-- Returns (user_id, completed_rounds) for users who participated in finished rounds.
CREATE OR REPLACE FUNCTION public.get_completed_round_counts()
RETURNS TABLE(user_id uuid, completed_rounds bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, COUNT(*) AS completed_rounds
  FROM public.round_participants p
  JOIN public.rounds r ON r.id = p.round_id
  WHERE r.status = 'ended'
  GROUP BY p.user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_completed_round_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_completed_round_counts() TO authenticated;
