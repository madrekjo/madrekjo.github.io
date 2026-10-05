-- =============================================================================
-- بصمة لكل زائر — لا تشارك ولا تصادم بين مستخدمين
-- =============================================================================
-- الخلط الذي وقع:
--   «بصمة الجهاز» وحدها لا تميّز مستخدمَين على جهازين متشابهين:
--   جوالان بنفس الموديل + نفس المتصفح + نفس الخطوط ← نفس البصمة تماماً.
--   فلو جعلنا البصمة هي الهوية، صار خمسة أشخاص على حساب واحد يخرّبون
--   بعض — وهذا أسوأ من انعدام الحماية.
--
-- الحل: فصل شيئين لهلDifferent غرضين
--   1) device_code   = hash(العتاد فقط)      → قد تتطابق بين أجهزة متشابهة
--                                  → تُستخدم للتعرّف على «نفس الجهاز» عند الشك
--                                  → لا تُستخدم كهوية أبداً
--   2) visitor_code  = hash(العتاد + salt)   → salt عشوائي خاص بكل زائر
--                                  → مختلفة بين مستخدمَين على جهاز واحد
--                                  → هذه هي هوية الزائر
--
--   sal provisioned لكل زائر مرة واحدة ويُحفظ، فلا يشاركه أحد.
--   إن حُذف، تُولَّد بصمة جديدة — وهذا مقصود: الموقع لا يستطيع معرفة أيّ
--   من خمسة أشخاص يتشاركون حاسوباً هو الراجع.
--
-- النتيجة:
--   • مستخدم جديد ← دايماً visitor_code جديدة له، لا تُوضع تحت أيّ زائر آخر
--   • نفس المستخدم على نفس الجهاز ← نفس visitor_code (ثابتة)
--   • الحظر يعتمد على إشارات العتاد (device_code) فيظل يعمل حتى لو ضاعت
--     visitor_code، فلا يصبح حذف البصمة مفرّاً من الحظر
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- جدول بصمات الزوار
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.visitor_codes (
  visitor_code text PRIMARY KEY CHECK (length(visitor_code) BETWEEN 8 AND 64),
  device_code  text NOT NULL,
  device_id    text UNIQUE,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  hits         int NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.visitor_codes IS
  'بصمة خاصة بكل زائر (العتاد + salt) — لا تتشارك ولا تصادم بين مستخدمين';

CREATE INDEX IF NOT EXISTS visitor_codes_device_idx ON public.visitor_codes (device_code);
CREATE INDEX IF NOT EXISTS visitor_codes_last_idx  ON public.visitor_codes (last_seen DESC);

ALTER TABLE public.visitor_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no direct reads" ON public.visitor_codes
  FOR SELECT TO anon, authenticated USING (false);

GRANT SELECT, INSERT, UPDATE ON public.visitor_codes TO service_role;
REVOKE ALL ON public.visitor_codes FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- issue_visitor_code
--   p_device_code : بصمة العتاد (بدون salt) — قد تتطابق بين أجهزة متشابهة
--   p_salt        : salt عشوائي يولّده المتصفح ويخزّنه
-- يُرجع visitor_code خاصة بهذا الزائر. نفس (device_code, salt) يعيد نفس
-- النتيجة دائماً؛ و(نفس device_code مع salt مختلف) يعطي نتيجة مختلفة.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_visitor_code(
  p_device_code text,
  p_salt        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dev  text := lower(btrim(coalesce(p_device_code, '')));
  slt  text := lower(btrim(coalesce(p_salt, '')));
  seed text;
  vcode text;
  found text;
BEGIN
  IF length(dev) < 8 OR length(dev) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid device');
  END IF;
  IF length(slt) < 6 OR length(slt) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid salt');
  END IF;

  seed := dev || ':' || slt;
  vcode := 'vc-' || substr(encode(digest(seed, 'sha256'), 'hex'), 1, 16);

  SELECT vc.visitor_code INTO found
    FROM public.visitor_codes vc
   WHERE vc.visitor_code = vcode;

  IF found IS NULL THEN
    BEGIN
      INSERT INTO public.visitor_codes(visitor_code, device_code, first_seen, last_seen, hits)
      VALUES (vcode, dev, now(), now(), 1);
    EXCEPTION WHEN unique_violation THEN
      NULL; -- سبق أن سُجّل، لا مشكلة
    END;
  ELSE
    UPDATE public.visitor_codes
       SET last_seen = now(), hits = hits + 1
     WHERE visitor_code = vcode;
  END IF;

  -- device_id اختياري: يربط هذا الزائر بمعرّف قديم إن طُلب صراحةً
  RETURN jsonb_build_object('ok', true, 'visitor_code', vcode, 'device_code', dev);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_visitor_code(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_visitor_code(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- link_visitor_identity: يربط visitor_code بمعرّف، مرة واحدة فقط
--   إن كان المعرّف مرتبطاً بزائر آخر ← يرفض (يمنع دمج حسابين)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_visitor_identity(
  p_visitor_code text,
  p_device_id   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vcode text := lower(btrim(coalesce(p_visitor_code, '')));
  did   text := btrim(coalesce(p_device_id, ''));
  owner text;
BEGIN
  IF length(vcode) < 8 OR length(did) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.visitor_codes vc WHERE vc.visitor_code = vcode) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown visitor');
  END IF;

  SELECT vc.device_id INTO owner
    FROM public.visitor_codes vc
   WHERE vc.device_id IS NOT NULL
     AND vc.device_id <> did
   LIMIT 1;

  IF owner IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device already linked');
  END IF;

  UPDATE public.visitor_codes
     SET device_id = did
   WHERE visitor_code = vcode
     AND (device_id IS NULL OR device_id = did);

  RETURN jsonb_build_object('ok', true, 'device_id', did);
END;
$$;

REVOKE ALL ON FUNCTION public.link_visitor_identity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_visitor_identity(text, text) TO anon, authenticated;

COMMIT;

-- =============================================================================
-- تحقق بعد التشغيل
-- =============================================================================
-- 1) زائران على جهاز واحد متطابق العتاد، salts مختلفة:
--    issue_visitor_code('aaaa1111bbbb','salt-one') -> vc-xxxxxxxx  (مختلف)
--    issue_visitor_code('aaaa1111bbbb','salt-two') -> vc-yyyyyyyy  (مختلف)  ✅
--
-- 2) نفس الزائر في فتحين (نفس salt):
--    issue_visitor_code('aaaa1111bbbb','salt-one') -> نفس vc الأول     ✅ ثابت
--
-- 3) الحظر ما زال يعمل عبر device_code/إشارات العتاد حتى لو ضاعت visitor_code.
--
-- 4) SELECT من anon على visitor_codes مباشرة = 42501 (ممنوع عمداً).