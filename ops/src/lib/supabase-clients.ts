import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PROJECTS } from "@/config/supabase";

export const chatClient = createClient(
  SUPABASE_PROJECTS.chat.url,
  SUPABASE_PROJECTS.chat.anonKey
);

export const anonClient = createClient(
  SUPABASE_PROJECTS.anon.url,
  SUPABASE_PROJECTS.anon.anonKey
);

export const achievementClient = createClient(
  SUPABASE_PROJECTS.achievement.url,
  SUPABASE_PROJECTS.achievement.anonKey
);
