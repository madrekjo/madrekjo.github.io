-- =============================================================
-- نافذة وقت النوم: 11:00 مساءً → 3:00 فجراً (بتوقيت الأردن UTC+3)
-- =============================================================
-- شغّل هذا الملف في Supabase SQL Editor (مشروع الدردشة hvrtzzouasqseyswjcex).
-- قابل لإعادة التشغيل — كل ليلة بينضبط الصف على 11:00 → 3:00.
--
-- ⚠️ إصلاح خطأ سابق: الكود الي انكتب قبل كان بيستخدم +24 hours بدل +27،
--    فكانت النافذة تنتهي 12:00 الليل بدل 3:00 الفجر — والنص القصير
--    (سطرين) كان بيستبدل النص الكامل. هاد الملف بيرجّع النص الكامل.
-- =============================================================

DO $$
DECLARE
  -- 23:00 و 03:00 بتوقيت الأردن، محسوبة محلياً (مش UTC)
  v_start timestamptz := ((date_trunc('day', now() AT TIME ZONE 'Asia/Amman') + interval '23 hours') AT TIME ZONE 'Asia/Amman');
  v_end   timestamptz := ((date_trunc('day', now() AT TIME ZONE 'Asia/Amman') + interval '27 hours') AT TIME ZONE 'Asia/Amman');
  v_id    uuid;
  v_text  jsonb;
BEGIN
  -- 1) أغلق أي نافذة مفتوحة الآن
  UPDATE public.broadcasts
  SET visible = false, expires_at = now()
  WHERE kind = 'night' AND expires_at > now();

  -- 2) استرجع النص الكامل الأصلي (أكثر من 5 بلوكات) قبل ما نعدّل الصف
  SELECT content INTO v_text
  FROM public.broadcasts
  WHERE kind = 'night' AND jsonb_array_length(content) > 5
  ORDER BY created_at DESC
  LIMIT 1;

  -- 3) خذ أحدث صف بثّ ليلي
  SELECT id INTO v_id
  FROM public.broadcasts
  WHERE kind = 'night'
  ORDER BY created_at DESC
  LIMIT 1;

  -- 4) انشر النافذة 11:00 → 3:00 بالنص الكامل
  IF v_id IS NULL THEN
    INSERT INTO public.broadcasts (kind, title, content, visible, starts_at, expires_at)
    VALUES ('night', '🌙 وقت النوم', COALESCE(v_text, '[]'::jsonb), true, v_start, v_end);
  ELSE
    UPDATE public.broadcasts
    SET title       = '🌙 وقت النوم',
        content     = COALESCE(v_text, content),
        visible     = true,
        starts_at   = v_start,
        expires_at  = v_end
    WHERE id = v_id;
  END IF;
END $$;

-- تحقّق: لازم تشوف 11:00:00 و 03:00:00 و 29 بلوك
SELECT
  id,
  visible,
  starts_at  AT TIME ZONE 'Asia/Amman' AS "يبدأ (محلي)",
  expires_at AT TIME ZONE 'Asia/Amman' AS "ينتهي (محلي)",
  jsonb_array_length(content)          AS "عدد الأسطر"
FROM public.broadcasts
WHERE kind = 'night'
ORDER BY created_at DESC;
