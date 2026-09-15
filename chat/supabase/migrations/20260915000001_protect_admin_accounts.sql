-- ============================================================================
-- ★ حماية حسابات الإدارة من الحظر والحذف ★
-- شغّلها من: Supabase → SQL Editor → New Query → Paste → Run
-- المشروع: chat (biabdoatwfteqwgjdxzc)
--
-- ماذا يفعل:
--   [1] trigger على profiles يمنع تغيير is_banned/chat_banned/timeout_until على أي حساب أدمن/مشرف
--   [2] حماية حذف صلاحيات المشرفين من جدول user_roles ( protects original admin + معايطه + jarrah)
--   [3] حماية حذف حسابات الأدمن من admin_delete_user (يمكنهم الحذف بالواجهة لكن لا أحد يحذفهم)
-- ============================================================================

-- [1] حماية حسابات الإدارة من الحظر (ban/timeout)
CREATE OR REPLACE FUNCTION public.protect_staff_ban()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- منع تغيير أي حقل من الحظر/ال Timeout على أي حساب له صلاحية admin أو moderator
  IF (
    OLD.is_banned IS DISTINCT FROM NEW.is_banned OR
    OLD.chat_banned IS DISTINCT FROM NEW.chat_banned OR
    OLD.timeout_until IS DISTINCT FROM NEW.timeout_until
  ) AND (
    public.has_role(OLD.user_id, 'admin') OR
    public.has_role(OLD.user_id, 'moderator')
  ) THEN
    RAISE EXCEPTION 'لا يمكن حظر أو تعليق حساب فيه صلاحية إدارة أو إشراف';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_staff_ban ON public.profiles;
CREATE TRIGGER trg_protect_staff_ban
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_staff_ban();

-- [2] منع حذف صلاحيات المشرفين من user_roles (يعمل على الحالتين: حذف الدور أو حذف المستخدم من auth.users)
CREATE OR REPLACE FUNCTION public.protect_staff_roles()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = OLD.user_id;
  -- لا يُسمح بحذف دور ادمن أو مشرف من أي حساب administered حسب الإيميلات الأصلية
  IF (
    v_email IN ('abdalrhmanmaaith24@gmail.com', 'abdalrahmanjarrah94@gmail.com', 'madrekjo@gmail.com')
  ) AND OLD.role IN ('admin', 'moderator') THEN
    RAISE EXCEPTION 'لا يمكن سحب صلاحيات المؤسسين';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_protect_staff_roles ON public.user_roles;
CREATE TRIGGER trg_protect_staff_roles
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_staff_roles();

-- [3] حماية حذف حسابات المؤسسين في admin_delete_user
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE target_email text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT email INTO target_email FROM auth.users WHERE id = _user_id;
  IF target_email = 'abdalrhmanmaaith24@gmail.com' THEN
    RAISE EXCEPTION 'cannot delete original administrator';
  END IF;
  IF target_email = 'abdalrahmanjarrah94@gmail.com' THEN
    RAISE EXCEPTION 'cannot delete admin account';
  END IF;
  IF public.has_role(_user_id, 'admin') THEN
    RAISE EXCEPTION 'cannot delete any admin account';
  END IF;

  -- (حذف كل البيانات المعتمدة — كما هو حالياً)
  DELETE FROM public.comment_likes WHERE user_id = _user_id
    OR comment_id IN (SELECT id FROM public.comments WHERE user_id = _user_id);
  DELETE FROM public.likes WHERE user_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.notifications WHERE user_id = _user_id OR actor_id = _user_id;
  DELETE FROM public.post_reports WHERE reporter_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.post_mentions WHERE user_id = _user_id OR actor_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id)
    OR comment_id IN (SELECT id FROM public.comments WHERE user_id = _user_id);
  DELETE FROM public.comments WHERE user_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.posts WHERE user_id = _user_id;
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
  DELETE FROM public.point_transactions WHERE user_id = _user_id;
  DELETE FROM public.user_points WHERE user_id = _user_id;
  DELETE FROM public.user_warnings WHERE user_id = _user_id;
  DELETE FROM public.user_devices WHERE user_id = _user_id;
  DELETE FROM public.banned_devices WHERE device_id IN (
    SELECT device_id FROM public.user_devices WHERE user_id = _user_id
  );
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE user_id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
END $$;

RAISE NOTICE '✅ تم تفعيل حماية حسابات الإدارة من الحظر والحذف';