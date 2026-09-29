-- ============================================================================
--  منع تبادل الأسماء — اسم واحد = جهاز واحد
-- ============================================================================
--  المشكلة:
--    device_names كان له PRIMARY KEY على device_id فقط، وعمود name بلا أي
--    قيد تفرّد. أي جهاز يقدر يكتب أي اسم — حتى اسم جهاز آخر تماماً.
--    النتيجة: الاسم ما عاد يميّز حدا، لأن جهازين أو عشرة يحملون نفس
--    الاسم، وتختلط سجلات الإدارة فتصبح التوقيفات على أساس الاسم خاطئة.
--
--  الحل:
--    1) قيد تفرّد على lower(name) — الاسم بعد التطبيع (case-insensitive)
--       يتبع جهازاً واحداً فقط.
--    2) تطبيع الأسماء المكرّرة الموجودة: نُبقي الأقدم ونحذف الباقي.
--    3) set_device_name يرفض الاسم المحجوز برسالة واضحة بدل أن يبتلعه
--       صامتاً في ON CONFLICT.
--
--  ملاحظة: لا يمس هذا الملف أي بيانات محتوى (منشورات/تعليقات)، ويهتم
--  بجدول device_names فقط.
-- ============================================================================


-- ============================================================================
-- 1) تطبيع المكرر الحالي: الأقدم يبقى، الباقي يُحذف
--    نستخدم row_number لا DISTINCT ON حتى يعمل على أي نسخة Postgres.
-- ============================================================================
DO $$
DECLARE
  removed int;
BEGIN
  WITH ranked AS (
    SELECT device_id,
           row_number() OVER (
             PARTITION BY lower(btrim(name))
             ORDER BY created_at ASC, device_id ASC
           ) AS rn
      FROM public.device_names
     WHERE btrim(name) <> ''
  ), dupes AS (
    SELECT device_id FROM ranked WHERE rn > 1
  ), del AS (
    DELETE FROM public.device_names d
     USING dupes
     WHERE d.device_id = dupes.device_id
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM del;

  -- أسماء فارغة/مسافات لا معنى لها
  DELETE FROM public.device_names WHERE btrim(name) = '';

  RAISE NOTICE 'device_names: حُذف % اسم مكرر', removed;
END $$;


-- ============================================================================
-- 2) قيد التفرّد على الاسم (غير حسّاس لحالة الأحرف)
--    lower(name) وليس name: «ابو محمد» و«ابو محمد» اسمان واحدان عملياً،
--    ولو سمحنا بهما لأعادنا المشكلة نفسها بحلقة.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS device_names_uniq_lower_name
  ON public.device_names (lower(btrim(name)))
  WHERE btrim(name) <> '';

-- الفهرس القديم غير الفريد أصبح بلا فائدة
DROP INDEX IF EXISTS public.device_names_name_idx;


-- ============================================================================
-- 3) set_device_name: ترفض الاسم المحجوز برسالة مفهومة
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_device_name(p_device_id text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid device');
  END IF;

  clean := btrim(regexp_replace(coalesce(p_name, ''), '[\u0000-\u001F\u007F]+', ' ', 'g'));
  clean := btrim(regexp_replace(clean, '\s{2,}', ' ', 'g'));

  -- حذف الاسم (ما زال مسموحاً — يحرّر الاسم للغير)
  IF clean = '' THEN
    DELETE FROM public.device_names WHERE device_id = p_device_id;
    RETURN jsonb_build_object('ok', true, 'name', NULL);
  END IF;

  IF char_length(clean) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too short');
  END IF;
  IF char_length(clean) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too long');
  END IF;
  IF clean ~ '(https?://|www\.|@)' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no links');
  END IF;

  -- الاسم محجوز لجهاز آخر => نرفض بوضوح
  IF EXISTS (
    SELECT 1 FROM public.device_names n
     WHERE lower(btrim(n.name)) = lower(clean)
       AND n.device_id <> p_device_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name taken');
  END IF;

  -- نقود سباق محتمل بين جهازين يطلبان الاسم نفسه في اللحظة نفسها:
  -- القيد الفريد هو الحَكَم، ونلتقطه ونحوّله لنفس الرسالة بدل خطأ 500.
  BEGIN
    INSERT INTO public.device_names(device_id, name, created_at, updated_at)
    VALUES (p_device_id, clean, now(), now())
    ON CONFLICT (device_id) DO UPDATE
      SET name = EXCLUDED.name, updated_at = now();
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name taken');
  END;

  RETURN jsonb_build_object('ok', true, 'name', clean);
END $$;

REVOKE EXECUTE ON FUNCTION public.set_device_name(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_device_name(text,text) TO anon, authenticated;
