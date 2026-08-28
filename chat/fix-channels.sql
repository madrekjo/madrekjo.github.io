-- ============================================================================
-- fix-channels.sql — إصلاح قنوات الدردشة
-- شغِّل هذا الملف كاملاً من Supabase SQL Editor (لوحة التحكم → SQL Editor)
-- ============================================================================

-- 1) تأكيد وجود القنوات الخمس مع تفعيلها (عدّل true إلى false لأي قناة تريدها معطّلة)
INSERT INTO public.channel_settings (channel, enabled, updated_at) VALUES
  ('all',    true, now()),
  ('male',   true, now()),
  ('female', true, now()),
  ('09',     true, now()),
  ('10',     true, now())
ON CONFLICT (channel) DO UPDATE SET enabled = EXCLUDED.enabled;

-- 2) البحث عن أي "تريغر متطفّل" يجعل إغلاق قناة واحدة يغلق الكل.
--    (هذا هو سبب المشكلة الثانية: عادةً يوجد تريغر يدوياً ينفّذ دالة
--     عند تغيّر section_locks أو channel_settings ويفعّل الكل على false)
SELECT tgname, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
WHERE NOT tgisinternal
  AND tgrelid IN ('public.channel_settings'::regclass, 'public.section_locks'::regclass);

-- إن ظهر أي تريغر هنا (غير الأسماء التالية: trg_set_posts_channel غير مربوط بهذا الجدول) فاحذفه:
-- مثال:
--   DROP TRIGGER IF EXISTS "اسم_التريغر" ON public.channel_settings;
--   DROP TRIGGER IF EXISTS "اسم_التريغر" ON public.section_locks;
-- ثم احذف الدالة إن أصبحت بلا استعمال:
--   DROP FUNCTION IF EXISTS "اسم_الدالة";

-- 3) إزالة أي تريغر قديم صُنع لربط section_locks ← channel_settings (ضمان إضافي)
DROP TRIGGER IF EXISTS trg_apply_channel_lock ON public.channel_settings;
DROP TRIGGER IF EXISTS trg_apply_section_lock ON public.channel_settings;
DROP TRIGGER IF EXISTS trg_cascade_lock ON public.section_locks;
DROP TRIGGER IF EXISTS trg_channel_lock_cascade ON public.section_locks;
DROP TRIGGER IF EXISTS trg_chat_all_lock ON public.section_locks;
DROP FUNCTION IF EXISTS public.apply_channel_locks();
DROP FUNCTION IF EXISTS public.lock_all_channels();

-- 4) التأكد أن جدول المنشورات يحوي عمود channel مع تريغر يملأه تلقائياً
--    (هذا يضمن أن المنشورات القديمة التي channel فيها NULL تظهر في قناة "الجميع")
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS channel text;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_channel_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_channel_check
  CHECK (channel IN ('all', 'male', 'female', '09', '10'));

UPDATE public.posts SET channel = 'all' WHERE channel IS NULL;

CREATE OR REPLACE FUNCTION public.set_posts_channel() RETURNS trigger AS $$
BEGIN
  IF NEW.channel IS NULL THEN
    NEW.channel := 'all';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_posts_channel ON public.posts;
CREATE TRIGGER trg_set_posts_channel
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_posts_channel();

CREATE INDEX IF NOT EXISTS idx_posts_channel ON public.posts(channel);

-- 5) تأكيد أن تعديل إعدادات القنوات للأدمن فقط (يمنع أي مستخدم من تغييرها)
DROP POLICY IF EXISTS "channel settings manage for admins" ON public.channel_settings;
DROP POLICY IF EXISTS "channel settings insert for admins" ON public.channel_settings;
DROP POLICY IF EXISTS "channel settings update for admins" ON public.channel_settings;
DROP POLICY IF EXISTS "channel settings delete for admins" ON public.channel_settings;
CREATE POLICY "channel settings manage for admins"
  ON public.channel_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));