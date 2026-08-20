-- ============================================================================
-- chat21.sql — إضافات على قاعدة الدردشة: قنوات + إعدادات + علامات
-- ============================================================================
-- شغّل هذا الملف من Supabase SQL Editor (ملف إضافي فقط، لا يحذف أي شيء)

-- 1. جدول إعدادات القنوات (للأدمن يقدر يطفي قناة)
CREATE TABLE IF NOT EXISTS public.channel_settings (
  channel TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.channel_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel settings viewable by everyone" ON public.channel_settings;
CREATE POLICY "channel settings viewable by everyone"
  ON public.channel_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "channel settings insert for admins" ON public.channel_settings;
CREATE POLICY "channel settings insert for admins"
  ON public.channel_settings FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "channel settings update for admins" ON public.channel_settings;
CREATE POLICY "channel settings update for admins"
  ON public.channel_settings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "channel settings delete for admins" ON public.channel_settings;
CREATE POLICY "channel settings delete for admins"
  ON public.channel_settings FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- إدخال القنوات الافتراضية
INSERT INTO public.channel_settings (channel, enabled) VALUES
  ('all', true),
  ('male', true),
  ('female', true),
  ('09', true),
  ('10', true)
ON CONFLICT (channel) DO NOTHING;

-- 2. إضافة الأعمدة إذا لم تكن موجودة
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS channel text;

-- 3. تحديث القيود
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_gender_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_gender_check CHECK (gender IN ('male', 'female'));

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_channel_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_channel_check CHECK (channel IN ('all', 'male', 'female', '09', '10'));

-- 4. دالة التحقق من القناة
CREATE OR REPLACE FUNCTION public.can_see_channel(target_channel text, user_gender text)
RETURNS boolean AS $$
BEGIN
    IF target_channel IS NULL OR target_channel = 'all' THEN RETURN true; END IF;
    IF target_channel = 'male' THEN RETURN user_gender = 'male'; END IF;
    IF target_channel = 'female' THEN RETURN user_gender = 'female'; END IF;
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. تحديث سياسة SELECT على المنشورات
DROP POLICY IF EXISTS "posts select by generation" ON public.posts;
DROP POLICY IF EXISTS "posts select by channel" ON public.posts;

CREATE POLICY "posts select by channel" ON public.posts FOR SELECT
USING (can_see_channel(channel, (SELECT gender FROM profiles WHERE user_id = auth.uid())));

-- 6. Trigger لملء القناة تلقائياً
CREATE OR REPLACE FUNCTION public.set_posts_channel()
RETURNS trigger AS $$
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

-- 7. فهارس
CREATE INDEX IF NOT EXISTS idx_posts_channel ON public.posts(channel);
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON public.profiles(gender);
