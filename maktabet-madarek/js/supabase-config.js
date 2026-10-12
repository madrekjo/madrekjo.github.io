/* ============================================================
   مكتبة مدارك — إعدادات Supabase (جاهزة للربط القادم)
   ------------------------------------------------------------
   ⚠️ المفتاح هنا هو مفتاح «publishable» (عام) — آمن ليُحفظ في
   كود الواجهة ولا يعطي صلاحيات تجاوز سياسات RLS. لا تُضع أبداً
   service_role في أي ملف داخل المشروع.

   القاعدة التي نُفِّذ عليها ملف الـ migration:
   https://avfybjxkdlmzqpvbvdeq.supabase.co
   ------------------------------------------------------------
   الواجهة الحالية لا تتصل بعد بـ Supabase (ما زالت LocalStorage).
   عند الربط: استبدل طبقة MaktabetStore في js/store.js بالاستدعاءات
   التالية (الدوال موجودة في migration):
     - maktabet_login_admin(p_code)
     - maktabet_add_file(...) + رفع الملف إلى المخزن
     - maktabet_set_status(file_id, status, note)
     - maktabet_delete_file(file_id)
     - maktabet_increment_download(file_id)
   ============================================================ */

const MAKTABET_SUPABASE = {
  url: 'https://avfybjxkdlmzqpvbvdeq.supabase.co',
  publishableKey: 'sb_publishable_qHCI9qMqwqqAaf8PwPZ2Mw_cIhzFHbI',
  storageBucket: 'maktabet-library-files',
};

// مفتاح متوافق مع الصيغة القديمة إن احتاجها العميل لاحقاً:
// const ANON_FALLBACK = 'eyJ...'; // غير مطلوب حالياً

window.MAKTABET_SUPABASE = MAKTABET_SUPABASE;