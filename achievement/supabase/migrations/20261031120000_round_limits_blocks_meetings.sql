-- ============================================================================
-- الإنجاز: حدود الجولات + منع المستخدم (تايم أوت) + قسم الاجتماعات
--
-- يُنفَّذ يدويًا مرة واحدة:
--   Supabase Dashboard → SQL Editor  (مشروع الإنجاز: itflhfhsfzrdfpxvlzrv)
--   الصق المحتوى كاملًا واضغط RUN.
-- آمن لإعادة التشغيل (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- [1] حدود الجولات
--   * 3 جولات نشطة كحد أقصى لكل منشئ.
--   * 3 جولات كل 24 ساعة لكل منشئ.
--   * الجميع يستطيع إنشاء جولات (يُلغى شرط round_creators).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authorized users can create rounds" ON public.rounds;
DROP POLICY IF EXISTS "Authenticated users can create rounds" ON public.rounds;
CREATE POLICY "Authenticated users can create rounds"
  ON public.rounds FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE OR REPLACE FUNCTION public.enforce_round_limits()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_active  integer;
  v_recent  integer;
BEGIN
  -- منع المستخدم (تايم أوت) يوقف إنشاء الجولات أيضًا
  IF EXISTS (
    SELECT 1 FROM public.achievement_blocks b
    WHERE b.user_id = NEW.creator_id AND b.blocked_until > now()
  ) THEN
    RAISE EXCEPTION 'تم منعك من إنشاء الجولات حتى انتهاء مدة المنع';
  END IF;

  SELECT count(*) INTO v_active
  FROM public.rounds
  WHERE creator_id = NEW.creator_id
    AND status = 'active'
    AND ends_at > now();

  IF v_active >= 3 THEN
    RAISE EXCEPTION 'لديك 3 جولات نشطة بالفعل — انتظر انتهاء إحداها';
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.rounds
  WHERE creator_id = NEW.creator_id
    AND created_at > now() - interval '24 hours';

  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'يمكنك إنشاء 3 جولات كل 24 ساعة فقط';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_round_limits ON public.rounds;
CREATE TRIGGER trg_enforce_round_limits
  BEFORE INSERT ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_round_limits();

-- ---------------------------------------------------------------------------
-- [2] منع المستخدم من الإنجاز (تايم أوت إداري)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.achievement_blocks (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_until timestamptz NOT NULL,
  reason        text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.achievement_blocks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.achievement_blocks TO authenticated;
GRANT ALL ON public.achievement_blocks TO service_role;

DROP POLICY IF EXISTS "Users see own block or admins see all" ON public.achievement_blocks;
CREATE POLICY "Users see own block or admins see all"
  ON public.achievement_blocks FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage blocks" ON public.achievement_blocks;
CREATE POLICY "Admins manage blocks"
  ON public.achievement_blocks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.is_blocked(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.achievement_blocks b
    WHERE b.user_id = p_user AND b.blocked_until > now()
  );
$$;

REVOKE ALL ON FUNCTION public.is_blocked(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid) TO authenticated, anon;

-- منع إنشاء المهام أثناء مدة المنع
CREATE OR REPLACE FUNCTION public.enforce_task_block()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_blocked(NEW.user_id) THEN
    RAISE EXCEPTION 'تم منعك من إنشاء المهام حتى انتهاء مدة المنع';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_task_block ON public.tasks;
CREATE TRIGGER trg_enforce_task_block
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_block();

-- منع إنشاء المهام المجدولة أثناء مدة المنع (إن كان الجدول موجودًا)
DO $$
BEGIN
  IF to_regclass('public.scheduled_tasks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_enforce_scheduled_block ON public.scheduled_tasks;
    CREATE TRIGGER trg_enforce_scheduled_block
      BEFORE INSERT ON public.scheduled_tasks
      FOR EACH ROW EXECUTE FUNCTION public.enforce_task_block();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- [3] الاجتماعات (قسم يظهر للأدمن ولمن يُضاف فقط)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meetings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  scheduled_at timestamptz,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meeting_members (
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  added_by   uuid,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_members_user
  ON public.meeting_members(user_id);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_members ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.meeting_members TO authenticated;
GRANT ALL ON public.meetings TO service_role;
GRANT ALL ON public.meeting_members TO service_role;

-- دالة آمنة (SECURITY DEFINER) لتفادي تكرار سياسات RLS
CREATE OR REPLACE FUNCTION public.is_meeting_member(p_meeting uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_members m
    WHERE m.meeting_id = p_meeting AND m.user_id = p_user
  );
$$;

REVOKE ALL ON FUNCTION public.is_meeting_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_meeting_member(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Admins or members can view meetings" ON public.meetings;
CREATE POLICY "Admins or members can view meetings"
  ON public.meetings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR created_by = auth.uid()
    OR public.is_meeting_member(id, auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage meetings" ON public.meetings;
CREATE POLICY "Admins manage meetings"
  ON public.meetings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins or meeting members can view members" ON public.meeting_members;
CREATE POLICY "Admins or meeting members can view members"
  ON public.meeting_members FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_meeting_member(meeting_id, auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage meeting members" ON public.meeting_members;
CREATE POLICY "Admins manage meeting members"
  ON public.meeting_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
