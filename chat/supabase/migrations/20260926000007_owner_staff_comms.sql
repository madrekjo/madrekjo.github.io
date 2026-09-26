-- ============================================================================
-- ★ تواصل المالك مع فريق الإدارة (رسائل + مهام) — owner_communications ★
-- Supabase → SQL Editor → New Query → Paste → Run
--
-- المالك يكتب رسالة أو يكلّف مهمة، ويختار وجهتها:
--   الكل (all) / الأدمن (admin) / المشرفين (moderator) / المسؤولين (supervisor)
-- الفريق المستهدف يقرأها داخل لوحة الإدارة (تبويب «تواصل الفريق»).
-- المهام: يعلّم الفريق ✓ عند الإنجاز، وللمالك تصديق/حذف.
--
-- الحماية: الإنشاء/الحذف للمالك فقط؛ القراءة للمالك + الفئة المستهدفة فقط.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.owner_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('note', 'task')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  target_role text NOT NULL DEFAULT 'all'
    CHECK (target_role IN ('all', 'admin', 'moderator', 'supervisor')),
  task_status text CHECK (task_status IN ('pending', 'done')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  done_at timestamptz
);

ALTER TABLE public.owner_communications ENABLE ROW LEVEL SECURITY;

-- القراءة: المالك (كل الرسائل) + الفئة/الفئات المستهدفة
DROP POLICY IF EXISTS "owner comms staff read" ON public.owner_communications;
CREATE POLICY "owner comms staff read" ON public.owner_communications
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR (target_role IN ('all', 'admin') AND public.has_role(auth.uid(), 'admin'::app_role))
    OR (target_role IN ('all', 'moderator') AND public.has_role(auth.uid(), 'moderator'::app_role))
    OR (target_role IN ('all', 'supervisor') AND public.has_role(auth.uid(), 'supervisor'::app_role))
  );

-- لا INSERT/UPDATE/DELETE مباشرة — حصراً عبر الدوال أدناه

GRANT SELECT ON public.owner_communications TO authenticated;

-- [أ] إرسال رسالة أو مهمة — حصري للمالك
CREATE OR REPLACE FUNCTION public.send_owner_communication(_kind text, _content text, _target_role text DEFAULT 'all')
RETURNS public.owner_communications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.owner_communications;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'إرسال رسائل الفريق حصري للمالك';
  END IF;
  IF _kind NOT IN ('note', 'task') THEN
    RAISE EXCEPTION 'نوع غير صحيح';
  END IF;
  IF _target_role NOT IN ('all', 'admin', 'moderator', 'supervisor') THEN
    RAISE EXCEPTION 'الوجهة غير صحيحة';
  END IF;

  INSERT INTO public.owner_communications (kind, content, target_role, task_status, created_by)
  VALUES (_kind, NULLIF(trim(_content), ''), _target_role,
          CASE WHEN _kind = 'task' THEN 'pending' ELSE NULL END,
          auth.uid())
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- [ب] تعليم المهمة ✓ — الفريق المستهدف (أو المالك)
CREATE OR REPLACE FUNCTION public.complete_owner_task(_id uuid)
RETURNS public.owner_communications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.owner_communications;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role)
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)
          OR public.has_role(auth.uid(), 'supervisor'::app_role)) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية';
  END IF;

  SELECT * INTO v_row FROM public.owner_communications WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنشور غير موجود';
  END IF;
  IF v_row.kind <> 'task' THEN
    RAISE EXCEPTION 'هذا ليس مهمة';
  END IF;
  IF v_row.task_status = 'done' THEN
    RAISE EXCEPTION 'المهمة أُنجزت مسبقاً';
  END IF;

  UPDATE public.owner_communications
     SET task_status = 'done', done_by = auth.uid(), done_at = now()
   WHERE id = _id
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- [ج] حذف — للمالك فقط
CREATE OR REPLACE FUNCTION public.delete_owner_communication(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'حذف رسائل الفريق حصري للمالك';
  END IF;
  DELETE FROM public.owner_communications WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.send_owner_communication(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_owner_task(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_owner_communication(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.send_owner_communication(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_owner_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_owner_communication(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE '✅ تم تفعيل تواصل المالك مع الفريق (owner_communications)'; END $$;