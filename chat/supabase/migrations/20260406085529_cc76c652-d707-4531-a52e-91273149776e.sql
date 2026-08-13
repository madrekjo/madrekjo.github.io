
CREATE POLICY "Users can update own replies"
ON public.suggestion_replies
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
