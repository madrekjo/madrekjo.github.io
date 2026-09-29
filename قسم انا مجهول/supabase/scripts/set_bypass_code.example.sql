-- ============================================================================
--  تعيين رمز فك الحظر  (نسخة عامة — بدون سر)
-- ============================================================================
--  انسخ هذا الملف إلى  set_bypass_code.sql  (المستثنى من git)
--  واستبدل <<YOUR_CODE>> بالرمز الذي تريده، ثم شغّله في SQL Editor.
--
--  شغّله بعد:  FULL_SCHEMA.sql  ثم  20261002000000_ban_bypass_honored.sql
--  (يعتمد على public.bp_crypt من الترحيل الأخير)
--
--  الرمز يُخزَّن مُجزّأً (bcrypt) تحت المفتاح bypass_code_hash.
--  لا يخرج النص الصريح للقاعدة أبداً، ولا لأي زائر.
--
--  تحذير: أي رمز قصير قابل للتخمين. bypass_ban_with_code ممنوحة لـ anon،
--  فأي حدا يقدر يناديها بلا تسجيل دخول. 8 خانات فأكثر تخلّي التخمين
--  مكلفاً. أضف تحديد محاولات لو كان الرمز قصيراً.
-- ============================================================================

BEGIN;

INSERT INTO public.ban_scoring_config (key, value, updated_at)
VALUES ('bypass_code_hash', to_jsonb(public.bp_crypt('<<YOUR_CODE>>')), now())
ON CONFLICT (key) DO UPDATE
   SET value      = EXCLUDED.value,
       updated_at = now();

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
--  تحقق: لازم يطلع true,false  (الرمز الصحيح يُقبل، الخطأ يُرفض)
-- ────────────────────────────────────────────────────────────────────────────
SELECT public.bypass_ban_with_code('__selftest_device__', '<<YOUR_CODE>>') ->> 'ok' AS correct_code_accepted,
       public.bypass_ban_with_code('__selftest_device__', 'wrong0000')           ->> 'ok' AS wrong_code_rejected;

-- تنظيف أثر الاختبار
DELETE FROM public.ban_bypasses WHERE device_id = '__selftest_device__';
