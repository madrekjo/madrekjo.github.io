-- ============================================================================
-- الدعم العام المستقل — توسعة support_messages لاستقبال الزوار (بدون حساب)
-- يُنفَّذ يدويًا: Supabase Dashboard → SQL Editor لمشروع الدردشة
--          romocwtqzdnovfgtmwzb
--
-- الأفكار:
--   * المسجّل: يبقى سلوكه كما هو (user_id = sender_id = auth.uid() عبر RLS).
--   * الزائر: يُعرَّف بمعرّف متصفح (guest_token uuid)، ويُقرأ/يُكتب عبر
--     دالتين SECURITY DEFINER (capability: من يملك الرمز يرى محادثته).
--   * الرد: نفس أدمن/مشرفي الدردشة، وسياسة INSERT الحالية (auth.uid()=sender_id)
--     تكفي لرد الأدمن على الزائر (user_id = null، guest_token = رمز الزائر).
-- آمن إعادة التشغيل.
-- ============================================================================

-- [1] إتاحة الصفوف للزوار (بلا حساب) + أعمدة الزائر
ALTER TABLE public.support_messages ALTER COLUMN user_id   DROP NOT NULL;
ALTER TABLE public.support_messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS guest_token   uuid;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS guest_name    text;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS guest_contact text;

CREATE INDEX IF NOT EXISTS idx_support_guest_token ON public.support_messages(guest_token);
CREATE INDEX IF NOT EXISTS idx_support_user_id     ON public.support_messages(user_id);

-- [2] إرسال الزائر
CREATE OR REPLACE FUNCTION public.support_guest_send(
  p_token uuid, p_name text, p_contact text, p_content text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'معرّف غير صالح'; END IF;
  IF char_length(btrim(COALESCE(p_content, ''))) < 1
     OR char_length(p_content) > 2000 THEN
    RAISE EXCEPTION 'اكتب رسالتك (١ إلى ٢٠٠٠ حرف)';
  END IF;
  -- حدّ أمان: ٣٠ رسالة/ساعة لكل رمز
  IF (SELECT count(*) FROM public.support_messages
        WHERE guest_token = p_token
          AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'تمهّل قليلاً قبل إرسال المزيد';
  END IF;
  INSERT INTO public.support_messages
    (user_id, sender_id, guest_token, guest_name, guest_contact, content, is_read)
  VALUES
    (null, null, p_token,
     NULLIF(btrim(COALESCE(p_name, '')), ''),
     NULLIF(btrim(COALESCE(p_contact, '')), ''),
     btrim(p_content), false)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.support_guest_send(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_guest_send(uuid, text, text, text) TO anon, authenticated;

-- [3] قراءة محادثة الزائر (capability بالرمز)
CREATE OR REPLACE FUNCTION public.support_guest_fetch(p_token uuid)
RETURNS TABLE(
  id uuid, content text, image_urls jsonb,
  is_read boolean, from_admin boolean, created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, content, to_jsonb(image_urls),
         is_read, (sender_id IS NOT NULL) AS from_admin, created_at
  FROM public.support_messages
  WHERE guest_token = p_token
  ORDER BY created_at ASC
  LIMIT 300;
$$;
REVOKE ALL ON FUNCTION public.support_guest_fetch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_guest_fetch(uuid) TO anon, authenticated;
