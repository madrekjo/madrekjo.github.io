-- ============================================================================
-- الدعم (مشروع الإنجاز) — إرفاق الصور + وضع الزائر
--
-- يُنفَّذ يدويًا مرة واحدة:
--   Supabase Dashboard → SQL Editor  (مشروع الإنجاز: itflhfhsfzrdfpxvlzrv)
--   ثم الصق محتوى هذا الملف كاملًا واضغط RUN.
--
-- آمن لإعادة التشغيل (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- [1] عمود الصور في جدول رسائل الدعم الحالي (مستخدم ↔ إدارة)
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- [2] جدول رسائل الزوار (بدون حساب) — منفصل حتى لا يؤثر على صندوق الإدارة
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_guest_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_token   uuid NOT NULL,
  guest_name    text,
  guest_contact text,
  sender_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL = الزائر
  content       text NOT NULL DEFAULT '',
  image_urls    jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_support_token
  ON public.support_guest_messages(guest_token);
CREATE INDEX IF NOT EXISTS idx_guest_support_created
  ON public.support_guest_messages(created_at DESC);

ALTER TABLE public.support_guest_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view guest support" ON public.support_guest_messages;
CREATE POLICY "Admins can view guest support"
  ON public.support_guest_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can reply to guest support" ON public.support_guest_messages;
CREATE POLICY "Admins can reply to guest support"
  ON public.support_guest_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND auth.uid() = sender_id
  );

DROP POLICY IF EXISTS "Admins can update guest support" ON public.support_guest_messages;
CREATE POLICY "Admins can update guest support"
  ON public.support_guest_messages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete guest support" ON public.support_guest_messages;
CREATE POLICY "Admins can delete guest support"
  ON public.support_guest_messages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT, UPDATE, DELETE ON public.support_guest_messages TO authenticated;

-- ---------------------------------------------------------------------------
-- [3] إرسال الزائر (RAINT: الرمز = إثبات ملكية المحادثة)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.support_guest_send(
  p_token uuid,
  p_name text,
  p_contact text,
  p_content text,
  p_image_urls jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_images jsonb := COALESCE(p_image_urls, '[]'::jsonb);
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'معرّف غير صالح';
  END IF;

  IF jsonb_typeof(v_images) <> 'array' THEN
    v_images := '[]'::jsonb;
  END IF;

  IF jsonb_array_length(v_images) > 3 THEN
    RAISE EXCEPTION 'الحد الأقصى ٣ صور في الرسالة';
  END IF;

  IF char_length(btrim(COALESCE(p_content, ''))) < 1
     AND jsonb_array_length(v_images) = 0 THEN
    RAISE EXCEPTION 'اكتب رسالتك أو أرفق صورة';
  END IF;

  IF char_length(p_content) > 2000 THEN
    RAISE EXCEPTION 'الرسالة طويلة جدًا (الحد ٢٠٠٠ حرف)';
  END IF;

  -- حدّ أمان: ٣٠ رسالة/ساعة لكل رمز زائر
  IF (SELECT count(*) FROM public.support_guest_messages
        WHERE guest_token = p_token
          AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'تمهّل قليلاً قبل إرسال المزيد';
  END IF;

  INSERT INTO public.support_guest_messages
    (guest_token, guest_name, guest_contact, sender_id, content, image_urls, is_read)
  VALUES
    (p_token,
     NULLIF(btrim(COALESCE(p_name, '')), ''),
     NULLIF(btrim(COALESCE(p_contact, '')), ''),
     NULL,
     btrim(COALESCE(p_content, '')),
     v_images,
     false)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.support_guest_send(uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_guest_send(uuid, text, text, text, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- [4] قراءة محادثة الزائر (من يملك الرمز يرى محادثته فقط)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.support_guest_fetch(p_token uuid)
RETURNS TABLE(
  id uuid,
  content text,
  image_urls jsonb,
  is_read boolean,
  from_admin boolean,
  created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id,
         m.content,
         m.image_urls,
         m.is_read,
         (m.sender_id IS NOT NULL) AS from_admin,
         m.created_at
  FROM public.support_guest_messages m
  WHERE m.guest_token = p_token
  ORDER BY m.created_at ASC
  LIMIT 300;
$$;

REVOKE ALL ON FUNCTION public.support_guest_fetch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_guest_fetch(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- [5] دلو الصور support-media (قراءة عامة + رفع محكوم)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-media', 'support-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Support media public read" ON storage.objects;
CREATE POLICY "Support media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'support-media');

-- المستخدم المُسجَّل يرفع داخل مجلده (اسم المجلد = معرّف المستخدم)
DROP POLICY IF EXISTS "Support media upload (own folder)" ON storage.objects;
CREATE POLICY "Support media upload (own folder)"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- الزائر يرفع داخل مجلد guest فقط، صور فقط، وبحد أقصى 3 ميغابايت
DROP POLICY IF EXISTS "Support media upload (guest)" ON storage.objects;
CREATE POLICY "Support media upload (guest)"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'support-media'
    AND (storage.foldername(name))[1] = 'guest'
    AND COALESCE(metadata->>'mimetype', '') LIKE 'image/%'
    AND COALESCE((metadata->>'size')::bigint, 0) <= 3145728
  );

-- صاحب الملف أو الأدمن فقط يحذف
DROP POLICY IF EXISTS "Support media delete" ON storage.objects;
CREATE POLICY "Support media delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'support-media'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );
