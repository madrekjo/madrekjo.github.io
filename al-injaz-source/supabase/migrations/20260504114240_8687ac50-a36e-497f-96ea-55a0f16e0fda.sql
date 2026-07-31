DROP POLICY IF EXISTS "Admins can insert messages" ON public.messages;

CREATE POLICY "Users and admins can insert messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  -- Admin can message anyone
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- User can message an admin (support requests)
  (auth.uid() = sender_id AND has_role(receiver_id, 'admin'::app_role))
  OR
  -- User can reply to admin who already messaged them
  (auth.uid() = sender_id AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.sender_id = messages.receiver_id
      AND m.receiver_id = auth.uid()
  ))
);