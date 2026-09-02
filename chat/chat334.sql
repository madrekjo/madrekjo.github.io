-- ============================================================================
-- ★ ملف chat334 — إصلاح نظام مراجعة منشورات "الجميع" ★
-- آخر تحديث: 2026-09-03
-- شغّلها من: Supabase → SQL Editor → New Query → Paste → Run
--
-- يجب تشغيل chat333 أولاً ثم chat334 بعده (334 يعتمد على عمود status/triggers).
--
-- يحتوي هذا الملف على:
--   [1] إعادة بناء trigger المراجعة بطريقة أكثر موثوقية (يعمل أيضاً إذا channel NULL)
--   [2] دالة RPC `get_pending_posts` آمنة لجلب المنشورات المعلّقة للأدمن/المشرف
--   [3] دالة RPC `approve_post` آمنة للموافقة
--   [4] دالة RPC `reject_post` آمنة للرفض/الحذف
--   [5] إضافة عمودي reviewed_by / reviewed_at إن لم وجدا + فهرس
-- ============================================================================


-- ============================================================================
-- [1] إعادة بناء الـ trigger الأساسي بطريقة أكثر موثوقية
-- ----------------------------------------------------------------------------
-- (يعمل على INSERT ويسند pending فقط لمنشورات "الجميع" من غير الأدمن/المشرف)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_post_review_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.channel = 'all' OR NEW.channel IS NULL)
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.has_role(auth.uid(), 'moderator'::app_role) THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_post_review_status ON public.posts;
CREATE TRIGGER trg_set_post_review_status
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_post_review_status();


-- ============================================================================
-- [2] دالة RPC آمنة: جلب المنشورات المعلّقة (للأدمن/المشرف فقط)
-- ----------------------------------------------------------------------------
-- تعمل بـ SECURITY DEFINER بحيث تتجاوز أي قيود RLS أو اختلافات في أسماء
-- القيود/العلاقات، وتُعيد فقط المنشورات المعلّقة مع بيانات صاحبها.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_pending_posts()
RETURNS TABLE (
  id uuid,
  content text,
  image_url text,
  image_urls text[],
  video_url text,
  user_id uuid,
  created_at timestamptz,
  status text,
  author_full_name text,
  author_avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- الاتصال مسموح فقط على حساب الأدمن/المشرف
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.content,
    p.image_url,
    p.image_urls,
    p.video_url,
    p.user_id,
    p.created_at,
    p.status,
    pr.full_name,
    pr.avatar_url
  FROM public.posts p
  LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE p.deleted_at IS NULL
    AND p.status = 'pending'
  ORDER BY p.created_at DESC;
END;
$$;


-- ============================================================================
-- [3] دالة RPC آمنة: موافقة الأدمن/المشرف على منشور معلّق
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.posts
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_post_id
    AND status = 'pending';
END;
$$;


-- ============================================================================
-- [4] دالة RPC آمنة: رفض منشور معلّق من الأدمن/المشرف (حذف نهائي)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reject_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- حذف نهائي للمنشور المُرفَض (لم يُنشر بعد أصلاً)
  DELETE FROM public.posts WHERE id = p_post_id AND status = 'pending';
END;
$$;


-- ============================================================================
-- [5] إضافة عمودي reviewed_by / reviewed_at إن لم وجدا + فهرس
-- ============================================================================
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_posts_reviewed ON public.posts(reviewed_by);


-- ============================================================================
-- ★ نهاية ملف chat334 ★
-- ============================================================================