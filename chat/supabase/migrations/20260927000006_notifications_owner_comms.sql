-- ============================================================================
-- توسيع أنواع إشعارات الجرس لتدعم تواصل الفريق
-- يضيف: owner_comms + owner_comms_reply (ويبقي كل الأنواع القائمة في التشغيل)
-- آمن إعادة التشغيل.
-- ============================================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'reply', 'mention', 'support_reply', 'owner_comms', 'owner_comms_reply'));