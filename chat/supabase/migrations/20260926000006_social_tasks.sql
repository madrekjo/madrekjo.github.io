-- ============================================================================
-- ★ مهام السوشيال ميديا (social_tasks) — شغّله بعد 20260926000005 ★
-- Supabase → SQL Editor → New Query → Paste → Run
--
-- دورة الحياة:
--   pending   → المالك/الأدمن يكتب المهمة
--   done      → social_admin علّم (✓) عليها + رابط المنشور
--   verified  → المالك راجعها وصدّقها
--   rejected  → المالك راجعها ورفضها (+ سبب)
--
-- الدخول: owner/admin/moderator/supervisor/social_admin يرون المهام.
-- صلاحيات:
--   إنشاء المهمة       → owner / admin / moderator / supervisor
--   تعليم ✓ + الرابط   → social_admin أو أي عضو طاقم (المنفذ يُسجَّل)
--   تصديق / رفض        → owner / admin / moderator (المالك بالأساس)
--   حذف المهمة         → owner / admin / moderator
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.social_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  details text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'verified', 'rejected')),
  proof_link text,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  done_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  reject_reason text
);

ALTER TABLE public.social_tasks ENABLE ROW LEVEL SECURITY;

-- القراءة: لطاقم الإدارة + مسؤول السوشيال ميديا فقط
DROP POLICY IF EXISTS "social tasks staff read" ON public.social_tasks;
CREATE POLICY "social tasks staff read" ON public.social_tasks
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'social_admin'::app_role)
  );

-- لا INSERT/UPDATE/DELETE مباشرة — الكل عبر الدوال أدناه حصراً

GRANT SELECT ON public.social_tasks TO authenticated;

-- ============================================================================
-- [أ] إنشاء مهمة (owner/admin/moderator/supervisor)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_social_task(_title text, _details text DEFAULT NULL)
RETURNS public.social_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.social_tasks;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role)
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)
          OR public.has_role(auth.uid(), 'supervisor'::app_role)) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية إنشاء مهمة';
  END IF;

  INSERT INTO public.social_tasks (title, details, created_by)
  VALUES (NULLIF(trim(_title), ''), NULLIF(trim(_details), ''), auth.uid())
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- ============================================================================
-- [ب] تعليم ✓ على المهمة مع رابط المنشور (social_admin/طاقم — المنفذ يُسجَّل)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_social_task(_task_id uuid, _proof_link text DEFAULT NULL)
RETURNS public.social_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.social_tasks;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role)
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)
          OR public.has_role(auth.uid(), 'supervisor'::app_role)
          OR public.has_role(auth.uid(), 'social_admin'::app_role)) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعليم المهمة';
  END IF;

  SELECT * INTO v_row FROM public.social_tasks WHERE id = _task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المهمة غير موجودة';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'المهمة قد أُنهيت مسبقاً';
  END IF;

  UPDATE public.social_tasks
     SET status = 'done', done_by = auth.uid(), done_at = now(),
         proof_link = NULLIF(trim(COALESCE(_proof_link, '')), ''),
         verified_by = NULL, verified_at = NULL, reject_reason = NULL
   WHERE id = _task_id
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- ============================================================================
-- [ج] تصديق / رفض المهمة (owner/admin/moderator — المالك يتأكد فعلياً)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_social_task(_task_id uuid, _approved boolean, _reason text DEFAULT NULL)
RETURNS public.social_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.social_tasks;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role)
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تصديق المهمة';
  END IF;

  SELECT * INTO v_row FROM public.social_tasks WHERE id = _task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المهمة غير موجودة';
  END IF;

  IF v_row.status <> 'done' THEN
    RAISE EXCEPTION 'لا يمكن التصديق إلا على مهمة معلَّمة ✓';
  END IF;

  IF _approved THEN
    UPDATE public.social_tasks
       SET status = 'verified', verified_by = auth.uid(), verified_at = now()
     WHERE id = _task_id
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.social_tasks
       SET status = 'rejected', verified_by = auth.uid(), verified_at = now(),
           reject_reason = NULLIF(trim(_reason), '')
     WHERE id = _task_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END $$;

-- ============================================================================
-- [د] حذف مهمة (owner/admin/moderator)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_social_task(_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role)
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية حذف المهمة';
  END IF;

  DELETE FROM public.social_tasks WHERE id = _task_id;
END $$;

REVOKE ALL ON FUNCTION public.create_social_task(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_social_task(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_social_task(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_social_task(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_social_task(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_social_task(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_social_task(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_social_task(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE '✅ تم تفعيل مهام السوشيال ميديا (social_tasks)'; END $$;