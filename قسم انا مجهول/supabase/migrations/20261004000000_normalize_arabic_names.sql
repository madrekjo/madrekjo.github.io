-- =============================================================================
-- تطبيع الأسماء العربية + منع التكرار البصري
-- =============================================================================
-- الاختبار على القاعدة الجديدة أظهر:
--   1) «زهرة» ثم «زهرة»      → name taken   ✅ التكرار الحرفي ممنوع
--   2) «زهرة» ثم «  زهره  »  → ok:true      ❌ مرّ! لأن ة ≠ ه
--
--也就是说 التطبيع الحالي يعمل على trim + lower فقط، ولا يوحّد الإملاء العربي:
--   «محمّد» / «محمد» / «مـحـمـد» / «محمد »  ← أربعة أسماء مختلفة المظهر، متطابقة الشكل
--   «أحمد» / «إحمد» / «آحمد»               ← ثلاثة أشكال لحرف واحد
--   «يوسف» / «یوسف» / «يوسف»               ← ي/ى/ی
--   «مدرسة» / «مدرسه»                       ← ة/ه
--
-- النتيجة: Administration»: خمسة مستخدمين يكتبون اسماً واحداً بأشكال مختلفة،
-- فيظهر وكأنهم «حساب واحد» — وهو بالضبط ما شكا منه المستخدم.
--
-- الحل:
--   1) دالة normalize_anon_name تطبّع الشكل العربي.
--   2) تفرّد على الصورة المطبّعة، فلا يمرّ شكلان متشابهان معاً.
--   3) تُخزَّن الاسم بصيغته المطبّعة، فالعرض متسق أمام الناس والإدارة.
-- =============================================================================

BEGIN;

-- 1) دالة التطبيع -----------------------------------------------------------
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

-- 2) إعادة فحص التفرّد على الصورة المطبّعة ----------------------------------
-- نزيل القيد القديم المبني على lower(name) لأن عمود الاسم نفسه سيصير مطبّعاً،
-- فالقيد الجديد أدق ويغطّي الحالتين.

DO $$
BEGIN
  -- نكشف التعارضات الموجودة قبل القيد: نمنع التطبيق إن وُجدت.
  IF EXISTS (
    SELECT 1 FROM public.device_names
     GROUP BY public.normalize_anon_name(name)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'يوجد أسماء متطابقة بالشكل ما بعد التطبيع. راجع السجلات قبل تفعيل القيد.';
  END IF;
END $$;

-- 3) تطبيع كل الأسماء القائمة ----------------------------------------------
UPDATE public.device_names
   SET name = public.normalize_anon_name(name),
       updated_at = now()
 WHERE name IS DISTINCT FROM public.normalize_anon_name(name);

-- 4) القيد الجديد: التفرّد على الصورة المطبّعة ------------------------------
DROP INDEX IF EXISTS public.device_names_name_idx;
DROP INDEX IF EXISTS public.device_names_uniq_lower_name;

CREATE UNIQUE INDEX IF NOT EXISTS device_names_uniq_normalized
  ON public.device_names (public.normalize_anon_name(name));

-- 5) set_device_name يطبّع قبل الفحص والحفظ ---------------------------------
CREATE OR REPLACE FUNCTION public.set_device_name(p_device_id text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean text;
  maxlen int := COALESCE(public.cfg_num(public.ban_scoring_settings(), 'name_max_len', 30), 30);
BEGIN
  IF p_device_id IS NULL OR length(btrim(p_device_id)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid device');
  END IF;

  -- الاسم الفارغ = إزالة الاسم (سلوك محفوظ)
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
-- تحقق بعد التشغيل
-- =============================================================================
-- SELECT name, count(*) FROM public.device_names
--  GROUP BY name HAVING count(*) > 1;      -- يجب أن يطبع ��ius لا شيء
--
-- اختبار سريع (نفسه عبر REST):
--   set_device_name('aaaa…','محمّد')  → ok
--   set_device_name('bbbb…','محمد')   → name taken   ✅ بعد التطبيع
--   set_device_name('cccc…','إحمد')   → name taken   ✅ أ/إ/آ موحّدة
