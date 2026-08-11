import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { SIBLING_SUPABASE_URL, SIBLING_SUPABASE_ANON_KEY } from '@/config/sso-config';

// Supabase client مستقل لمشروع الإنجاز (achievement)
// `supabase` الرئيسي = مشروع الدردشة (الجلسة)، أما هذا = مشروع الإنجاز (البيانات).
// Import the achievement client like this:
// import { achievementSupabase } from "@/integrations/supabase/achievementClient";

export const achievementSupabase = createClient<Database>(SIBLING_SUPABASE_URL, SIBLING_SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
