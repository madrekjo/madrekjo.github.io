// إعدادات قاعدة بيانات Supabase لقسم «اكتب سؤالك»
// القيم هنا قابلة للنشر (publishable) — تُستخدم في العميل فقط.
// إن أردت التجاوز اترك المتغيرات في ملف .env داخل المجلد.

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://khqhlznlummkjdpssbds.supabase.co";
export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "sb_publishable_LJ47l76NmFo4lpLbMhi1WA_rO7WvtGC";

export const isSupabaseConfigured = (): boolean =>
  !!SUPABASE_URL &&
  SUPABASE_URL.startsWith("https://") &&
  !!SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes("YOUR-");