
-- 1) Admin actions log
CREATE TABLE public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  target_user_id uuid,
  action_type text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_actions TO authenticated;
GRANT ALL ON public.admin_actions TO service_role;
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view admin actions" ON public.admin_actions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Staff can insert admin actions" ON public.admin_actions
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid() AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)));
CREATE INDEX idx_admin_actions_created ON public.admin_actions(created_at DESC);

-- 2) Prevent users from updating their own ban/timeout columns on profiles
CREATE OR REPLACE FUNCTION public.guard_profile_moderation_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = NEW.user_id
     AND NOT public.has_role(auth.uid(),'admin'::app_role)
     AND NOT public.has_role(auth.uid(),'moderator'::app_role) THEN
    NEW.is_banned    := OLD.is_banned;
    NEW.chat_banned  := OLD.chat_banned;
    NEW.timeout_until := OLD.timeout_until;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profile_guard_mod ON public.profiles;
CREATE TRIGGER trg_profile_guard_mod
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_moderation_columns();

-- 3) Tighten notifications INSERT: actor must own the underlying post/comment OR target is owner of referenced row
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
CREATE POLICY "Valid notifications only" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = actor_id
    AND user_id <> actor_id
    AND (
      (post_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = notifications.user_id))
      OR (comment_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND c.user_id = notifications.user_id))
    )
  );

-- 4) Tighten support_messages: only allow inserts where user_id thread = self OR sender is staff
DROP POLICY IF EXISTS "Users can send support messages" ON public.support_messages;
CREATE POLICY "Users can send support messages" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      user_id = auth.uid()
      OR public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'moderator'::app_role)
    )
  );

-- 5) Protect user_warnings columns: user can only change "acknowledged"
CREATE OR REPLACE FUNCTION public.guard_warning_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = NEW.user_id AND NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    NEW.reason    := OLD.reason;
    NEW.issued_by := OLD.issued_by;
    NEW.user_id   := OLD.user_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_warning_guard ON public.user_warnings;
CREATE TRIGGER trg_warning_guard
BEFORE UPDATE ON public.user_warnings
FOR EACH ROW EXECUTE FUNCTION public.guard_warning_columns();

-- 6) Storage policies: post-media folder = uid, plus update/delete
DROP POLICY IF EXISTS "post media upload own folder" ON storage.objects;
CREATE POLICY "post media upload own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
DROP POLICY IF EXISTS "post media update own" ON storage.objects;
CREATE POLICY "post media update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "post media delete own or staff" ON storage.objects;
CREATE POLICY "post media delete own or staff" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-media'
    AND (auth.uid()::text = (storage.foldername(name))[1]
         OR public.has_role(auth.uid(),'admin'::app_role)
         OR public.has_role(auth.uid(),'moderator'::app_role))
  );

-- round-meetings update/delete
DROP POLICY IF EXISTS "round-meetings update own" ON storage.objects;
CREATE POLICY "round-meetings update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'round-meetings' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "round-meetings delete own or staff" ON storage.objects;
CREATE POLICY "round-meetings delete own or staff" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'round-meetings'
    AND (auth.uid()::text = (storage.foldername(name))[1]
         OR public.has_role(auth.uid(),'admin'::app_role)
         OR public.has_role(auth.uid(),'moderator'::app_role))
  );

-- 7) Hard delete RPC for staff (used by deleted-items section)
CREATE OR REPLACE FUNCTION public.hard_delete_post(_post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.comments WHERE post_id = _post_id;
  DELETE FROM public.likes WHERE post_id = _post_id;
  DELETE FROM public.notifications WHERE post_id = _post_id;
  DELETE FROM public.posts WHERE id = _post_id;
END $$;

CREATE OR REPLACE FUNCTION public.hard_delete_comment(_comment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.comment_likes WHERE comment_id = _comment_id;
  DELETE FROM public.notifications WHERE comment_id = _comment_id;
  DELETE FROM public.comments WHERE id = _comment_id;
END $$;
