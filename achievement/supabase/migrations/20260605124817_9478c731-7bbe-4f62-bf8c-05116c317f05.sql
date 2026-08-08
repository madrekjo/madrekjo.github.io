
-- Replace the broad UPDATE policy with one that uses column-level GRANTs.
-- First, remove blanket UPDATE privilege from authenticated, then grant only the is_read column.
REVOKE UPDATE ON public.messages FROM authenticated;
GRANT UPDATE (is_read) ON public.messages TO authenticated;
GRANT UPDATE ON public.messages TO service_role;

-- Recreate the policy with a tighter WITH CHECK that enforces immutability of other fields.
DROP POLICY IF EXISTS "Users can mark messages as read" ON public.messages;
CREATE POLICY "Receivers can mark messages as read"
ON public.messages FOR UPDATE
TO authenticated
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);
