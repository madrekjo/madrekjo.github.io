-- ============================================================================
-- ★ الحد الأقصى لمدة الجولة: 3 ساعات (180 دقيقة) ★
-- التاريخ: 2026-10-22
-- التنفيذ: Supabase Dashboard -> SQL Editor -> New Query -> Run
--
-- بديل لـ 20261022000002 (كان 240). الحد الأدنى 5 دقائق والأقصى 180 دقيقة.
-- القيد NOT VALID: يُفرَض على الصفوف الجديدة أو المعدَّلة فقط، ولا يعيد
-- التحقق من الجولات القديمة التي تتجاوز الحد.
--
-- آمن لإعادة التشغيل.
-- ============================================================================

ALTER TABLE public.study_rounds
  DROP CONSTRAINT IF EXISTS study_rounds_duration_check;

ALTER TABLE public.study_rounds
  ADD CONSTRAINT study_rounds_duration_check
  CHECK (
    duration_minutes >= 5
    AND duration_minutes <= 180
  ) NOT VALID;
