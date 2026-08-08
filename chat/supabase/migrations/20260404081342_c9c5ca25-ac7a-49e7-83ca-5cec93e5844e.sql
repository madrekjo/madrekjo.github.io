
-- Add is_pinned to suggestions
ALTER TABLE public.suggestions ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;

-- Allow admins to update suggestions (for pinning)
CREATE POLICY "Admins can update suggestions"
ON public.suggestions FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create suggestion_likes table
CREATE TABLE public.suggestion_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES public.suggestions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(suggestion_id, user_id)
);

ALTER TABLE public.suggestion_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Suggestion likes viewable by everyone"
ON public.suggestion_likes FOR SELECT TO public
USING (true);

CREATE POLICY "Authenticated users can like suggestions"
ON public.suggestion_likes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike suggestions"
ON public.suggestion_likes FOR DELETE TO authenticated
USING (auth.uid() = user_id);
