-- =========================================================
-- ترقيم كل المستخدمين من الأقدم للأحدث + الترتيب في قائمة الأدمن
-- =========================================================

-- 1) ترقيم الأجهزة التي لا يوجد لها رقم (لم تنشر بعد) — تكملة للتسلسل,
--    فتبقى الأرقام متسلسلة زمنياً WITHOUT ما تتغير أرقام المنشورات القديمة
DO $$
DECLARE missing int;
BEGIN
  WITH known AS (
    SELECT device_id, MIN(created_at) AS first_at FROM (
      SELECT device_id, first_seen AS created_at FROM public.device_presence
      UNION ALL
      SELECT device_id, created_at             FROM public.device_names
      UNION ALL
      SELECT device_id, created_at             FROM public.admin_devices
      UNION ALL
      SELECT device_id, created_at             FROM public.blocked_devices
      UNION ALL
      SELECT device_id, created_at             FROM public.posts
    ) x GROUP BY device_id
  ), ordered AS (
    SELECT k.device_id
    FROM known k
    LEFT JOIN public.device_aliases a ON a.device_id = k.device_id
    WHERE a.device_id IS NULL
    ORDER BY k.first_at ASC NULLS LAST, k.device_id
  )
  INSERT INTO public.device_aliases (device_id)
  SELECT device_id FROM ordered
  ON CONFLICT (device_id) DO NOTHING;

  GET DIAGNOSTICS missing = ROW_COUNT;
  RAISE NOTICE 'تم ترقيم % جهاز جديد', missing;
END $$;

-- 2) قائمة الأدمن: مع خيار ترتيب (new / old / num)
DROP FUNCTION IF EXISTS public.admin_list_devices(text,int,int);

CREATE OR REPLACE FUNCTION public.admin_list_devices(
  p_search text  DEFAULT NULL,
  p_limit  int   DEFAULT 100,
  p_offset int   DEFAULT 0,
  p_sort   text  DEFAULT 'new'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH devices AS (
    SELECT device_id FROM public.device_presence
    UNION
    SELECT device_id FROM public.device_names
    UNION
    SELECT device_id FROM public.device_aliases
    UNION
    SELECT device_id FROM public.posts
    UNION
    SELECT device_id FROM public.comments
    UNION
    SELECT device_id FROM public.blocked_devices
  ), rows AS (
    SELECT
      d.device_id,
      COALESCE(n.name, '')           AS name,
      COALESCE(nt.label, '')         AS label,
      COALESCE(al.number, 0)         AS anon_number,
      COALESCE(sp.cnt, 0)::int       AS post_count,
      COALESCE(sc.cnt, 0)::int       AS comment_count,
      COALESCE(cp.cnt, 0)::int       AS chat_count,
      pr.first_seen, pr.last_seen, pr.visits,
      EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = d.device_id) AS is_blocked,
      EXISTS (SELECT 1 FROM public.admin_devices a WHERE a.device_id = d.device_id)   AS is_admin,
      (SELECT w.message FROM public.device_warnings w WHERE w.device_id = d.device_id) AS warning
    FROM devices d
    LEFT JOIN public.device_names n   ON n.device_id = d.device_id
    LEFT JOIN public.device_notes nt  ON nt.device_id = d.device_id
    LEFT JOIN public.device_aliases al ON al.device_id = d.device_id
    LEFT JOIN public.device_presence pr ON pr.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.posts    GROUP BY device_id) sp ON sp.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.comments GROUP BY device_id) sc ON sc.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.chat_posts GROUP BY device_id) cp ON cp.device_id = d.device_id
    WHERE p_search IS NULL
       OR btrim(p_search) = ''
       OR COALESCE(n.name, '')  ILIKE '%' || btrim(p_search) || '%'
       OR COALESCE(nt.label, '') ILIKE '%' || btrim(p_search) || '%'
       OR d.device_id ILIKE '%' || btrim(p_search) || '%'
  ), sorted AS (
    SELECT * FROM rows
    ORDER BY
      CASE WHEN p_sort = 'old' THEN COALESCE(first_seen, 'epoch'::timestamptz) END ASC NULLS LAST,
      CASE WHEN p_sort = 'num' THEN anon_number END ASC NULLS LAST,
      last_seen DESC NULLS LAST
    LIMIT LEAST(GREATEST(p_limit,1),500) OFFSET GREATEST(p_offset,0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM rows),
    'rows',  COALESCE((SELECT jsonb_agg(to_jsonb(sorted)) FROM sorted), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_devices(text,int,int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_devices(text,int,int,text) TO authenticated;
