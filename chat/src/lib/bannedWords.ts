import { supabase } from "@/integrations/supabase/client";

let cachedWords: string[] = [];

export async function loadBannedWords() {
  const { data } = await supabase.from("banned_words").select("word");
  cachedWords = data?.map(w => w.word.toLowerCase()) || [];
  return cachedWords;
}

export function containsBannedWord(text: string, isAdmin?: boolean): boolean {
  if (isAdmin) return false;
  const lower = text.toLowerCase();
  return cachedWords.some(word => lower.includes(word));
}
