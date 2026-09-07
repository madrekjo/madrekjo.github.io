-- ============================================================================
-- ★ مساهمات "أجر وثواب": جدول الأدعية والآيات + دالة النشر ★
-- شغّلها في نفس مشروع قاعدة الشات (biabdoatwfteqwgjdxzc):
-- Supabase → SQL Editor → New Query → Paste → Run
--
-- ماذا يفعل:
--   [1] جدول ajr_contributions (دعاء/آية، اسم اختياري، رمز مرسل أنونيموس)
--   [2] دالة RPC submit_ajr_contribution — تحقق + منع سبام + إدراج آمن
--       (بدون سياسة INSERT مباشرة → لا يمكن لأحد التلاعب بالجدول إلا عبر الدالة)
--   [3] سياسة SELECT للجميع + أذونات anon
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ajr_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('dua', 'ayah')),
  content text NOT NULL,
  name text,
  author_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ajr_contributions_created ON public.ajr_contributions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ajr_contributions_token ON public.ajr_contributions(author_token);

ALTER TABLE public.ajr_contributions ENABLE ROW LEVEL SECURITY;

-- القراءة: يرى الجميع كل المساهمات
DROP POLICY IF EXISTS "Anyone can view ajr contributions" ON public.ajr_contributions;
CREATE POLICY "Anyone can view ajr contributions"
ON public.ajr_contributions FOR SELECT TO public
USING (true);

-- لا سياسة INSERT/UPDATE/DELETE: لا كتابة مباشرة إطلاقاً — فقط عبر الدالة RPC


-- دالة النشر الآمنة
CREATE OR REPLACE FUNCTION public.submit_ajr_contribution(
  p_type text,
  p_content text,
  p_name text DEFAULT NULL,
  p_author_token text DEFAULT NULL
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_recent integer;
BEGIN
  IF p_type NOT IN ('dua', 'ayah') THEN
    RETURN QUERY SELECT false, 'نوع غير صحيح'::text;
    RETURN;
  END IF;

  IF p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 2000 THEN
    RETURN QUERY SELECT false, 'النص يجب أن يكون من 1 إلى 2000 حرف'::text;
    RETURN;
  END IF;

  IF p_name IS NOT NULL AND length(btrim(p_name)) > 80 THEN
    RETURN QUERY SELECT false, 'الاسم أطول من 80 حرف'::text;
    RETURN;
  END IF;

  IF p_author_token IS NULL OR length(p_author_token) NOT BETWEEN 8 AND 128 THEN
    RETURN QUERY SELECT false, 'رمز المرسل غير صالح'::text;
    RETURN;
  END IF;

  -- منع السبام: مشاركة واحدة كحد أقصى لكل رمز خلال 60 ثانية
  SELECT count(*) INTO v_recent
  FROM public.ajr_contributions
  WHERE author_token = p_author_token
    AND created_at > now() - interval '60 seconds';

  IF v_recent >= 1 THEN
    RETURN QUERY SELECT false, 'هل أنت متأكد؟ انتظر دقيقة واحدة بين كل مشاركة'::text;
    RETURN;
  END IF;

  INSERT INTO public.ajr_contributions (type, content, name, author_token)
  VALUES (p_type, btrim(p_content), NULLIF(btrim(COALESCE(p_name, '')), ''), p_author_token);

  RETURN QUERY SELECT true, 'تم نشر مشاركتك، جزاك الله خيراً'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_ajr_contribution(text, text, text, text) TO anon, authenticated;
GRANT SELECT ON public.ajr_contributions TO anon, authenticated;