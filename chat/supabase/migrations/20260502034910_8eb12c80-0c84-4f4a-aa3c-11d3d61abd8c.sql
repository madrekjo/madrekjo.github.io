-- Study Rounds
CREATE TABLE public.study_rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.study_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rounds viewable by everyone" ON public.study_rounds FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create rounds" ON public.study_rounds FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners or admins can update rounds" ON public.study_rounds FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins/mods can delete rounds" ON public.study_rounds FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- Round Participants
CREATE TABLE public.round_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.study_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, user_id)
);
ALTER TABLE public.round_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants viewable by everyone" ON public.round_participants FOR SELECT USING (true);
CREATE POLICY "Users can join rounds" ON public.round_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave rounds" ON public.round_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Schedules (image-only)
CREATE TABLE public.schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT,
  image_url TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Schedules viewable by everyone" ON public.schedules FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create schedules" ON public.schedules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners or admins can update schedules" ON public.schedules FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins/mods can delete schedules" ON public.schedules FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- Schedule comments
CREATE TABLE public.schedule_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.schedule_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Schedule comments viewable by everyone" ON public.schedule_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment on schedules" ON public.schedule_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners or admins can update schedule comments" ON public.schedule_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins/mods can delete schedule comments" ON public.schedule_comments FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- Staff chat (admin/moderator only)
CREATE TABLE public.staff_chat (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only staff can view staff chat" ON public.staff_chat FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Only staff can send to staff chat" ON public.staff_chat FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)) AND auth.uid() = user_id);
CREATE POLICY "Staff can update own staff messages" ON public.staff_chat FOR UPDATE TO authenticated USING (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));
CREATE POLICY "Staff can delete staff messages" ON public.staff_chat FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR (auth.uid() = user_id AND has_role(auth.uid(), 'moderator'::app_role)));

-- Storage buckets for schedules and staff images
INSERT INTO storage.buckets (id, name, public) VALUES ('schedules', 'schedules', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('staff-chat', 'staff-chat', false) ON CONFLICT DO NOTHING;

CREATE POLICY "Schedule images publicly viewable" ON storage.objects FOR SELECT USING (bucket_id = 'schedules');
CREATE POLICY "Authenticated can upload schedule images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'schedules' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owners/admins can delete schedule images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'schedules' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Staff can view staff-chat images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'staff-chat' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));
CREATE POLICY "Staff can upload staff-chat images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'staff-chat' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));
CREATE POLICY "Staff can delete staff-chat images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'staff-chat' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));