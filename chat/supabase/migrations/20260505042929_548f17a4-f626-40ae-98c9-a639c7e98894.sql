-- Add mute option for round alarm
ALTER TABLE public.study_rounds
ADD COLUMN IF NOT EXISTS alarm_muted boolean NOT NULL DEFAULT false;

-- Create changes_messages table (شو المنصة غيرت فيك / تحفيز)
CREATE TABLE IF NOT EXISTS public.changes_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('change','motivation')),
  content text NOT NULL,
  image_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.changes_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Changes viewable by everyone"
ON public.changes_messages FOR SELECT
USING (true);

CREATE POLICY "Authenticated can post changes"
ON public.changes_messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner or admin/mod can delete changes"
ON public.changes_messages FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));

CREATE INDEX IF NOT EXISTS idx_changes_messages_category_created ON public.changes_messages(category, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.changes_messages;