
-- Allow admins/moderators to delete support messages
CREATE POLICY "Admins can delete support messages"
ON public.support_messages
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));
