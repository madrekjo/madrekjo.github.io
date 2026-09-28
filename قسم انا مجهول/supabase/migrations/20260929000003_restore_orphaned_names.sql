-- =========================================================
-- استرجاع الأسماء التي فقدها المستخدمون بعد تغيّر الدومين
-- (ربط الهوية نقل device_id، والاسم بقي مربوطاً بالمعرّف القديم)
--
-- ⚠ نفّذ الجملتين بالترتيب:
--   1) الجملة الأولى: معاينة فقط (لا تغيّر شيئاً) — راجع النتيجة قبل التالي
--   2) الجملة الثانية: الترميم الفعلي
-- =========================================================


-- -------------------------------------------------------------
-- 1) معاينة: من سيسترجع اسمه ومن أي اسم
-- -------------------------------------------------------------
WITH pairs AS (
  SELECT cur.device_id                        AS cur_id,
         dn.device_id                        AS src_id,
         dn.name                             AS src_name,
         count(DISTINCT cs.sig_type)         AS shared
    FROM public.device_signatures cur
    JOIN public.device_signatures cs
      ON cs.sig_value = cur.sig_value
     AND cs.sig_type  = cur.sig_type
     AND cs.sig_type IN ('canvas', 'fp', 'screen')
     AND cs.device_id <> cur.device_id
    JOIN public.device_names dn
      ON dn.device_id = cs.device_id
   WHERE NOT EXISTS (SELECT 1 FROM public.device_names x WHERE x.device_id = cur.device_id)
   GROUP BY cur.device_id, dn.device_id, dn.name
),
best AS (
  SELECT DISTINCT ON (cur_id) cur_id, src_id, src_name, shared
    FROM pairs
   WHERE shared >= 2
   ORDER BY cur_id, shared DESC, src_id
)
SELECT cur_id AS "المعرّف_الحالي", src_id AS "المعرّف_القديم", src_name AS "الاسم_المستعاد", shared AS "عدد_البصمات"
  FROM best
 ORDER BY shared DESC, cur_id;


-- -------------------------------------------------------------
-- 2) الترميم الفعلي (يتجاهل أي جهاز صار له اسم بالفعل)
-- -------------------------------------------------------------
WITH pairs AS (
  SELECT cur.device_id                AS cur_id,
         dn.device_id                AS src_id,
         dn.name                     AS src_name,
         count(DISTINCT cs.sig_type) AS shared
    FROM public.device_signatures cur
    JOIN public.device_signatures cs
      ON cs.sig_value = cur.sig_value
     AND cs.sig_type  = cur.sig_type
     AND cs.sig_type IN ('canvas', 'fp', 'screen')
     AND cs.device_id <> cur.device_id
    JOIN public.device_names dn
      ON dn.device_id = cs.device_id
   WHERE NOT EXISTS (SELECT 1 FROM public.device_names x WHERE x.device_id = cur.device_id)
   GROUP BY cur.device_id, dn.device_id, dn.name
),
best AS (
  SELECT DISTINCT ON (cur_id) cur_id, src_name
    FROM pairs
   WHERE shared >= 2
   ORDER BY cur_id, shared DESC, src_id
)
INSERT INTO public.device_names(device_id, name)
SELECT cur_id, src_name FROM best
ON CONFLICT (device_id) DO NOTHING;
