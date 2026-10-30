import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { SIBLING_SUPABASE_URL, SIBLING_SUPABASE_ANON_KEY } from '@/config/sso-config';

// Supabase client لمشروع الإنجاز (achievement) — المصدر الأساسي لجلسة الدخول والبيانات.
// الدردشة قسم اختياري ولا تُشترط لجلسة الإنجاز.
// Import the achievement client like this:
// import { achievementSupabase } from "@/integrations/supabase/achievementClient";

export const achievementSupabase = createClient<Database>(SIBLING_SUPABASE_URL, SIBLING_SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
