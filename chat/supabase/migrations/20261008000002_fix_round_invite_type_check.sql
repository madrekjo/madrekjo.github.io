-- ============================================================================
-- 20261008000002 — إصلاح دعوة الجولات: قيد نوع الإشعار لم يشمل round_invite
--
-- يُنفَّذ يدوياً من: Dashboard → SQL Editor (مشروع hvrtzzouasqseyswjcex)
--
-- المشكلة: دعوة الجولة تفشل دائماً برسالة «الحد اليومي» رغم أنها الأولى.
-- السبب الحقيقي: قيد CHECK notifications_type_check أ最后一次 حُدِّث في
-- 20260927000006 (قبل دعوة الجولات) ويشمل فقط:
--   ('like','comment','reply','mention','support_reply','owner_comms','owner_comms_reply')
-- migration 20261008000001 أضاف نوع round_invite للسياسة لكنه نسي القيد،
-- فكل INSERT بـ type='round_invite' يُرفض بـ check violation (23514)
-- والواجهة تعرض رسالة الحد اليومي خطأً لأي فشل.
-- ============================================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'reply', 'mention',
    'support_reply', 'owner_comms', 'owner_comms_reply',
    'round_invite'
  ));

-- تحقق: القيد يشمل round_invite
-- SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conname = 'notifications_type_check';
