import { cachedRead, invalidateCache } from "@/lib/dataLayer";
import { isReadGatewayConfigured, readGateway } from "@/lib/readGateway";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * بيانات عامة (إعدادات) منخفضة التغيير تُقرأ من كاش مشترك بين كل قسم التطبيق.
 * هذا يلغي الطلبات المتكررة المتطابقة:
 *   channel_settings (كانت 134 طلباً) , section_locks (133+126+13+3+1)،
 *   banned_words (133) , role_permissions (24).
 *
 * كل مقروءات الصفحات تستخدم نفس المفتاح: أول طلب بالجلسة يضرب القاعدة مرة
 * واحدة، والباقي يقرأ من الكاش حتى انتهاء TTL.
 */

export const CHANNEL_SETTINGS_KEY = "config:channel_settings";
export const SECTION_LOCKS_KEY = "config:section_locks";
export const BANNED_WORDS_KEY = "config:banned_words";
export const ADMIN_IDS_KEY = "config:admin_ids";

export interface SectionLockData {
  locked: boolean;
  message: string | null;
  locked_until: string | null;
}

export type SectionLocksMap = Record<string, SectionLockData>;

/** خريطة القنوات المفتوحة/المغلقة (مثلما كان يُحسب في Chat.tsx). */
export type ChannelSettingsMap = Record<string, boolean>;

type SectionLockRow = Database["public"]["Tables"]["section_locks"]["Row"];

interface ChannelSettingsRow {
  channel: string;
  enabled: boolean | null;
}

const toSettingsMap = (rows: ChannelSettingsRow[]): ChannelSettingsMap => {
  const map: ChannelSettingsMap = { all: true, male: true, female: true, "09": true, "10": true };
  (rows || []).forEach((r) => {
    map[r.channel] = !!r.enabled;
  });
  return map;
};

const toLocksMap = (rows: SectionLockRow[]): SectionLocksMap => {
  const map: SectionLocksMap = {};
  (rows || []).forEach((r) => {
    map[r.section] = {
      locked: !!r.locked,
      message: r.message ?? null,
      locked_until: r.locked_until ?? null,
    };
  });
  return map;
};

/**
 * عند تفعيل البوابة (Layer 2) يكون كاش المتصفح قصيراً (يعادل TTL البوابة) لأن
 * تكلفة الشبكة أصبحت قراءة مشتركة واحدة فتنتشر تعديلات الإدارة خلال دقيقة؛
 * أما قبل النشر فالبيانات ثابتة فيُبقى كاش طويل: ساعة كاملة + إبطال فوري
 * من لوحة الإدارة (invalidateAppConfig).
 */
const configTtlMs = () => (isReadGatewayConfigured() ? 60 * 1000 : 60 * 60 * 1000);

/** علامة "حدث تعديل إداري" — تُمرَّر للبوابة كـ ?force=1 في أول قراءة تالية. */
let configDirty = false;
let configInflight: Promise<{ channels: ChannelSettingsMap | null; locks: SectionLocksMap | null }> | null = null;

function consumeConfigDirty(): boolean {
  const dirty = configDirty;
  configDirty = false;
  return dirty;
}

/**
 * جلب واحد مشترك لإعدادات /config (قنوات + أقفال دفعة واحدة) عبر البوابة؛
 * المتصلون المتزامنون يتشاركون نفس الوعد فلا يتكرر الطلب. عند فشل البوابة
 * تعود حقول null ويتراجع كل متصل إلى Supabase بنفسه.
 */
function loadGatewayConfig(): Promise<{ channels: ChannelSettingsMap | null; locks: SectionLocksMap | null }> {
  if (!configInflight) {
    const dirty = consumeConfigDirty();
    configInflight = readGateway<{ channels: ChannelSettingsMap; locks: SectionLocksMap }>("/config", dirty)
      .then((cfg) => cfg ?? { channels: null, locks: null })
      .finally(() => { configInflight = null; });
  }
  return configInflight;
}

/** قنوات الدردشة (تفعيل/تعطيل) — قراءة مشتركة: بوابة || Supabase. */
export function loadChannelSettings(): Promise<ChannelSettingsMap> {
  return cachedRead<ChannelSettingsMap>({
    key: CHANNEL_SETTINGS_KEY,
    ttlMs: configTtlMs(),
    persist: true,
    fetcher: async () => {
      const gateway = await loadGatewayConfig();
      if (gateway.channels) return gateway.channels;
      // جدول channel_settings غير مضمّن في أنواع Supabase المولّدة بعد.
      const { data } = await (supabase as any).from("channel_settings").select("*");
      return toSettingsMap((data as ChannelSettingsRow[] | null) || []);
    },
  });
}

/** أقفال الأقسام كاملة — قراءة مشتركة مع القنوات من نفس حِزمة /config. */
export function loadSectionLocks(force = false): Promise<SectionLocksMap> {
  return cachedRead<SectionLocksMap>({
    key: SECTION_LOCKS_KEY,
    ttlMs: configTtlMs(),
    persist: true,
    force,
    fetcher: async () => {
      const gateway = await loadGatewayConfig();
      if (gateway.locks) return gateway.locks;
      const { data } = await supabase
        .from("section_locks")
        .select("section, locked, message, locked_until");
      return toLocksMap((data as SectionLockRow[] | null) || []);
    },
  });
}

/** حالة قفل قسم واحد (بوابة SectionGate) — force للقراءة الفورية عند "تحقق الآن". */
export async function getSectionLockData(section: string, force = false): Promise<SectionLockData | null> {
  const map = await loadSectionLocks(force);
  return map[section] ?? null;
}

/**
 * مجموعة معرّفات الأدمن — قراءة مشتركة بين كل صفحات التطبيق (كانت تُطلب مع
 * كل تحميل فيد ×81 + لكل دخول). كاش ساعة كاملة؛ يُبطل عند أي add/remove_role.
 */
export async function loadAdminUserIds(): Promise<Set<string>> {
  const ids = await cachedRead<string[]>({
    key: ADMIN_IDS_KEY,
    ttlMs: 60 * 60 * 1000,
    persist: true,
    fetcher: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      return (data || []).map((r) => r.user_id);
    },
  });
  return new Set(ids);
}

/** يفحص هل القفل ما زال سارياً حسب locked_until. */
export function isSectionEffectivelyLocked(lock: SectionLockData | null | undefined): boolean {
  if (!lock || !lock.locked) return false;
  if (!lock.locked_until) return true;
  return new Date(lock.locked_until) > new Date();
}

/** إبطال كل مفاتيح الإعدادات (بعد أي تعديل من لوحة الإدارة). */
export function invalidateAppConfig() {
  configDirty = true;
  invalidateCache(CHANNEL_SETTINGS_KEY);
  invalidateCache(SECTION_LOCKS_KEY);
  invalidateCache(BANNED_WORDS_KEY);
  invalidateCache(ADMIN_IDS_KEY);
}