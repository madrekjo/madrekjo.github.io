
-- Allow deleting messages: sender deletes own; admin deletes any
CREATE POLICY "Users can delete own sent messages"
ON public.messages FOR DELETE
TO authenticated
USING (auth.uid() = sender_id);

CREATE POLICY "Admins can delete any messages"
ON public.messages FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Function returning all admin ids (for broadcasting support messages)
CREATE OR REPLACE FUNCTION public.get_support_admin_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.user_roles WHERE role = 'admin'
$$;
