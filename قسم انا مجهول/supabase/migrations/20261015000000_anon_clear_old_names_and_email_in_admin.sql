-- ============================================================================
-- «أنا مجهول» — مسح الأسماء القديمة + قائمة الحسابات (auth.users) في لوحة الأدمن
-- يُنفَّذ يدويًا في SQL Editor لمشروع: jmucsccdxxizvqtkyieq
--
-- الخلفية:
--   الهوية انتقلت إلى الحساب/الإيميل. تبويب «المستخدمون» كان يبني القائمة من
--   الأجهزة (admin_list_devices + device_names) فلا يُظهر إيميلات. هنا:
--     [A] نسخة احتياطية ثم مسح اسماء النظام القديم (device_names). ← آمن (لا حظر)
--     [B] دالة admin_list_users تجيب الحسابات مباشرة من auth.users مع عدّادات
--         المنشورات/التعليقات/الشات (ربط author_email) وأجهزة كل حساب.
-- ============================================================================

-- ============================================================================
-- [A] نسخة احتياطية ثم مسح الأسماء القديمة
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.device_names_backup_20261015 AS
  SELECT * FROM public.device_names;

-- SELECT count(*) AS "في النسخة الاحتياطية" FROM public.device_names_backup_20261015;

DELETE FROM public.device_names;

-- ============================================================================
-- [B] قائمة الحسابات (auth.users)
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_list_users(text,int,int,text);

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT NULL, p_limit int DEFAULT 100, p_offset int DEFAULT 0,
  p_sort   text DEFAULT 'new'
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

  WITH agg AS (
    SELECT lower(btrim(author_email)) AS email, device_id, 'post'    AS kind
      FROM public.posts        WHERE author_email IS NOT NULL AND btrim(author_email) <> ''
    UNION ALL
    SELECT lower(btrim(author_email)), device_id, 'comment'
      FROM public.comments     WHERE author_email IS NOT NULL AND btrim(author_email) <> ''
    UNION ALL
    SELECT lower(btrim(author_email)), device_id, 'chat'
      FROM public.chat_posts   WHERE author_email IS NOT NULL AND btrim(author_email) <> ''
    UNION ALL
    SELECT lower(btrim(author_email)), device_id, 'chat'
      FROM public.chat_comments WHERE author_email IS NOT NULL AND btrim(author_email) <> ''
  ), accounts AS (
    SELECT u.id AS user_id, u.email, u.created_at, u.last_sign_in_at,
      COALESCE(array_agg(DISTINCT a.device_id) FILTER (WHERE a.device_id IS NOT NULL), '{}') AS devices,
      count(*) FILTER (WHERE a.kind = 'post')::int    AS post_count,
      count(*) FILTER (WHERE a.kind = 'comment')::int AS comment_count,
      count(*) FILTER (WHERE a.kind = 'chat')::int    AS chat_count
    FROM auth.users u
    LEFT JOIN agg a ON a.email = lower(btrim(u.email))
    GROUP BY u.id, u.email, u.created_at, u.last_sign_in_at
  ), rows AS (
    SELECT ac.*,
      EXISTS (SELECT 1 FROM public.user_roles r
               WHERE r.user_id = ac.user_id AND r.role = 'admin')            AS is_admin,
      EXISTS (SELECT 1 FROM public.blocked_devices b
               WHERE b.device_id = ANY(ac.devices) AND b.ban_status = 'ACTIVE') AS is_blocked
    FROM accounts ac
    WHERE p_search IS NULL OR btrim(p_search) = ''
       OR ac.email ILIKE '%' || btrim(p_search) || '%'
  ), sorted AS (
    SELECT * FROM rows
    ORDER BY
      CASE WHEN p_sort = 'old' THEN created_at END ASC  NULLS LAST,
      CASE WHEN p_sort <> 'old' THEN created_at END DESC NULLS LAST
    LIMIT LEAST(GREATEST(p_limit,1),500) OFFSET GREATEST(p_offset,0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM rows),
    'rows',  COALESCE((SELECT jsonb_agg(to_jsonb(sorted)) FROM sorted), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users(text,int,int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text,int,int,text) TO authenticated;

-- للتحقق بعد التنفيذ:
-- SELECT public.admin_list_users(NULL, 5, 0, 'new');
-- للاسترجاع عند الحاجة:
-- INSERT INTO public.device_names SELECT * FROM public.device_names_backup_20261015 ON CONFLICT (device_id) DO NOTHING;
