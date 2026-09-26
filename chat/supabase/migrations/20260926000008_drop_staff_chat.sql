-- ============================================================================
-- ★ حذف «اجتماع الإدارة» نهائياً + إصلاح admin_delete_user ★
-- Supabase → SQL Editor → New Query → Paste → Run
--
-- اجتماع الإدارة (staff_chat) أُلغي من الواجهة — على الفاضي:
--   * حذف الجدول staff_chat (ومعها كل سياساتها تلقائياً)
--   * إعادة تعريف admin_delete_user (نسخة المالك) بدون السطر
--     「DELETE FROM public.staff_chat」 حتى لا يتعطل الحذف النهائي.
-- ============================================================================

DROP TABLE IF EXISTS public.staff_chat;

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
  -- ملاحظة: staff_chat حُذفت نهائياً (اجتماع الإدارة أُلغي).
  DELETE FROM public.changes_messages WHERE user_id = _user_id;

  DELETE FROM public.point_transactions WHERE user_id = _user_id;
  DELETE FROM public.user_points WHERE user_id = _user_id;

  DELETE FROM public.user_warnings WHERE user_id = _user_id OR issued_by = _user_id;
  DELETE FROM public.user_devices WHERE user_id = _user_id;
  DELETE FROM public.admin_actions WHERE admin_id = _user_id OR target_user_id = _user_id;
  DELETE FROM public.owner_communications WHERE created_by = _user_id OR done_by = _user_id;
  DELETE FROM public.social_tasks WHERE created_by = _user_id OR done_by = _user_id OR verified_by = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE user_id = _user_id;

  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE '✅ حُذف اجتماع الإدارة (staff_chat) وضُبط admin_delete_user'; END $$;