import { invalidateCache } from "@/lib/dataLayer";
import { READ_GATEWAY_URL } from "@/config/worker-config";
import { isReadGatewayConfigured } from "@/lib/readGateway";

/**
 * إبطال خاص بجدول واحد (Table-Specific Invalidation).
 *
 * كل قسم/صفحة تستقل بكاشها؛ وعند أي كتابة نقوم بإبطال كاش الجدول المتأثر فقط
 * (محلياً في المتصفح + stamp في بوابة القراءة) — بدون clearAllCache أو كَسْر
 * كاش الأقسام الأخرى.
 *
 * الجداول غير المخزّنة في البوابة تُتجاهل في الطرف الآخر (لا طلب شبكة تقريباً).
 */

const GATEWAY_TIMEOUT_MS = 3000;

/**
 * الجداول المخزّنة في الـ Worker: أي تغيير فيها يستدعي POST /invalidate
 * لرفع stamp المجموعة (feed|config|rounds|banned_words|...).
 */
const GATEWAY_TABLES = new Set([
  "posts", "comments", "likes", "comment_likes", "profiles",
  "channel_settings", "section_locks", "user_roles", "banned_words",
  "study_rounds", "round_participants", "round_meetings", "round_completions", "study_records",
]);

/**
 * الجداول المخزّنة محلياً في المتصفح (cachedRead/localStorage): بادئات
 * المفاتيح التي يجب إبطالها عند تغيير ذلك الجدول.
 */
const LOCAL_PREFIXES: Record<string, string[]> = {
  profiles: ["auth:profile:"],
  user_roles: ["auth:roles:", "config:admin_ids"],
  channel_settings: ["config:channel_settings"],
  section_locks: ["config:section_locks"],
  banned_words: ["config:banned_words"],
  posts: [],
  comments: [],
  likes: [],
  comment_likes: [],
  study_rounds: ["rounds:"],
};

const importConfig = () =>
  ({ READ_GATEWAY_URL, isReadGatewayConfigured }) as const;

/**
 * إبطال جدول واحد: يمسح كاشات المتصفح المرتبطة ثم يُخبر البوابة (fire-and-forget).
 * لا يرمي أبداً — أي فشل شبكة يُتجاهل بصمت (توافق مع البوابة القديمة قبل النشر).
 */
export async function invalidateTable(table: string): Promise<void> {
  const t = (table || "").trim().toLowerCase();
  if (!t) return;

  const prefixes = LOCAL_PREFIXES[t] || [];
  for (const prefix of prefixes) {
    invalidateCache(prefix);
  }

  const { READ_GATEWAY_URL: url, isReadGatewayConfigured: configured } = importConfig();
  if (!configured() || !GATEWAY_TABLES.has(t) || !url) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
    await fetch(`${url}/invalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: t }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    /* تجاهل — البوابة قديمة لا تعرف /invalidate بعد */
  }
}