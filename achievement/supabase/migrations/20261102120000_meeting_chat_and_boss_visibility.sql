-- ============================================================================
-- الإنجاز: دردشة داخل الاجتماعات + "البوس" (admin رئيسي) يرى كل شيء
--
-- يُنفَّذ يدويًا:
--   Supabase Dashboard → SQL Editor  (مشروع الإنجاز: itflhfhsfzrdfpxvlzrv)
-- آمن لإعادة التشغيل (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- [1] دالة: هل المستخدم الحالي هو "البوس" (المسؤول الرئيسي)؟
--     (البريد: abdalrhmanmaaith24@gmail.com)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_boss()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'abdalrhmanmaaith24@gmail.com';
$$;

REVOKE ALL ON FUNCTION public.is_boss() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_boss() TO authenticated;

-- ---------------------------------------------------------------------------
-- [2] تحديث سياسات meetings: البوس يرى كل شيء، غيره (أدمن) يرى ما أنشأه
--     أو ما هو عضو فيه. (لا يرى اجتماعات الأدمن الآخرين)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins or members can view meetings" ON public.meetings;
DROP POLICY IF EXISTS "Boss or owner or members can view meetings" ON public.meetings;
CREATE POLICY "Boss or owner or members can view meetings"
  ON public.meetings FOR SELECT TO authenticated
  USING (
    public.is_boss()
    OR created_by = auth.uid()
    OR public.is_meeting_member(id, auth.uid())
  );

-- إنشاء: أي أدمن
DROP POLICY IF EXISTS "Admins manage meetings" ON public.meetings;
DROP POLICY IF EXISTS "Admins can create meetings" ON public.meetings;
CREATE POLICY "Admins can create meetings"
  ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND created_by = auth.uid()
  );

-- تعديل: البوس أو منشئ الاجتماع
DROP POLICY IF EXISTS "Boss or creator can update meetings" ON public.meetings;
CREATE POLICY "Boss or creator can update meetings"
  ON public.meetings FOR UPDATE TO authenticated
  USING (public.is_boss() OR created_by = auth.uid())
  WITH CHECK (public.is_boss() OR created_by = auth.uid());

-- حذف: البوس أو منشئ الاجتماع
DROP POLICY IF EXISTS "Boss or creator can delete meetings" ON public.meetings;
CREATE POLICY "Boss or creator can delete meetings"
  ON public.meetings FOR DELETE TO authenticated
  USING (public.is_boss() OR created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- [3] تحديث سياسات meeting_members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins or meeting members can view members" ON public.meeting_members;
DROP POLICY IF EXISTS "Boss or meeting participants can view members" ON public.meeting_members;
CREATE POLICY "Boss or meeting participants can view members"
  ON public.meeting_members FOR SELECT TO authenticated
  USING (
    public.is_boss()
    OR public.is_meeting_member(meeting_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage meeting members" ON public.meeting_members;
DROP POLICY IF EXISTS "Boss or meeting creator can manage members" ON public.meeting_members;
CREATE POLICY "Boss or meeting creator can manage members"
  ON public.meeting_members FOR ALL TO authenticated
  USING (
    public.is_boss()
    OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.created_by = auth.uid())
  )
  WITH CHECK (
    public.is_boss()
    OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.created_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- [4] جدول دردشة الاجتماع (مجموعة)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL,
  content     text NOT NULL DEFAULT '',
  image_urls  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_messages_meeting
  ON public.meeting_messages(meeting_id, created_at);

ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.meeting_messages TO authenticated;
GRANT ALL ON public.meeting_messages TO service_role;

-- قراءة: يرث ظهور الاجتماع
DROP POLICY IF EXISTS "Meeting participants can view messages" ON public.meeting_messages;
CREATE POLICY "Meeting participants can view messages"
  ON public.meeting_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id));

-- إرسال: عضو/منشئ/بوس
DROP POLICY IF EXISTS "Meeting participants can send messages" ON public.meeting_messages;
CREATE POLICY "Meeting participants can send messages"
  ON public.meeting_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id)
  );

-- حذف: المرسل أو البوس
DROP POLICY IF EXISTS "Sender or boss can delete messages" ON public.meeting_messages;
CREATE POLICY "Sender or boss can delete messages"
  ON public.meeting_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR public.is_boss());

-- ---------------------------------------------------------------------------
-- [5] Realtime publication
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'meeting_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_messages;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;
