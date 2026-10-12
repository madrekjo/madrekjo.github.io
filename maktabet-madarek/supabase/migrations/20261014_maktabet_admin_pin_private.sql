-- ============================================================
-- المكتبة — إخفاء رمز الإدارة (admin_pin) عن القراءة العامة
-- ------------------------------------------------------------
-- المشكلة:
--   مفتاح الواجهة العام (publishable / دور anon) كان يستطيع قراءة
--   كل أعمدة جدول maktabet_library_settings، ومنها admin_pin:
--       GET /rest/v1/maktabet_library_settings?select=admin_pin
--   أي أن أي زائر كان يمكنه معرفة رمز الإدارة والدخول كلوحة تحكم.
--
-- الحل:
--   إلغاء صلاحية قراءة الجدول عن anon/authenticated، ثم منح قراءة
--   الأعمدة التي تحتاجها الواجهة فقط (دون admin_pin).
--   دوال الدخول تعمل بـ SECURITY DEFINER فتقـرأ الرمز دون تأثّر.
--
-- ⚠️ عاجل بعد التنفيذ: غيّر رمز الإدارة لأن الرمز القديم صار مكشوفاً:
--       update public.maktabet_library_settings
--       set admin_pin = 'رمز-جديد-قوي', updated_at = now()
--       where id = 1;
-- ============================================================

-- 1) إلغاء قراءة الجدول كاملاً (بما فيه admin_pin)
revoke select on public.maktabet_library_settings from anon, authenticated;
revoke select on public.maktabet_library_settings from public;

-- 2) منح قراءة الأعمدة العامة فقط
grant select (id, library_enabled, max_size_bytes, updated_at)
  on public.maktabet_library_settings to anon, authenticated;

-- 3) إبقاء صلاحيات الخدمة الكاملة (اختياطي)
grant all on public.maktabet_library_settings to service_role;

-- للتحقق (يجب ألا يعيد العمود admin_pin):
--   select * from public.maktabet_library_settings where id = 1;
