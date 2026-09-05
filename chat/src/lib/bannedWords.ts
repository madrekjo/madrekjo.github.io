import { supabase } from "@/integrations/supabase/client";
import { cachedRead, invalidateCache } from "@/lib/dataLayer";
import { isReadGatewayConfigured, readGateway } from "@/lib/readGateway";

const BANNED_WORDS_KEY = "config:banned_words";

let cachedWords: string[] = [];

/** عند تفعيل البوابة يكون الكاش قصيراً (يعادل TTL البوابة) — قراءة مشتركة. */
const bannedWordsTtlMs = () => (isReadGatewayConfigured() ? 2 * 60 * 1000 : 60 * 60 * 1000);

/** علامة "أُضيفت/حُذفت كلمة" — تُمرَّر للبوابة كـ ?force=1 في أول قراءة تالية. */
let wordsDirty = false;

/**
 * الكلمات المحظورة تُجلب من الكاش ولا تضرب القاعدة عند كل كتابة/صفحة — كانت
 * تُجلب 133 مرة في الفترة نفسها. عند تفعيل البوابة تُقرأ من /banned_words.
 */
export async function loadBannedWords(force = false): Promise<string[]> {
  const list = await cachedRead<string[]>({
    key: BANNED_WORDS_KEY,
    ttlMs: bannedWordsTtlMs(),
    persist: true,
    force,
    fetcher: async () => {
      const dirty = wordsDirty;
      wordsDirty = false;
      const gateway = await readGateway<{ words: string[] }>("/banned_words", dirty);
      if (gateway && Array.isArray(gateway.words)) return gateway.words;
      const { data } = await supabase.from("banned_words").select("word");
      return (data || []).map((w) => w.word.toLowerCase());
    },
  });
  cachedWords = list;
  return cachedWords;
}

/** يُستدعى بعد إضافة/حذف كلمة من لوحة الإدارة حتى تُطبّق فوراً. */
export function invalidateBannedWords() {
  wordsDirty = true;
  invalidateCache(BANNED_WORDS_KEY);
}

export function containsBannedWord(text: string, isAdmin?: boolean): boolean {
  if (isAdmin) return false;
  const lower = text.toLowerCase();
  return cachedWords.some(word => lower.includes(word));
}