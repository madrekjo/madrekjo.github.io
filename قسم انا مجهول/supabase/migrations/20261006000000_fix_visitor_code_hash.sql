-- =============================================================================
-- إصلاح: issue_visitor_code كانت تفشل عند كل استدعاء
-- =============================================================================
-- السبب:
--   الدالة تستدعي digest(...,'sha256') وهي من إضافة pgcrypto، وهذه الإضافة
--   غير مثبّتة في القاعدة الجديدة. النتيجة:
--     ERROR 42883: function digest(text, unknown) does not exist
--   و resolveIdentity() في المتصفح تبتلع الخطأ بصمت، فلا يُسجَّل أي زائر.
--   مؤشرات ذلك: جدول visitor_codes موجود لكنه 0 صف.
--
-- الإصلاح:
--   1) تفعيل pgcrypto (احتياطاً لأي استخدام قادم).
--   2) إعادة كتابة الدالة لتستخدم sha256() المدمجة في نواة PostgreSQL 11+
--      فتصبح مستقلة عن أي إضافة.
--   3) إصلاح خطأ منطقي في link_visitor_identity (انظر الملاحظة بالأسفل).
--
-- ملاحظة على (3):
--   الكود القديم كان يسأل: «هل يوجد أي سطر آخر في الجدول له device_id
--   مختلف عني؟» — أي فحص عام للجدول كله. أثره: بعد أول زائر يربط device_id
--   لا يعود أحد يستطيع الربط أبداً، فيُرفض الجميع بـ 'device already linked'.
--   الصواب: الرفض فقط إن كانت هذه الـ visitor_code نفسها مربوطة بمعرّف
--   مختلف — لا فحص عام للجدول.
--
-- الجدول visitor_codes فارغ حالياً، فلا خوف من تغيير ناتج الهاش.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) تفعيل pgcrypto
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 2) issue_visitor_code — بلا اعتماد على pgcrypto
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
  dev   text := lower(btrim(coalesce(p_device_code, '')));
  slt   text := lower(btrim(coalesce(p_salt, '')));
  seed  text;
  vcode text;
  found text;
BEGIN
  IF length(dev) < 8 OR length(dev) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid device');
  END IF;
  IF length(slt) < 6 OR length(slt) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid salt');
  END IF;

  seed  := dev || ':' || slt;
  vcode := 'vc-' || substr(encode(sha256(convert_to(seed, 'UTF8')), 'hex'), 1, 16);

  SELECT vc.visitor_code INTO found
    FROM public.visitor_codes vc
   WHERE vc.visitor_code = vcode;

  IF found IS NULL THEN
    BEGIN
      INSERT INTO public.visitor_codes(visitor_code, device_code, first_seen, last_seen, hits)
      VALUES (vcode, dev, now(), now(), 1);
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  ELSE
    UPDATE public.visitor_codes
       SET last_seen = now(), hits = hits + 1
     WHERE visitor_code = vcode;
  END IF;

  RETURN jsonb_build_object('ok', true, 'visitor_code', vcode, 'device_code', dev);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_visitor_code(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_visitor_code(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) link_visitor_identity — تصحيح الفحص العام
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

  -- الفحص الصحيح: هذه الـ visitor_code نفسها، لا كل الجدول
  SELECT vc.device_id INTO owner
    FROM public.visitor_codes vc
   WHERE vc.visitor_code = vcode
     AND vc.device_id IS NOT NULL;

  IF owner IS NOT NULL AND owner <> did THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already linked');
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
-- تحقق بعد التشغيل (شغّل منفصلاً)
-- =============================================================================
-- SELECT public.issue_visitor_code('aaaa1111bbbb','salt-one');
--   → {"ok":true,"visitor_code":"vc-xxxxxxxxxxxxxxxx","device_code":"aaaa1111bbbb"}
--
-- SELECT public.issue_visitor_code('aaaa1111bbbb','salt-two');
--   → visitor_code مختلفة  ✅  جهاز واحد، زائران، بصمتان مختلفتان
--
-- SELECT public.issue_visitor_code('aaaa1111bbbb','salt-one');
--   → نفس الأول  ✅  ثابت لنفس الزائر
--
-- SELECT count(*) FROM public.visitor_codes;
--   → 2   (لا 3، لأن الأول تكرر)
-- =============================================================================