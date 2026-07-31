CREATE POLICY "Anyone authenticated can view successful tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (completed = true AND is_success = true);

GRANT SELECT ON public.tasks TO authenticated;