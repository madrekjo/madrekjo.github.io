import { createClient } from "@supabase/supabase-js";
import {
  SIBLING_SUPABASE_URL,
  SIBLING_SUPABASE_ANON_KEY,
} from "@/config/sso-config";

/**
 * Supabase client موحد للمشروع الشقيق (الإنجاز).
 *
 * كان يُنشأ createClient() في 5 أماكن منفصلة داخل AuthContext و AuthCallback.
 * كل createClient() تُنشئ GoTrue instance مستقل有自己的 localStorage lock
 * و token refresh timer → تسبب lock contention و token refresh races.
 *
 * الحل: client واحد على مستوى Module يُستخدم في كل الأماكن.
 */
export const siblingSupabase = createClient(
  SIBLING_SUPABASE_URL,
  SIBLING_SUPABASE_ANON_KEY
);
