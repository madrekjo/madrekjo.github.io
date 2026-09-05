// بوابة القراءة الموحدة (Layer 2) — عنوان الـ Worker بعد نشره على Cloudflare.
//
// طالما القيمة أدناه فارغة، يقرأ التطبيق من Supabase مباشرة (السلوك الحالي تماماً).
// بعد تنفيذ دليل النشر (chat-worker/DEPLOY.md)، انسخ عنوان الـ Worker الناتج عن
// `wrangler deploy` هنا، مثل:
//
//   export const READ_GATEWAY_URL = "https://madarik-chat-cache.xxxxx.workers.dev";
export const READ_GATEWAY_URL = "https://madarik-chat-cache.abdalrhmanmaaith1.workers.dev";