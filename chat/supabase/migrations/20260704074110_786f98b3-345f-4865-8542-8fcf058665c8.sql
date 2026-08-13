
-- 1) generation + field on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS generation text,
  ADD COLUMN IF NOT EXISTS field text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_generation_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_generation_check
  CHECK (generation IS NULL OR generation IN ('09','10'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_field_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_field_check
  CHECK (field IS NULL OR field IN ('medical','engineering','languages','business'));

-- 2) post_reports table
CREATE TABLE IF NOT EXISTS public.post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_reports TO authenticated;
GRANT ALL ON public.post_reports TO service_role;

ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users insert own reports" ON public.post_reports;
CREATE POLICY "users insert own reports" ON public.post_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "staff read all reports" ON public.post_reports;
CREATE POLICY "staff read all reports" ON public.post_reports
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'moderator'::app_role)
    OR auth.uid() = reporter_id
  );

DROP POLICY IF EXISTS "staff update reports" ON public.post_reports;
CREATE POLICY "staff update reports" ON public.post_reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role));

DROP POLICY IF EXISTS "admin delete reports" ON public.post_reports;
CREATE POLICY "admin delete reports" ON public.post_reports
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- 3) admin_delete_user function
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_email text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT email INTO target_email FROM auth.users WHERE id = _user_id;
  IF target_email = 'abdalrhmanmaaith24@gmail.com' THEN
    RAISE EXCEPTION 'cannot delete original administrator';
  END IF;

  -- Delete dependents
  DELETE FROM public.comment_likes WHERE user_id = _user_id
    OR comment_id IN (SELECT id FROM public.comments WHERE user_id = _user_id);
  DELETE FROM public.likes WHERE user_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.notifications WHERE user_id = _user_id OR actor_id = _user_id;
  DELETE FROM public.post_reports WHERE reporter_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.comments WHERE user_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.posts WHERE user_id = _user_id;

  DELETE FROM public.round_chat WHERE user_id = _user_id;
  DELETE FROM public.round_completions WHERE user_id = _user_id;
  DELETE FROM public.round_participants WHERE user_id = _user_id;
  DELETE FROM public.round_meeting_messages WHERE user_id = _user_id;
  DELETE FROM public.round_meeting_members WHERE user_id = _user_id;
  DELETE FROM public.round_meetings WHERE owner_id = _user_id;
  DELETE FROM public.study_rounds WHERE user_id = _user_id;

  DELETE FROM public.schedule_comments WHERE user_id = _user_id;
  DELETE FROM public.schedules WHERE user_id = _user_id;

  DELETE FROM public.suggestion_reply_likes WHERE user_id = _user_id;
  DELETE FROM public.suggestion_replies WHERE user_id = _user_id;
  DELETE FROM public.suggestion_likes WHERE user_id = _user_id;
  DELETE FROM public.suggestions WHERE user_id = _user_id;

  DELETE FROM public.support_messages WHERE user_id = _user_id;
  DELETE FROM public.staff_chat WHERE user_id = _user_id;
  DELETE FROM public.changes_messages WHERE user_id = _user_id;

  DELETE FROM public.user_warnings WHERE user_id = _user_id OR issued_by = _user_id;
  DELETE FROM public.user_devices WHERE user_id = _user_id;
  DELETE FROM public.admin_actions WHERE admin_id = _user_id OR target_user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE user_id = _user_id;

  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
