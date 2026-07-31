import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

declare global {
  interface Window {
    CONFIG?: {
      supabaseUrl: string;
      supabaseAnonKey: string;
    };
  }
}

const SUPABASE_URL = window.CONFIG?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = window.CONFIG?.supabaseAnonKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});

// Force-load session from localStorage if getSession fails to pick it up
async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // Try to load the session from the known localStorage key
    const key = `sb-${SUPABASE_URL.match(/\/\/([^.]+)/)?.[1]}-auth-token`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.access_token) {
          await supabase.auth.setSession({
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
          });
        }
      } catch (e) {
        // ignore
      }
    }
  }
}

ensureSession();
