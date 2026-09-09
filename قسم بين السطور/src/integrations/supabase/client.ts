import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
} from "@/config/supabase-config";

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } }
);

export function publicFileUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${path}`;
}