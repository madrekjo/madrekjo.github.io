-- ============================================================================
-- ★ رتبة المالك (owner) — فوق الأدمن ★
-- Supabase → SQL Editor → New Query → Paste → Run
-- (شغّل قبله ملف 20260915000002_add_owner_enum.sql أولاً)
--
-- المالكون: عبدالرحمن جراح + عبودي.
-- ما يقدر أحد (حتى مالك آخر) يحظرهم / يعلّقهم / يعدّل فيهم أي شيء / يحذفهم.
--
-- صلاحيات حصرية للمالك (لا يملكها الأدمن):
--   1) إدارة حسابات الأدمن والمشرفين (حظر/تابع/تعديل/حذف)
--   2) تعيين وسحب أي رتبة (user_roles) — كل الرتب
--   3) الحذف النهائي للمستخدمين (admin_delete_user)
--   4) إدارة صلاحيات المشرف/المسؤول (role_permissions)
-- ============================================================================

-- [1] صلاحيات المالك: كل المقادير مفعّلة (مطلق الصلاحيات)
INSERT INTO public.role_permissions
  (role, can_delete_posts, can_delete_comments, can_ban_users, can_timeout,
   can_warn, can_manage_reports, can_lock_sections, can_manage_words)
VALUES
  ('owner', true, true, true, true, true, true, true, true)
ON CONFLICT (role) DO UPDATE SET
  can_delete_posts = true, can_delete_comments = true, can_ban_users = true,
  can_timeout = true, can_warn = true, can_manage_reports = true,
  can_lock_sections = true, can_manage_words = true, updated_at = now();

-- [2] إسناد رتبة المالك للمالكين فقط (عن طريق البريد — لا UUID صلب)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'
FROM auth.users
WHERE email IN ('abdalrahmanjarrah94@gmail.com', 'aaboodym16@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- [3] has_permission: المالك مطلق الصلاحيات (كالإدمن تماماً في التنفيذ)
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ok boolean := false;
BEGIN
  IF public.has_role(_user_id, 'admin'::app_role)
     OR public.has_role(_user_id, 'owner'::app_role) THEN
    RETURN true;
  END IF;

  EXECUTE format('
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = $1 AND rp.%I = true
    )', _perm)
  INTO ok
  USING _user_id;

  RETURN COALESCE(ok, false);
END $$;

-- [4] الحماية المطلقة لحساب المالك: أي تعديل على أي حقل من غير صاحب الحساب → مرفوض
CREATE OR REPLACE FUNCTION public.protect_owner_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(OLD.user_id, 'owner'::app_role)
     AND auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'لا يمكن تعديل حساب المالك';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_owner_profiles ON public.profiles;
CREATE TRIGGER trg_protect_owner_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_profiles();

-- منع حذف صف البروفايل لأي مالك (حتى عبر RLS مباشرة)
CREATE OR REPLACE FUNCTION public.protect_owner_profiles_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(OLD.user_id, 'owner'::app_role) THEN
    RAISE EXCEPTION 'لا يمكن حذف حساب المالك';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_protect_owner_profiles_delete ON public.profiles;
CREATE TRIGGER trg_protect_owner_profiles_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_profiles_delete();

-- [5] رتبة المالك في user_roles: لا تُحذف + لا تُمنح إلا بواسطة مالك
CREATE OR REPLACE FUNCTION public.protect_owner_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'owner'::app_role THEN
    RAISE EXCEPTION 'لا يمكن إزالة رتبة المالك';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.role = 'owner'::app_role
     AND NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'فقط المالك يمكنه منح رتبة المالك';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_protect_owner_roles ON public.user_roles;
CREATE TRIGGER trg_protect_owner_roles
  BEFORE INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_roles();

-- حماية أدمن/مشرف: لا يمنح أحد تخفيض صلاحيات مالك أو مؤسس
CREATE OR REPLACE FUNCTION public.protect_staff_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = OLD.user_id;

  -- حماية أي رتبة تخص حساب المالك (تشمل admin/moderator/...)
  IF public.has_role(OLD.user_id, 'owner'::app_role) THEN
    RAISE EXCEPTION 'لا يمكن سحب أي صلاحية من حسابات المالك';
  END IF;

  -- حماية الأدمن/المشرف على حسابات المؤسسين بالبريد
  IF v_email IN ('abdalrahmanjarrah94@gmail.com', 'madrekjo@gmail.com', 'aaboodym16@gmail.com')
     AND OLD.role IN ('admin'::app_role, 'moderator'::app_role) THEN
    RAISE EXCEPTION 'لا يمكن سحب صلاحيات المؤسسين';
  END IF;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_protect_staff_roles ON public.user_roles;
CREATE TRIGGER trg_protect_staff_roles
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_staff_roles();

-- [6] منع حظر أي حساب إداري إلا بواسطة المالك (والمالك محمي دائماً)
CREATE OR REPLACE FUNCTION public.protect_staff_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_banned IS DISTINCT FROM NEW.is_banned
     OR OLD.chat_banned IS DISTINCT FROM NEW.chat_banned
     OR OLD.timeout_until IS DISTINCT FROM NEW.timeout_until THEN

    -- المالك محمي من أي تعديل على الحظر (من أي حد كان)
    IF public.has_role(OLD.user_id, 'owner'::app_role) THEN
      RAISE EXCEPTION 'لا يمكن حظر أو تعليق حساب المالك';
    END IF;

    -- الأدمن/المشرف: لا يقدر أي أدمن/مشرف آخر يحظرهم — المالك فقط
    IF (public.has_role(OLD.user_id, 'admin'::app_role)
        OR public.has_role(OLD.user_id, 'moderator'::app_role))
       AND NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
      RAISE EXCEPTION 'لا يمكن حظر أو تعليق حساب إداري إلا بواسطة المالك';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_staff_ban ON public.profiles;
CREATE TRIGGER trg_protect_staff_ban
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_staff_ban();

-- [7] إدارة الرتب في user_roles: حصرية للمالك
DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
CREATE POLICY "Owners can insert user roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
CREATE POLICY "Owners can delete user roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));

-- [8] إدارة صلاحيات المشرفين (role_permissions): حصرية للمالك
DROP POLICY IF EXISTS "admin manages role perms" ON public.role_permissions;
CREATE POLICY "owner manages role perms" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

-- [9] الحذف النهائي: حصري للمالك + المالكون محميون من الحذف
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'الحذف النهائي حصري للمالك';
  END IF;

  SELECT email INTO target_email FROM auth.users WHERE id = _user_id;
  IF public.has_role(_user_id, 'owner'::app_role)
     OR target_email IN ('abdalrhmanmaaith24@gmail.com', 'abdalrahmanjarrah94@gmail.com', 'aaboodym16@gmail.com') THEN
    RAISE EXCEPTION 'لا يمكن حذف حساب مالك';
  END IF;

  -- حذف كل بيانات المستخدم الهدف (نفس السلوك السابق)
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

DO $$ BEGIN RAISE NOTICE '✅ تم تفعيل رتبة المالك وحماية الحسابات الإدارية'; END $$;