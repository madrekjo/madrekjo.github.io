-- ============================================================================
-- «أنا مجهول» — إزالة الأسماء القديمة (نظام الجهاز) + إظهار الإيميل في لوحة الأدمن
-- يُنفَّذ يدويًا في SQL Editor لمشروع: jmucsccdxxizvqtkyieq
--
-- الخلفية:
--   انتقلت الهوية إلى الحساب/الإيميل (author_email). بقيت أسماء النظام الجهازي
--   القديم في public.device_names (أسماء اختارها المستخدمون سابقًا) وتظهر للأدمن.
--   هذا الملف:
--     [A] يعمل نسخة احتياطية ثم يمسح device_names.  ← قابل للاسترجاع من النسخة
--     [B] يحدّث admin_list_devices ليرجّع إيميل/إيميلات كل مستخدم + بحث بالإيميل.
--
-- ملاحظة: device_names لا تدخل في أي منطق حظر/نقاط — عرض للأدمن فقط، وحذفها آمن.
-- ============================================================================

-- ============================================================================
-- [A] نسخة احتياطية ثم مسح الأسماء القديمة
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.device_names_backup_20261015 AS
  SELECT * FROM public.device_names;

-- راجع العدد قبل/بعد (اختياري):
-- SELECT count(*) AS "في النسخة الاحتياطية" FROM public.device_names_backup_20261015;
-- SELECT count(*) AS "في الجدول الأصلي"     FROM public.device_names;

DELETE FROM public.device_names;

-- ============================================================================
-- [B] دالة لوحة الأدمن: تُرجِع emails (من محتوى المستخدم) + تبحث بها
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_list_devices(text,int,int,text);

CREATE OR REPLACE FUNCTION public.admin_list_devices(
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

  WITH devices AS (
    SELECT device_id FROM public.device_presence
    UNION SELECT device_id FROM public.device_names
    UNION SELECT device_id FROM public.device_aliases
    UNION SELECT device_id FROM public.posts
    UNION SELECT device_id FROM public.comments
    UNION SELECT device_id FROM public.blocked_devices
  ), emails AS (
    SELECT device_id,
           array_agg(DISTINCT author_email) FILTER (WHERE btrim(coalesce(author_email,'')) <> '') AS emails
      FROM (
        SELECT device_id, author_email FROM public.posts
        UNION ALL SELECT device_id, author_email FROM public.comments
        UNION ALL SELECT device_id, author_email FROM public.chat_posts
        UNION ALL SELECT device_id, author_email FROM public.chat_comments
      ) t
     GROUP BY device_id
  ), rows AS (
    SELECT
      d.device_id,
      COALESCE(n.name, '')                      AS name,
      COALESCE(em.emails, ARRAY[]::text[])      AS emails,
      COALESCE(nt.label, '')                    AS label,
      COALESCE(al.number, 0)                     AS anon_number,
      COALESCE(sp.cnt, 0)::int                  AS post_count,
      COALESCE(sc.cnt, 0)::int                  AS comment_count,
      COALESCE(cp.cnt, 0)::int                  AS chat_count,
      pr.first_seen, pr.last_seen,
      COALESCE(pr.visits, 0)::int               AS visits,
      EXISTS (SELECT 1 FROM public.blocked_devices b
               WHERE b.device_id = d.device_id AND b.ban_status = 'ACTIVE') AS is_blocked,
      (SELECT b.ban_status FROM public.blocked_devices b WHERE b.device_id = d.device_id
        ORDER BY b.created_at DESC LIMIT 1)                                AS ban_status,
      (SELECT b.confidence_score FROM public.blocked_devices b WHERE b.device_id = d.device_id
        ORDER BY b.created_at DESC LIMIT 1)                                AS ban_score,
      (SELECT b.requires_review FROM public.blocked_devices b WHERE b.device_id = d.device_id
        ORDER BY b.created_at DESC LIMIT 1)                                AS ban_needs_review,
      EXISTS (SELECT 1 FROM public.ban_challenges c
               WHERE c.device_id = d.device_id AND c.status = 'OPEN')       AS is_challenged,
      EXISTS (SELECT 1 FROM public.admin_devices a WHERE a.device_id = d.device_id) AS is_admin,
      (SELECT w.message FROM public.device_warnings w WHERE w.device_id = d.device_id) AS warning
    FROM devices d
    LEFT JOIN public.device_names n  ON n.device_id = d.device_id
    LEFT JOIN public.device_notes nt ON nt.device_id = d.device_id
    LEFT JOIN public.device_aliases al ON al.device_id = d.device_id
    LEFT JOIN public.device_presence pr ON pr.device_id = d.device_id
    LEFT JOIN emails em ON em.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.posts    GROUP BY device_id) sp ON sp.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.comments GROUP BY device_id) sc ON sc.device_id = d.device_id
    LEFT JOIN (SELECT device_id, count(*) cnt FROM public.chat_posts GROUP BY device_id) cp ON cp.device_id = d.device_id
    WHERE p_search IS NULL OR btrim(p_search) = ''
       OR COALESCE(n.name, '') ILIKE '%' || btrim(p_search) || '%'
       OR COALESCE(nt.label, '') ILIKE '%' || btrim(p_search) || '%'
       OR d.device_id ILIKE '%' || btrim(p_search) || '%'
       OR array_to_string(COALESCE(em.emails, ARRAY[]::text[]), ' ') ILIKE '%' || btrim(p_search) || '%'
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

-- للتحقق بعد التنفيذ:
-- SELECT public.admin_list_devices(NULL, 5, 0, 'new');
-- للاسترجاع عند الحاجة:
-- INSERT INTO public.device_names SELECT * FROM public.device_names_backup_20261015 ON CONFLICT (device_id) DO NOTHING;
