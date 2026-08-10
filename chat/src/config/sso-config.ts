// إعدادات SSO الموحدة عبر Cloudflare Worker
// القيم هنا قيم عامة (publishable/anon) وليست أسراراً.
// المشروع الشقيق: الإنجاز (achievement)

// رابط الـ Worker الفعلي على Cloudflare (workers.dev)
export const SSO_AUTH_BASE_URL = "https://madrekjo-sso.abdalrhmanmaaith1.workers.dev";

export const SSO_TARGET = "/chat/";

export const SIBLING_SUPABASE_URL = "https://ofltanaffcxoobfvlkii.supabase.co";
export const SIBLING_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mbHRhbmFmZmN4b29iZnZsa2lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1ODM0NjksImV4cCI6MjA5OTE1OTQ2OX0.AAPvkI0-ITwxIdkL-01rHFUJqAKDlUzGjHJeugOXRVY";
