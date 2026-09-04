-- ============================================================
-- فهارس لتقليل استهلاك قاعدة البيانات (تحسين أداء الاستعلامات)
-- شغّل هذا الملف مرة واحدة على Supabase (SQL Editor → New Query → Run)
-- هذه الفهارس Columns تستخدمها استعلامات الموقع باستمرار.
-- ============================================================

-- الإشعارات: تُقرأ دائماً حسب user_id ثم createdAt تنازلياً
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON public.notifications(user_id, is_read);

-- إعجابات المنشورات: تُقرأ حسب post_id
CREATE INDEX IF NOT EXISTS idx_likes_post_id
  ON public.likes(post_id);

-- التعليقات: تُقرأ حسب post_id
CREATE INDEX IF NOT EXISTS idx_comments_post_id
  ON public.comments(post_id);

-- إعجابات التعليقات: تُقرأ حسب comment_id
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id
  ON public.comment_likes(comment_id);

-- الرتب: تُقرأ حسب user_id
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON public.user_roles(user_id);

-- البروفايلات: تُقرأ حسب user_id (مستخدم واحد)
CREATE INDEX IF NOT EXISTS idx_profiles_user_id
  ON public.profiles(user_id);

-- رسائل الدعم: تُقرأ حسب user_id (جزء كبير من استهلاك الشات)
CREATE INDEX IF NOT EXISTS idx_support_messages_user_id
  ON public.support_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_user_read
  ON public.support_messages(user_id, sender_id, is_read);

-- مشاركو الجولات: تُقرأ حسب round_id و user_id
CREATE INDEX IF NOT EXISTS idx_round_participants_round_id
  ON public.round_participants(round_id);
CREATE INDEX IF NOT EXISTS idx_round_participants_user_id
  ON public.round_participants(user_id);

-- ردود الاقتراحات وإعجاباتها
CREATE INDEX IF NOT EXISTS idx_suggestion_replies_suggestion_id
  ON public.suggestion_replies(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_likes_suggestion_id
  ON public.suggestion_likes(suggestion_id);

-- رسائل تغييرات/تحفيز حسب category
CREATE INDEX IF NOT EXISTS idx_changes_messages_category
  ON public.changes_messages(category);

-- رسائل اجتماع الإدارة حسب created_at
CREATE INDEX IF NOT EXISTS idx_staff_chat_created_at
  ON public.staff_chat(created_at);

-- رسائل الجولات حسب round_id
CREATE INDEX IF NOT EXISTS idx_round_chat_round_id
  ON public.round_chat(round_id, created_at);

-- رسائل الاجتماعات الخاصة حسب meeting_id
CREATE INDEX IF NOT EXISTS idx_round_meeting_messages_meeting_id
  ON public.round_meeting_messages(meeting_id, created_at);

-- أعضاء الاجتماعات الخاصة حسب meeting_id
CREATE INDEX IF NOT EXISTS idx_round_meeting_members_meeting_id
  ON public.round_meeting_members(meeting_id);
