
-- Rounds feature: tables, RLS, grants, and storage policies

-- 1) round_creators: who is allowed to create rounds (beyond admins)
CREATE TABLE public.round_creators (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.round_creators TO authenticated;
GRANT ALL ON public.round_creators TO service_role;
ALTER TABLE public.round_creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view round creators"
  ON public.round_creators FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage round creators"
  ON public.round_creators FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) rounds
CREATE TABLE public.rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_path text,
  total_minutes integer NOT NULL CHECK (total_minutes BETWEEN 1 AND 300),
  work_minutes integer NOT NULL CHECK (work_minutes >= 1),
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  credited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rounds TO authenticated;
GRANT ALL ON public.rounds TO service_role;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view rounds"
  ON public.rounds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can create rounds"
  ON public.rounds FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = creator_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.round_creators rc WHERE rc.user_id = auth.uid())
    )
  );
CREATE POLICY "Creator or admin can update rounds"
  ON public.rounds FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = creator_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Creator or admin can delete rounds"
  ON public.rounds FOR DELETE TO authenticated
  USING (auth.uid() = creator_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_rounds_updated_at
  BEFORE UPDATE ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) round_participants
CREATE TABLE public.round_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.round_participants TO authenticated;
GRANT ALL ON public.round_participants TO service_role;
ALTER TABLE public.round_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view participants"
  ON public.round_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join as themselves"
  ON public.round_participants FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users leave themselves or admins remove"
  ON public.round_participants FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 4) Storage policies for round-images bucket (private)
CREATE POLICY "round-images authenticated read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'round-images');
CREATE POLICY "round-images user upload own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'round-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "round-images user delete own folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'round-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
