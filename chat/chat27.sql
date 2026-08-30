-- ============================================================================
-- chat27.sql — سياسة إغلاق القنوات على مستوى قاعدة البيانات (Server-Side Policy)
-- يشغَّل يدوياً من Supabase SQL Editor.
--
-- الهدف: لا يمكن نشر منشور في قناة مقفلة/معطلة مهما حاول العميل، إلا للأدمن
-- فقط (كما في سياسة "يغلق القسم للجميع ما عدا الادمن").
-- يغطي آلتي الإغلاق:
--   1) channel_settings.enabled = false (قناة معطلة)
--   2) section_locks لسطر القناة (all→chat_all / 09→chat_09 / 10→chat_10)
-- ============================================================================

-- دالة تمنع النشر في قناة مقفلة (تستدعى قبل الإدراج في posts)
CREATE OR REPLACE FUNCTION public.check_post_channel_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lock_section TEXT;
BEGIN
  -- الأدمن معفى دائماً من الإغلاق
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- 1) قناة معطلة عبر channel_settings
  IF EXISTS (
    SELECT 1 FROM public.channel_settings
    WHERE channel = NEW.channel AND enabled = false
  ) THEN
    RAISE EXCEPTION 'section_locked';
  END IF;

  -- 2) قفل عبر section_locks (بمفتاح القسم الموازي للقناة)
  lock_section := CASE NEW.channel
    WHEN 'all' THEN 'chat_all'
    WHEN '09'  THEN 'chat_09'
    WHEN '10'  THEN 'chat_10'
    ELSE NULL
  END;

  IF lock_section IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.section_locks
    WHERE section = lock_section
      AND locked = true
      AND (locked_until IS NULL OR locked_until > now())
  ) THEN
    RAISE EXCEPTION 'section_locked';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_post_channel_lock ON public.posts;
CREATE TRIGGER enforce_post_channel_lock
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.check_post_channel_lock();