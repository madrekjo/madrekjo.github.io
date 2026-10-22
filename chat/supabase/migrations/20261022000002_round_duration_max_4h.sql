-- ============================================================================
-- ★ حد أقصى لمدة الجولة: 4 ساعات (240 دقيقة) ★
-- التاريخ: 2026-10-22
-- التنفيذ: Supabase Dashboard -> SQL Editor -> New Query -> Run
--
-- الحد الأدنى 5 دقائق والأقصى 240 دقيقة (صافي وقت العمل).
-- القيد NOT VALID: يُفرَض على الصفوف الجديدة أو المعدَّلة فقط، ولا يعيد
-- التحقق من الجولات القديمة التي تتجاوز الحد (توجد جولات سابقة حتى 1800 دقيقة)
-- حتى لا نفشل الترحيل أو نغيّر سجلات قديمة.
--
-- آمن لإعادة التشغيل.
-- ============================================================================

ALTER TABLE public.study_rounds
  DROP CONSTRAINT IF EXISTS study_rounds_duration_check;

ALTER TABLE public.study_rounds
  ADD CONSTRAINT study_rounds_duration_check
  CHECK (
    duration_minutes >= 5
    AND duration_minutes <= 240
  ) NOT VALID;
