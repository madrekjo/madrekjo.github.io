import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL as CONFIG_URL, SUPABASE_PUBLISHABLE_KEY as CONFIG_KEY } from "@/config/supabase-config";

const SUPABASE_URL = CONFIG_URL && !CONFIG_URL.includes("YOUR-PROJECT-REF")
  ? CONFIG_URL
  : (import.meta.env.VITE_SUPABASE_URL as string);
const SUPABASE_PUBLISHABLE_KEY = CONFIG_KEY && !CONFIG_KEY.includes("YOUR-ANON")
  ? CONFIG_KEY
  : (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

if (!SUPABASE_URL) {
  console.error("⚠️ عدّل src/config/supabase-config.ts وحط رابط ومفتاح قاعدة البيانات");
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
// ملاحظة: مخطط القاعدة تغيّر (إزالة الجهاز + الهوية بالحساب). الأنواع المولّدة
// (types.ts) قديمة مؤقتاً، لذا نُبقي العميل بلا وسيط نوعي حتى تُولَّد الأنواع
// الجديدة بعد تنفيذ الـmigrations.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});