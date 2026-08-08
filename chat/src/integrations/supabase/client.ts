import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { SUPABASE_URL as CONFIG_URL, SUPABASE_PUBLISHABLE_KEY as CONFIG_KEY } from '@/config/supabase-config';

const SUPABASE_URL = CONFIG_URL && !CONFIG_URL.includes('YOUR-PROJECT-REF')
  ? CONFIG_URL
  : (import.meta.env.VITE_SUPABASE_URL as string);
const SUPABASE_PUBLISHABLE_KEY = CONFIG_KEY && !CONFIG_KEY.includes('YOUR-ANON')
  ? CONFIG_KEY
  : (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

if (!SUPABASE_URL) {
  console.error('⚠️ عدّل src/config/supabase-config.ts وحط رابط ومفتاح قاعدة البيانات');
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: localStorage, persistSession: true, autoRefreshToken: true }
});
