-- =============================================================================
-- تطبيع الأسماء العربية + حسم التعارضات تلقائياً + قيد التفرّد
-- =============================================================================
-- الإصدار السابق من هذا الملف كان يرفع استثناءً عند وجود تعارض، فتراجع
-- كل شيء بالدالة normalize_anon_name — وهو سبب خطأ:
--   ERROR: function public.normalize_anon_name(text) does not exist
--
-- هذا الإصدار يحسم التعارضات بنفسه: يبقي الأقدم على اسمه، ويضيف رقماً
-- للاحداث («محمد» ← «محمّد» ← يصبح «محمّد 2»). لا أحد يخسر حسابه،
-- ولا يبقى الاسم مكرراً.
--
-- ملاحظة: هذا الملف آمن للتشغيل المتكرر (idempotent).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) دالة التطبيع — تنشأ أولاً حتى لو فشل ما بعدها
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_anon_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(
    replace(replace(replace(replace(replace(replace(
      regexp_replace(coalesce(p, ''), '[ً-ْٰـ]', '', 'g'),
      'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ٱ', 'ا'),
      'ى', 'ي'), 'ة', 'ه')
  ));
$$;

-- ---------------------------------------------------------------------------
-- 2) نزيل القيود القديمة قبل التعديل (وإلا تعارض التطبيع مع القيد القديم)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.device_names_name_idx;
DROP INDEX IF EXISTS public.device_names_uniq_lower_name;

-- ---------------------------------------------------------------------------
-- 3) حسم التعارضات: الأحدث يأخذ رقماً
--    نكرّر حتى ينتهي، لأن إضافة الرقم قد تصطدم باسم موجود مسبقاً
--    («محمد 2» قد يكون موجوداً أصلاً فيصير «محمد 2 2» وهكذا).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  attempt  int  := 1;
  conflicts int := 0;
BEGIN
  WHILE attempt <= 12 LOOP
    SELECT count(*) INTO conflicts FROM (
      SELECT 1
        FROM public.device_names
       GROUP BY public.normalize_anon_name(name)
      HAVING count(*) > 1
    ) q;

    EXIT WHEN conflicts = 0;

    WITH ranked AS (
      SELECT device_id,
             row_number() OVER (
               PARTITION BY public.normalize_anon_name(name)
               ORDER BY created_at, device_id
             ) AS rn
        FROM public.device_names
    )
    UPDATE public.device_names d
       SET name = public.normalize_anon_name(d.name) || ' ' || r.rn,
           updated_at = now()
      FROM ranked r
     WHERE d.device_id = r.device_id
       AND r.rn > 1;

    attempt := attempt + 1;
  END LOOP;

  -- احتياط: لم Stabil --krit Stabil بعد ١٢ محاولة، نلحق بلاحق مشتق من المعرّف
  -- (device_id مفتاح أساسي، فمضمون أنه مختلف لكل صف)
  IF conflicts > 0 THEN
    WITH ranked AS (
      SELECT device_id,
             row_number() OVER (
               PARTITION BY public.normalize_anon_name(name)
               ORDER BY created_at, device_id
             ) AS rn
        FROM public.device_names
    )
    UPDATE public.device_names d
       SET name = public.normalize_anon_name(d.name) || '-' || substr(md5(d.device_id), 1, 4),
           updated_at = now()
      FROM ranked r
     WHERE d.device_id = r.device_id
       AND r.rn > 1;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) تطبيع كل الأسماء
-- ---------------------------------------------------------------------------
UPDATE public.device_names
   SET name = public.normalize_anon_name(name),
       updated_at = now()
 WHERE name IS DISTINCT FROM public.normalize_anon_name(name);

-- ---------------------------------------------------------------------------
-- 5) القيد الجديد: التفرّد على الصورة المطبّعة
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS device_names_uniq_normalized
  ON public.device_names (public.normalize_anon_name(name));

-- ---------------------------------------------------------------------------
-- 6) set_device_name يطبّع قبل الفحص والحفظ
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_device_name(p_device_id text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean  text;
  maxlen int := COALESCE(public.cfg_num(public.ban_scoring_settings(), 'name_max_len', 40), 40);
BEGIN
  IF p_device_id IS NULL OR length(btrim(p_device_id)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid device');
  END IF;

  -- الاسم الفارغ = إزالة الاسم
  clean := public.normalize_anon_name(regexp_replace(coalesce(p_name, ''), '[^[:print:][:space:]]', '', 'g'));
  IF clean = '' THEN
    DELETE FROM public.device_names WHERE device_id = p_device_id;
    RETURN jsonb_build_object('ok', true, 'name', NULL);
  END IF;

  IF length(clean) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too short');
  END IF;
  IF length(clean) > maxlen THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too long');
  END IF;
  IF clean ~ '(https?://|www\.|[@＠])' OR clean ~ '[[:alnum:]]+[._-]+[[:alnum:]]+[[:space:]]*[@＠]' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no links');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.device_names n
     WHERE public.normalize_anon_name(n.name) = clean
       AND n.device_id <> p_device_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name taken');
  END IF;

  BEGIN
    INSERT INTO public.device_names(device_id, name, created_at, updated_at)
    VALUES (p_device_id, clean, now(), now())
    ON CONFLICT (device_id) DO UPDATE
      SET name = EXCLUDED.name, updated_at = now();
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name taken');
  END;

  RETURN jsonb_build_object('ok', true, 'name', clean);
END;
$$;

COMMIT;

-- =============================================================================
-- تقرير بعد التشغيل
-- =============================================================================
-- SELECT count(*) AS "عدد الأسماء" FROM public.device_names;
--
-- يجب أن يطبع لا شيء:
-- SELECT public.normalize_anon_name(name), count(*)
--   FROM public.device_names GROUP BY 1 HAVING count(*) > 1;
--
-- للمعاينة قبل أي تعديل:
-- SELECT public.normalize_anon_name(name) AS مطبّع,
--        count(*) AS العدد,
--        string_agg(name, ' | ' ORDER BY created_at) AS الأشكال
--   FROM public.device_names
--  GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC;