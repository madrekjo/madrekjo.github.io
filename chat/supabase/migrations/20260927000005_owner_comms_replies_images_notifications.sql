-- ============================================================================
-- ★ تطوير تواصل المالك مع الفريق (20260927000005):
--   1) ردود ثنائية الاتجاه: الفريق يردّ على رسائل/مهام المالك (parent_id threads)
--   2) صور: المالك (والفريق في الرد) يرفقون صورة
--   3) إشعارات: مخطط المالك يستهدف فئة → كل فرد فيها يتلقى إشعاراً في الجرس،
--      والردّ من الفريق يُشعر المالك
--   4) المهمة: قابلة للتبديل done ⇄ pending (الفريق يعلمها، والمالك يعيد فتحها)
-- آمن إعادة التشغيل (IF NOT EXISTS / DROP POLICY IF EXISTS / OR REPLACE).
-- التنفيذ: Supabase → SQL Editor → New Query → Run
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) أعمدة جديدة
-- ---------------------------------------------------------------------------
ALTER TABLE public.owner_communications
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.owner_communications(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS image_url text CHECK (image_url IS NULL OR char_length(image_url) <= 500);

CREATE INDEX IF NOT EXISTS idx_owner_comms_parent ON public.owner_communications(parent_id);
CREATE INDEX IF NOT EXISTS idx_owner_comms_created ON public.owner_communications(created_at DESC);

-- ---------------------------------------------------------------------------
-- (2) قراءة: المالك يرى الكل + كل فئة ترى رسائلها وردود ثريدها
-- (فترة الرد target_role = target_role الجذر، parent_id يشير للجذر)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "owner comms staff read" ON public.owner_communications;
CREATE POLICY "owner comms staff read" ON public.owner_communications
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR (
      target_role IS NOT NULL AND (
        (target_role IN ('all', 'admin') AND public.has_role(auth.uid(), 'admin'::app_role))
        OR (target_role IN ('all', 'moderator') AND public.has_role(auth.uid(), 'moderator'::app_role))
        OR (target_role IN ('all', 'supervisor') AND public.has_role(auth.uid(), 'supervisor'::app_role))
      )
    )
    OR (
      parent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.owner_communications r
        WHERE r.id = owner_communications.parent_id
          AND (
            (r.target_role IN ('all', 'admin') AND public.has_role(auth.uid(), 'admin'::app_role))
            OR (r.target_role IN ('all', 'moderator') AND public.has_role(auth.uid(), 'moderator'::app_role))
            OR (r.target_role IN ('all', 'supervisor') AND public.has_role(auth.uid(), 'supervisor'::app_role))
          )
      )
    )
  );

GRANT SELECT ON public.owner_communications TO authenticated;

-- ---------------------------------------------------------------------------
-- (3) إرسال رسالة/مهمة — المالك فقط + إشعار لكل المستهدفين
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_owner_communication(
  _kind text,
  _content text,
  _target_role text DEFAULT 'all',
  _image_url text DEFAULT NULL
)
RETURNS public.owner_communications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.owner_communications;
  v_owner uuid := auth.uid();
  v_uid uuid;
BEGIN
  IF NOT public.has_role(v_owner, 'owner'::app_role) THEN
    RAISE EXCEPTION 'إرسال رسائل الفريق حصري للمالك';
  END IF;
  IF _kind NOT IN ('note', 'task') THEN
    RAISE EXCEPTION 'نوع غير صحيح';
  END IF;
  IF _target_role NOT IN ('all', 'admin', 'moderator', 'supervisor') THEN
    RAISE EXCEPTION 'الوجهة غير صحيحة';
  END IF;

  INSERT INTO public.owner_communications (kind, content, image_url, target_role, task_status, created_by)
  VALUES (_kind, NULLIF(trim(_content), ''), NULLIF(trim(_image_url), ''), _target_role,
          CASE WHEN _kind = 'task' THEN 'pending' ELSE NULL END,
          v_owner)
  RETURNING * INTO v_row;

  -- إشعار لكل مستخدم في الفئة المستهدفة
  FOR v_uid IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE (_target_role = 'all' AND ur.role IN ('admin', 'moderator', 'supervisor'))
       OR (_target_role = 'admin' AND ur.role = 'admin')
       OR (_target_role = 'moderator' AND ur.role = 'moderator')
       OR (_target_role = 'supervisor' AND ur.role = 'supervisor')
  LOOP
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (v_uid, v_owner, 'owner_comms');
  END LOOP;

  RETURN v_row;
