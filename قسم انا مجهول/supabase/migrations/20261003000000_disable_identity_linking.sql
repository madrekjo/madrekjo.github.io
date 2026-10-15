-- =============================================================================
-- إيقاف ربط الهوية بالبصمة — منع تشارك الأسماء والأجهزة بين الزوار
-- =============================================================================
-- المشكلة:
--   record_visitor_fingerprint كان يبحث عن «جهاز آخر» يتشارك مع الجهاز الحالي
--   بإشارتين قويتين على الأقل من (canvas, fp, webgl, audio)، وعندها يفعل:
--     1) ينسخ الاسم من الجهاز الجديد إلى الجهاز المرتبط   (سطر ~81)
--     2) ينقل التحذيرات المعلّقة                            (سطر ~87)
--     3) يحذف بصمات وتوقيعات الجهاز الجديد                   (سطر ~99)
--     4) يعيد كتابة p_device_id := linked_id                 (سطر ~98)
--   فالنتيجة: زائر يفتح الموقع على جهازه فيرى اسم زائر آخر،
--   واسمه ينكتب على حساب ذلك الزائر. مع أن عميلنا (v=56+) صار يتجاهل
--   الحقل linked، إلا أن السيرفر نفسه هو من كان ينفّذ الدمج ويختار الاسم.
--
-- لماذا كان الخطر واقعياً:
--   الحد الأدنى كان 2 من 4 إشارات، وإشارتا canvas + fp تتطابقان بسهولة بين
--   متصفحات على نفس الجهاز/نفس تعريفات GPU والخطوط، وبين أجهزة متشابهة.
--
-- الحل:
--   البصمة تُستخدم لكشف الحظر فقط (scoring)، ولا تُستخدم أبداً لدمج الهوية.
--   نجعل الحد مستحيلاً عبر قيمة أكبر من عدد الإشارات المتاحة (4)، فيبقى
--   linked_id فارغاً دائماً ويُتخطّى كتلة الربط بالكامل.
--   الهويةnow تعتمد على localStorage['anon_device_id'] وحده.
--
-- الثمن (مقصود):
--   من يمسح بيانات الموقع يفقد هويته واسمه وسجلّه، ولا استرجاع تلقائي.
--   الاسترجاع يكون صريحاً فقط (كود الاسترجاع / ملف الأدمة).
--   هذا أفضل من تشارك الأسماء مع مجهول.
--
-- لا تُخفض هذه القيمة ولا تحذف هذا الملف.
-- =============================================================================

BEGIN;

UPDATE public.ban_scoring_config
   SET value     = '99'::jsonb,
       updated_at = now()
 WHERE key = 'link_identity_min_strong';

COMMIT;

-- =============================================================================
-- تحقق (بعد التشغيل) — يجب أن يطبع 99
-- =============================================================================
-- SELECT key, value FROM public.ban_scoring_config
--  WHERE key = 'link_identity_min_strong';

-- اختبار سلوك: استدعِ record_visitor_fingerprint بمعرّف جديد وبنفس إشارات
-- جهاز مسجَّل. النتيجة الصحيحة: 'linked' = false و device_id = المعرّف الجديد
-- و device_name = اسم المعرّف الجديد فقط (لا اسم الجهاز الآخر).
--
-- SELECT (record_visitor_fingerprint(
--          p_device_id     := 'test-no-link-0001',
--          p_ip_hash       := NULL,
--          p_ua_hash       := NULL,
--          p_canvas_hash   := (SELECT sig_value FROM public.device_signatures
--                                WHERE sig_type='canvas' LIMIT 1),
--          p_fp_hash       := (SELECT sig_value FROM public.device_signatures
--                                WHERE sig_type='fp'     LIMIT 1),
--          p_webgl_hash    := NULL,
--          p_audio_hash    := NULL,
--          p_fonts_hash    := NULL,
--          p_screen_hash   := NULL
--        )::jsonb ->> 'linked') AS linked,
--        (record_visitor_fingerprint(
--          p_device_id     := 'test-no-link-0002',
--          p_ip_hash       := NULL,
--          p_ua_hash       := NULL,
--          p_canvas_hash   := NULL,
--          p_fp_hash       := NULL,
--          p_webgl_hash    := NULL,
--          p_audio_hash    := NULL,
--          p_fonts_hash    := NULL,
--          p_screen_hash   := NULL
--        )::jsonb ->> 'linked') AS linked_control;
-- الحذر: هذا الاختبار ينشئ صفوف بصمات لـ test-no-link-* — امسحها بعدها:
-- DELETE FROM public.device_fingerprints WHERE device_id LIKE 'test-no-link-%';
-- DELETE FROM public.device_signatures  WHERE device_id LIKE 'test-no-link-%';
