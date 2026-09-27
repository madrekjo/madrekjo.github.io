-- سقف زمني لتنبيه النوم: يعرض حتى الساعة 3 فجراً فقط (بتوقيت عمّان).
-- التنفيذ: بعد ترحيل 20260927000009 (يتطلب عمود kind). يدوياً من المالك.

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- بث النوم الحالي: يبدأ الآن وينتهي 03:00 من القادم (Asia/Amman).
UPDATE public.broadcasts
SET starts_at = now(),
    expires_at = (date_trunc('day', timezone('Asia/Amman', now()))
                  + interval '1 day' + interval '3 hours') AT TIME ZONE 'Asia/Amman'
WHERE kind = 'night';