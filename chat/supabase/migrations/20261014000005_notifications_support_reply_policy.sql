-- ============================================================================
-- إصلاح: السماح بإشعار "support_reply" في سياسة إدراج notifications
-- يُنفَّذ يدويًا: Supabase Dashboard → SQL Editor لمشروع الدردشة
--          romocwtqzdnovfgtmwzb
--
-- المشكلة:
--   تطبيق الدردشة (Support.tsx) يُدرج إشعارًا نوعه 'support_reply' عندما يردّ
--   الدعم على مستخدم مسجَّل. لكن سياسة الإدراج "Valid notifications only"
--   لا تتضمّن هذا النوع إطلاقًا، فكان كل ردّ يُرفض بخطأ 42501:
--   "new row violates row-level security policy for table notifications".
--   (لذلك لا يوجد أي صفّ نوعه support_reply في الجدول رغم استخدامه بالكود.)
--
-- الحل: إعادة إنشاء السياسة مع الحفاظ على كل الشروط السابقة، وإضافة فرع
--   يسمح بـ support_reply إذا كان المُرسِل من طاقم الدعم (support_is_admin()).
--   النوع 'support_reply' موجود أصلًا في قيد CHECK على العمود type.
-- آمن إعادة التشغيل.
-- ============================================================================

DROP POLICY IF EXISTS "Valid notifications only" ON public.notifications;

CREATE POLICY "Valid notifications only" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = actor_id
    AND user_id <> actor_id
    AND (
      (
        type = 'mention'
        AND EXISTS (
          SELECT 1 FROM public.post_mentions pm
           WHERE pm.actor_id = auth.uid()
             AND pm.post_id IS NOT DISTINCT FROM notifications.post_id
             AND pm.comment_id IS NOT DISTINCT FROM notifications.comment_id
             AND (pm.user_id = notifications.user_id OR pm.is_all)
        )
      )
      OR (post_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.posts p
             WHERE p.id = notifications.post_id
               AND p.user_id = notifications.user_id))
      OR (comment_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.comments c
             WHERE c.id = notifications.comment_id
               AND c.user_id = notifications.user_id))
      OR (
        type = 'round_invite'
        AND round_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.study_rounds sr
           WHERE sr.id = notifications.round_id
             AND sr.user_id = auth.uid()
        )
        AND public.round_invites_today(auth.uid()) <= 100
      )
      OR (
        type = 'support_reply'
        AND public.support_is_admin()
      )
    )
  );
