-- =========================================================
-- استرجاع الأسماء التي فقدها المستخدمون بعد تغيّر الدومين:
-- ربط الهوية نقل device_id، والاسم بقي مربوطاً بالمعرّف القديم.
-- هنا نبحث عن أي جهاز يطابقه (canvas/fp/screen) وله اسم،
-- فننقل الاسم إلى المعرّف الحالي إن كان nameless.
-- آمن للتكرار، ولا يحذف شيئاً.
-- =========================================================

-- 1) المعرّفات التي-match جهازاً له اسم
CREATE TEMP TABLE _fix_src AS
SELECT DISTINCT
       cur.device_id AS cur_id,
       (SELECT dn.device_id
          FROM public.device_names dn
         WHERE dn.device_id <> cur.device_id
         ORDER BY dn.updated_at DESC NULLS LAST
         LIMIT 1) AS src_id
  FROM public.device_signatures cur
 WHERE NOT EXISTS (SELECT 1 FROM public.device_names x WHERE x.device_id = cur.device_id)
   AND EXISTS (
     SELECT 1
       FROM public.device_signatures other
       JOIN public.device_names dn2 ON dn2.device_id = other.device_id
      WHERE other.device_id <> cur.device_id
        AND other.sig_type IN ('canvas', 'fp', 'screen')
        AND EXISTS (
          SELECT 1 FROM public.device_signatures c2
           WHERE c2.device_id = cur.device_id
             AND c2.sig_type = other.sig_type
             AND c2.sig_value = other.sig_value
        )
   );

-- 2) نقول الاسم
INSERT INTO public.device_names(device_id, name)
SELECT f.cur_id, dn.name
  FROM _fix_src f
  JOIN public.device_names dn ON dn.device_id = f.src_id
 WHERE f.src_id IS NOT NULL
ON CONFLICT (device_id) DO NOTHING;

DROP TABLE IF EXISTS _fix_src;
