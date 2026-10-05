-- =============================================================================
-- هوية مرتبطة بالجهاز — تستعاد حتى بعد مسح بيانات المتصفح
-- =============================================================================
-- المشكلة المتبقية:
--   الهوية = UUID مخزّن في localStorage. أي زائر يستطيع مسح بيانات المتصفح
--   (أو تعديل القيمة من DevTools) فيحصل على هوية جديدة كاملة: اسم جديد،
--   سجل جديد، بلا أي علاقة بالسابق. هذا يجعل الضبط بلا معنى.
--
-- المطلوب: «خليها على نوع ورمز الجهاز مبنية» — هوية مشتقّة من عتاد الجهاز
--   تُحفظ في السيرفر، فمسح المتصفح لا يغيّر شيئاً.
--
-- الحل:
--   جدول device_codes يربط (رمز الجهاز) -> (المعرّف الثابت).
--   عند كل فتح:
--     • نحسب رمز الجهاز من العتاد (canvas + webgl + audio + fonts + screen)
--     • نطلب resolve_device_identity(الرمز)
--     • إن كان الرمز معروفاً -> يُرجع نفس المعرّف (استعادة)
--     • وإلا -> ينشئ معرّفاً جديداً مرتبطاً بالرمز
--   النتيجة: مسح بيانات المتصفح أو تغيير المعرّف يدوياً لا يغيّر الهوية.
--
-- لماذا لا يسبب تشارك أسماء:
--   التطابق هنا على البصمة الكاملة المولّدة من العتاد، لا على إشارتين من
--   أربع.-that's the difference: الاحتمال القريب معدوم، والPrevious ربط كان
--   على 2/4 فتطابق إشارتين كان كافياً للدمج — وهذا سبب التسريب السابق.
--
-- ملاحظة: أول من يفتح بعد التطبيق يُنشأ له معرّف،|Last:|last_seen
-- يُحدَّث. الأدمن يرى device_codes لتمييز «جهاز واحد بهويات متعددة».
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.device_codes (
  code       text PRIMARY KEY CHECK (length(code) BETWEEN 8 AND 64),
  device_id  text NOT NULL UNIQUE,
  kind       text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  hits       int NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.device_codes IS
  'ربط رمز الجهاز (من العتاد) بالمعرّف الثابت — أساس استعادة الهوية';

CREATE INDEX IF NOT EXISTS device_codes_last_seen_idx ON public.device_codes (last_seen DESC);

ALTER TABLE public.device_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no anon reads" ON public.device_codes
  FOR SELECT TO anon, authenticated USING (false);

GRANT SELECT, INSERT, UPDATE ON public.device_codes TO service_role;
REVOKE ALL ON public.device_codes FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- resolve_device_identity: يعيد المعرّف الثابت لهذا الرمز، وينشئه إن لم يوجد
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_device_identity(
  p_code text,
  p_kind text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm   text;
  row_id text;
  out    jsonb;
BEGIN
  norm := lower(btrim(coalesce(p_code, '')));
  IF length(norm) < 8 OR length(norm) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid code');
  END IF;

  SELECT dc.device_id INTO row_id
    FROM public.device_codes dc
   WHERE dc.code = norm;

  IF row_id IS NULL THEN
    -- معرّف مشتق من الرمز: 12 خانة من SHA-256 -> 48 بت، وتبقى ثابتة للجهاز
    row_id := 'dc-' || substr(encode(digest(norm, 'sha256'), 'hex'), 1, 12);

    BEGIN
      INSERT INTO public.device_codes(code, device_id, kind, first_seen, last_seen, hits)
      VALUES (norm, row_id, left(coalesce(p_kind, ''), 16), now(), now(), 1);
      out := jsonb_build_object('ok', true, 'device_id', row_id, 'restored', false);
    EXCEPTION WHEN unique_violation THEN
      -- سباق: جهاز آخر أنشأ نفس الرمز بين SELECT و INSERT
      SELECT dc.device_id INTO row_id
        FROM public.device_codes dc
       WHERE dc.code = norm;
      out := jsonb_build_object('ok', true, 'device_id', row_id, 'restored', true);
    END;
  ELSE
    UPDATE public.device_codes
       SET last_seen = now(), hits = hits + 1
     WHERE code = norm;
    out := jsonb_build_object('ok', true, 'device_id', row_id, 'restored', true);
  END IF;

  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_device_identity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_device_identity(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- مزامنة: الأجهزة المسجّلة سابقاً تستورد رمزها عند أول فتح بعد التطبيق
-- (لا نفعلها تلقائياً — تتطلب تمرير device_id الحالي)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_existing_identity(
  p_code text,
  p_device_id text,
  p_kind text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text;
BEGIN
  norm := lower(btrim(coalesce(p_code, '')));
  IF length(norm) < 8 OR p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  -- ما نسمح بمعرّف مُعلن مسبقاً بصيغة dc- (مُشتق) إلا لو هو نفسه المحفوظ
  INSERT INTO public.device_codes(code, device_id, kind, first_seen, last_seen, hits)
  SELECT norm, p_device_id, left(coalesce(p_kind, ''), 16), now(), now(), 1
  WHERE NOT EXISTS (
    SELECT 1 FROM public.device_codes dc
     WHERE dc.device_id = p_device_id
       AND dc.code <> norm
  )
  ON CONFLICT (code) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'device_id', COALESCE(
      (SELECT dc.device_id FROM public.device_codes dc WHERE dc.code = norm),
      p_device_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_existing_identity(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_existing_identity(text, text, text) TO anon, authenticated;

COMMIT;

-- =============================================================================
-- تحقق بعد التشغيل
-- =============================================================================
-- SELECT code, device_id, kind, hits FROM public.device_codes ORDER BY last_seen DESC;
--
-- اختبار:
--   1) resolve_device_identity('abcdef123456','phone')  -> restored=false, device_id=dc-xxxxxxxxxxxx
--   2) نفس الرمز مرة ثانية                            -> restored=true, نفس device_id  ✅
--   3) لاgrant لـ anon على الجدول مباشرة (SELECT من anon = 42501)
--      لكن الدالة مسموحة، وهذا مقصود: هي لا تكشف إلا معرّف هذا الرمز نفسه.