END $$;

-- ---------------------------------------------------------------------------
-- (4) ردّ من الفريق → المالك (مع صورة اختيارية) + إشعار المالك
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reply_owner_communication(
  _parent_id uuid,
  _content text,
  _image_url text DEFAULT NULL
)
RETURNS public.owner_communications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.owner_communications;
  v_replier uuid := auth.uid();
  v_root public.owner_communications;
BEGIN
  IF public.has_role(v_replier, 'owner'::app_role) THEN
    RAISE EXCEPTION 'الردّ للفريق فقط — المالك يرسل مباشرة';
  END IF;
  IF NOT (public.has_role(v_replier, 'admin'::app_role)
          OR public.has_role(v_replier, 'moderator'::app_role)
          OR public.has_role(v_replier, 'supervisor'::app_role)) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية للردّ';
  END IF;

  SELECT * INTO v_root FROM public.owner_communications WHERE id = _parent_id FOR UPDATE;
  IF NOT FOUND OR v_root.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'الرسالة غير موجودة';
  END IF;

  -- التحقق أن الفرد من ضمن الفئة المستهدفة للجذر
  IF NOT (
    v_root.target_role = 'all'
    OR (v_root.target_role = 'admin' AND public.has_role(v_replier, 'admin'::app_role))
    OR (v_root.target_role = 'moderator' AND public.has_role(v_replier, 'moderator'::app_role))
    OR (v_root.target_role = 'supervisor' AND public.has_role(v_replier, 'supervisor'::app_role))
  ) THEN
    RAISE EXCEPTION 'هذه الرسالة ليست موجّهة لك';
  END IF;

  INSERT INTO public.owner_communications (kind, content, image_url, parent_id, target_role, created_by)
  VALUES ('note', NULLIF(trim(_content), ''), NULLIF(trim(_image_url), ''),
          _parent_id, v_root.target_role, v_replier)
  RETURNING * INTO v_row;

  -- إشعار المالك بالردّ
  IF v_root.created_by IS NOT NULL AND v_root.created_by <> v_replier THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (v_root.created_by, v_replier, 'owner_comms_reply');
  END IF;

  RETURN v_row;
END $$;

-- ---------------------------------------------------------------------------
-- (5) تعليم المهمة ✓ / إلغاء التعليم — الفريق (أو المالك) — تبديل ثنائي
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_owner_task(_id uuid)
RETURNS public.owner_communications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.owner_communications;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_uid, 'owner'::app_role)
          OR public.has_role(v_uid, 'admin'::app_role)
          OR public.has_role(v_uid, 'moderator'::app_role)
          OR public.has_role(v_uid, 'supervisor'::app_role)) THEN
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
    -- إلغاء التعليم: المهمة ترجع معلّقة (للمالك أو من أكملها)
    UPDATE public.owner_communications
       SET task_status = 'pending', done_by = NULL, done_at = NULL
     WHERE id = _id
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.owner_communications
       SET task_status = 'done', done_by = v_uid, done_at = now()
     WHERE id = _id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END $$;

-- ---------------------------------------------------------------------------
-- (6) حذف — المالك فقط (حذف الجذر يمسح الردود تلقائياً ON DELETE CASCADE)
-- ---------------------------------------------------------------------------
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
  DELETE FROM public.owner_communications
   WHERE id = _id OR parent_id = _id;
END $$;

-- ---------------------------------------------------------------------------
-- (7) صلاحيات
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.send_owner_communication(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reply_owner_communication(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_owner_task(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_owner_communication(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.send_owner_communication(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_owner_communication(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_owner_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_owner_communication(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE '✅ تواصل المالك مع الفريق مطوّر: ردود + صور + إشعارات'; END $$;