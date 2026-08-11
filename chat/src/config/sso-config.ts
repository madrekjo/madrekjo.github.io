// إعدادات SSO الموحدة عبر Cloudflare Worker
// القيم هنا قيم عامة (publishable/anon) وليست أسراراً.
// المشروع الشقيق: الإنجاز (achievement)

// رابط الـ Worker الفعلي على Cloudflare (workers.dev)
export const SSO_AUTH_BASE_URL = "https://madrekjo-sso.abdalrhmanmaaith1.workers.dev";

export const SSO_TARGET = "/chat/";

// مشروع الإنجاز (achievement) — المشروع الشقيق المستخدم لإنشاء جلسته عند تسجيل الدخول الموحد.
// لا ننقل أي أسرار هنا؛ هذه القيم publishable/anon عامة.
export const SIBLING_SUPABASE_URL = "https://itflhfhsfzrdfpxvlzrv.supabase.co";
export const SIBLING_SUPABASE_ANON_KEY =
  "sb_publishable_3mypt4J1F0sG5RD6oTSZZg_6PNgwoyY";
