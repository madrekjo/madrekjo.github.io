-- ============================================================================
-- ★ إصلاح فشل "حذف نهائي" في إدارة المستخدمين ★
-- شغّلها من: Supabase → SQL Editor → New Query → Paste → Run
--
-- المشكلة: كانت admin_delete_user تحذف كل بيانات المستخدم ثم auth.users،
-- لكنها لا تحذف جدولي النقاط:
--   - user_points          (رصيد النقاط)
--   - point_transactions   (سجل حركات النقاط: خصم/مكافأة/استرجاع...)
-- فإذا كان للمستخدم أي حركة نقاط يرفض Postgres الحذف (FK violation)
-- وتظهر رسالة "فشل" من لوحة الإدارة.
--
-- الإصلاح: تُعاد كتابة الدالة لتشمل حذف هذين الجدولين (+ post_mentions
-- لأمان إضافي) قبل حذف auth.users.
-- ============================================================================

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
  DELETE FROM public.post_mentions WHERE user_id = _user_id OR actor_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id)
    OR comment_id IN (SELECT id FROM public.comments WHERE user_id = _user_id);
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

  -- نقاط النظام (رصيد المستخدم + كل حركات نقاطه)
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