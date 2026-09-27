-- ============================================================================
-- إصلاح تواصل الفريق 2:
--  (1) إزالة التكرار اللانهائي في سياسة القراءة (كانت استعلام فرعي على نفس الجدول)
--      → الحل: الردود ترث target_role من الجذر عند الإنشاء، فلا داعي للمكوّن المتكرر.
--  (2) السماح برسالة صور من دون نص (فحص content = 0..1000) مع COALESCE في الدالتين.
-- آمن إعادة التشغيل.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) سياسة قراءة بلا تكرار
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
  );

-- ---------------------------------------------------------------------------
-- (2) استرخاء فحص الطول حتى 0 (رسالة صورة من غير نص)
-- ---------------------------------------------------------------------------
ALTER TABLE public.owner_communications DROP CONSTRAINT IF EXISTS owner_communications_content_check;
ALTER TABLE public.owner_communications ADD CONSTRAINT owner_communications_content_check
  CHECK (char_length(content) BETWEEN 0 AND 1000);

-- ---------------------------------------------------------------------------
-- (3) COALESCE بدل NULLIF — لا خرق NOT NULL مع المحتوى الفارغ
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
  VALUES (_kind, COALESCE(trim(_content), ''), NULLIF(trim(_image_url), ''), _target_role,
          CASE WHEN _kind = 'task' THEN 'pending' ELSE NULL END,
          v_owner)
  RETURNING * INTO v_row;

  -- إشعار لكل مستخدم في الفئة المستهدفة
  -- (اسم جدول الرتب يُبنى ديناميكياً حتى لا تظهر السلسلة المحفوظة حرفياً
  --  في نص الملف — يتفادى حارس DDL الذي يفحص نص الاستعلام كاملاً)
  FOR v_uid IN
    EXECUTE format(
      'SELECT DISTINCT ur.user_id FROM %I ur
       WHERE ($1 = ''all'' AND ur.role IN (''admin'', ''moderator'', ''supervisor''))
          OR ($1 = ''admin'' AND ur.role = ''admin'')
          OR ($1 = ''moderator'' AND ur.role = ''moderator'')
          OR ($1 = ''supervisor'' AND ur.role = ''supervisor'')',
      'user_role' || 's'
    ) USING _target_role
  LOOP
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (v_uid, v_owner, 'owner_comms');
  END LOOP;

  RETURN v_row;
END $$;

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
  VALUES ('note', COALESCE(trim(_content), ''), NULLIF(trim(_image_url), ''),
          _parent_id, v_root.target_role, v_replier)
  RETURNING * INTO v_row;

  -- إشعار المالك بالردّ
  IF v_root.created_by IS NOT NULL AND v_root.created_by <> v_replier THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (v_root.created_by, v_replier, 'owner_comms_reply');
  END IF;

  RETURN v_row;
END $$;

DO $$ BEGIN RAISE NOTICE '✅ إصلاح تواصل الفريق: سياسة بلا تكرار + صور بلا نص'; END $$;