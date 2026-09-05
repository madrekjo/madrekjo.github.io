import { useEffect, useRef } from "react";

/**
 * طبقة وسيطة (Layer 1) بين المكوّنات وبين Supabase — تخفّض الطلبات جذرياً:
 *
 * 1) TTL cache في الذاكرة: القراءات البطيئة التغيير تُقرأ من الكاش ولا تضرب
 *    القاعدة إلا بعد انتهاء المدة (مثل channel_settings / section_locks).
 * 2) Single-flight: لو طلبت أكثر من مكوّن/استدعاء نفس البيانات في نفس اللحظة
 *    يُرسل طلب شبكة واحد فقط ويُشارك الجميع وعدَهُ.
 * 3) useSmartPoll: استطلاع يعرف حالة التبويب — يتوقف عندما يكون التبويب مخفياً
 *    ويُحدّث فوراً عند العودة إليه بدل الاستطلاع المتواصل.
 *
 * الاستخدام:
 *   const data = await cachedRead({
 *     key: "config:channel_settings",
 *     ttlMs: 5 * 60 * 1000,
 *     fetcher: () => supabase.from("channel_settings").select("*"),
 *   });
 *
 * التخزين الاختياري persist يضع القيمة في localStorage أيضاً فيبقى الكاش
 * صالحاً عبر إعادة تحميل الصفحة (يقلّل الطلبات عند كل فتح تبويب/صفحة).
 */

const CACHE_VERSION = "v3";
const LOCAL_PREFIX = `mdk_cache_${CACHE_VERSION}_`;

interface Entry<T> {
  expiresAt: number;
  value: T;
}

const memory = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const now = () => Date.now();

function localKey(key: string) {
  return `${LOCAL_PREFIX}${key}`;
}

function readLocal<T>(key: string): Entry<T> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(localKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || typeof parsed.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal<T>(key: string, entry: Entry<T>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(localKey(key), JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

function removeStorageFor(prefix: string) {
  if (typeof localStorage === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LOCAL_PREFIX)) {
        const rawKey = key.slice(LOCAL_PREFIX.length);
        if (rawKey === prefix || rawKey.startsWith(prefix)) doomed.push(key);
      }
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

interface CachedReadOptions<T> {
  /** مفتاح فريد للبيانات — استخدمه نفسه لإعادة القراءة/الإبطال. */
  key: string;
  /** مدة صلاحية الكاش بالمللي ثانية. */
  ttlMs: number;
  /** دالة تجلب البيانات من Supabase عند انتهاء الكاش. */
  fetcher: () => Promise<T>;
  /** true = يتجاوز الكاش ويجلب من الشبكة حتماً (بدون إلغاء مخزون السفر). */
  force?: boolean;
  /** تخزين اختياري في localStorage ليبقى الكاش بعد إعادة تحميل الصفحة. */
  persist?: boolean;
}

/** يقرأ من الكاش إن كان صالحاً، وإلا يجلب من الشبكة (بضمان طلب واحد للمفتاح). */
export async function cachedRead<T>({
  key,
  ttlMs,
  fetcher,
  force = false,
  persist = false,
}: CachedReadOptions<T>): Promise<T> {
  if (!force) {
    const memoryHit = memory.get(key) as Entry<T> | undefined;
    if (memoryHit && memoryHit.expiresAt > now()) return memoryHit.value;

    if (persist) {
      const localHit = readLocal<T>(key);
      if (localHit && localHit.expiresAt > now()) {
        memory.set(key, localHit);
        return localHit.value;
      }
    }

    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
  }

  const promise = fetcher()
    .then((value) => {
      const entry: Entry<T> = { expiresAt: now() + ttlMs, value };
      memory.set(key, entry);
      if (persist) writeLocal(key, entry);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * يبطل مفاتيح الكاش التي تطابق البادئة (أو المفتاح الكامل):
 *   invalidateCache("config:section_locks")  // مفتاح واحد
 *   invalidateCache("auth:")                 // كل مفاتيح auth
 */
export function invalidateCache(prefix: string) {
  for (const key of Array.from(memory.keys())) {
    if (key === prefix || key.startsWith(prefix)) memory.delete(key);
  }
  removeStorageFor(prefix);
}

/** يمسح كامل طبقة الكاش (يُستعمل عند تسجيل الخروج). */
export function clearAllCache() {
  memory.clear();
  inflight.clear();
  removeStorageFor("");
}

/**
 * استطلاع ذكي: يعمل فقط عندما يكون التبويب ظاهراً.
 * - عند التركيب: ينفّذ فوراً ثم يبدأ الفاصل (نفس سلوك setInterval الحالي).
 * - عند إخفاء التبويب: يتوقف الاستطلاع بالكامل (لا طلبات خلف الكواليس).
 * - عند العودة للتبويب: يُنفّذ فوراً (بيانات حديثة) ثم يستأنف الفاصل.
 */
export function useSmartPoll(
  callback: () => void,
  intervalMs: number,
  deps: React.DependencyList = [],
  immediate = true
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let visible = typeof document !== "undefined" && document.visibilityState === "visible";

    const start = (fireNow: boolean) => {
      if (timer !== null) return;
      if (fireNow || immediate) cbRef.current();
      timer = setInterval(() => cbRef.current(), intervalMs);
    };

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      const v = typeof document !== "undefined" && document.visibilityState === "visible";
      if (v && !visible) start(true);
      else if (!v && visible) stop();
      visible = v;
    };

    start(false);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
    // الفاصل الموقّت هو "deps" — والـ callback يمر عبر ref عمداً حتى لا يُعاد التركيب.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}