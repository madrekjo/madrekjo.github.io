-- =========================================================
-- فحص صلاحية الأدمن عبر RPC (يتجاوز RLS على user_roles)
-- + قائمة بكل المستخدمين للأدمن
-- =========================================================

-- 1) حالة الأدمن للحساب الحالي: تعتمد has_role مباشرة
CREATE OR REPLACE FUNCTION public.my_admin_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN jsonb_build_object('is_admin', false, 'user_id', NULL, 'email', NULL);
  END IF;
  RETURN jsonb_build_object(
    'is_admin', public.has_role(uid, 'admin'),
    'user_id', uid,
    'email', (SELECT email FROM auth.users WHERE id = uid)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.my_admin_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_admin_status() TO authenticated;

-- 2) كل الأجهزة/المستخدمين مع الاسم والعدد وال.last_seen
CREATE OR REPLACE FUNCTION public.admin_list_devices(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 100,
  p_offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb; total int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH devices AS (
    SELECT device_id FROM public.device_presence
    UNION
    SELECT device_id FROM public.device_names
    UNION
    SELECT device_id FROM public.posts
    UNION
    SELECT device_id FROM public.comments
    UNION
    SELECT device_id FROM public.blocked_devices
  ), rows AS (
    SELECT
      d.device_id,
      COALESCE(n.name, '')                      AS name,
      COALESCE(nt.label, '')                    AS label,
      COALESCE(al.number, 0)                     AS anon_number,
      COALESCE(sp.cnt, 0)::int                  AS post_count,
      COALESCE(sc.cnt, 0)::int                  AS comment_count,
      COALESCE(cp.cnt, 0)::int                  AS chat_count,
      pr.first_seen, pr.last_seen,
      COALESCE(pr.visits, 0)::int               AS visits,
      EXISTS (SELECT 1 FROM public.blocked_devices b WHERE b.device_id = d.device_id) AS is_blocked,
      EXISTS (SELECT 1 FROM public.admin_devices a WHERE a.device_id = d.device_id)   AS is_admin,
      (SELECT w.message FROM public.device_warnings w WHERE w.device_id = d.device_id) AS warning
    FROM devices d
    LEFT JOIN public.device_names n  ON n.device_id = d.device_id
    LEFT JOIN public.device_notes nt ON nt.device_id = d.device_id
    LEFT JOIN public.device_aliases al ON al.device_id = d.device_id
    LEFT JOIN public.device_presence pr ON pr.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.posts    GROUP BY device_id) sp ON sp.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.comments GROUP BY device_id) sc ON sc.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.chat_posts GROUP BY device_id) cp ON cp.device_id = d.device_id
    WHERE p_search IS NULL
       OR btrim(p_search) = ''
       OR COALESCE(n.name, '') ILIKE '%' || btrim(p_search) || '%'
       OR COALESCE(nt.label, '') ILIKE '%' || btrim(p_search) || '%'
       OR d.device_id ILIKE '%' || btrim(p_search) || '%'
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM rows),
    'rows',  COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY rows.last_seen DESC NULLS LAST)
                        FROM (SELECT * FROM rows ORDER BY rows.last_seen DESC NULLS LAST
                              LIMIT LEAST(GREATEST(p_limit,1),500) OFFSET GREATEST(p_offset,0)) rows), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_devices(text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_devices(text,int,int) TO authenticated;
