-- ============================================================================
-- ★ ملف chat333 — إضافات قاعدة بيانات الدردشة ★
-- آخر تحديث: 2026-09-02
-- شغّلها من: Supabase → SQL Editor → New Query → Paste → Run
--
-- يحتوي على:
--   [1] مراجعة منشورات قناة "الجميع" (موافقة الأدمن)
--   [2] عمود status لمنشورات posts
--   [3] المزيد من الإضافات الناقصة إن وُجدت
-- ============================================================================


-- ============================================================================
-- [1] نظام مراجعة منشورات قناة "الجميع" (Pending → Approved)
-- ----------------------------------------------------------------------------
-- أي منشور في قناة "الجميع" من مستخدم عادي (غير أدمن/مشرف)
-- يبدأ بحالة pending ولا يظهر للجميع حتى يوافق عليه الأدمن أو المشرف.
-- ============================================================================

-- 1.1) إضافة عمود الحالة للمنشورات
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected'));

-- 1.2) Trigger: منشورات "الجميع" من مستخدمين عاديين تبدأ pending
CREATE OR REPLACE FUNCTION public.set_post_review_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.channel = 'all'
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

-- 1.3) Trigger: منع المستخدمين العاديين من تغيير الحالة بأنفسهم
--      (فقط الأدمن/المشرف يمكنه الموافقة أو الرفض)
CREATE OR REPLACE FUNCTION public.guard_post_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.has_role(auth.uid(), 'moderator'::app_role) THEN
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_post_status ON public.posts;
CREATE TRIGGER trg_guard_post_status
  BEFORE UPDATE OF status ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_post_status();

-- 1.4) فهرس لتحسين جلب المنشورات المعلّقة (لقائمة مراجعة الأدمن)
CREATE INDEX IF NOT EXISTS idx_posts_status ON public.posts(status) WHERE deleted_at IS NULL;

-- 1.5) سياسة RLS إضافية: الأدمن/المشرف فقط يمكنهم تحديث حقل status
--      (إن لم تكن معرفة من قبل — سطر آمن يضاف مرة واحدة)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'posts'
      AND policyname = 'Staff review post status'
  ) THEN
    CREATE POLICY "Staff review post status"
      ON public.posts FOR UPDATE TO authenticated
      USING (auth.uid() = user_id
             OR public.has_role(auth.uid(),'admin'::app_role)
             OR public.has_role(auth.uid(),'moderator'::app_role))
      WITH CHECK (auth.uid() = user_id
             OR public.has_role(auth.uid(),'admin'::app_role)
             OR public.has_role(auth.uid(),'moderator'::app_role));
  END IF;
END $$;


-- ============================================================================
-- ★ نهاية ملف chat333 ★
-- ============================================================================
