import { supabase } from "@/integrations/supabase/client";

const KEY = "device_id_v1";
const COOKIE = "did";
const DEVICE_CHECK_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: PromiseLike<T>, fallback: T, timeoutMs = DEVICE_CHECK_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365 * 5;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

async function fingerprintHash(): Promise<string> {
  const parts = [
    navigator.userAgent,
    navigator.language,
    (navigator.languages || []).join(","),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    new Date().getTimezoneOffset().toString(),
    (navigator as any).hardwareConcurrency ?? "",
    (navigator as any).deviceMemory ?? "",
    (navigator as any).platform ?? "",
  ].join("|");
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  } catch {
    let h = 0;
    for (let i = 0; i < parts.length; i++) h = ((h << 5) - h + parts.charCodeAt(i)) | 0;
    return "fp_" + Math.abs(h).toString(36);
  }
}

let cachedIds: string[] | null = null;

export async function getDeviceIds(): Promise<string[]> {
  if (cachedIds) return cachedIds;
  let id = localStorage.getItem(KEY) || readCookie(COOKIE);
  if (!id) {
    id = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now()).toString();
  }
  try { localStorage.setItem(KEY, id); } catch {}
  writeCookie(COOKIE, id);

  const fp = await fingerprintHash();
  cachedIds = Array.from(new Set([id, fp]));
  return cachedIds;
}

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY) || readCookie(COOKIE);
  if (!id) {
    id = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now()).toString();
    try { localStorage.setItem(KEY, id); } catch {}
    writeCookie(COOKIE, id);
  } else {
    try { localStorage.setItem(KEY, id); } catch {}
    writeCookie(COOKIE, id);
  }
  return id;
}

export async function checkDeviceBanned(): Promise<{ device_id: string } | null> {
  const ids = await getDeviceIds();
  for (const id of ids) {
    try {
      const result = await withTimeout(
        (supabase as any).rpc("is_device_banned", { _device_id: id }),
        { data: false },
      );
      if (result.data === true) return { device_id: id };
    } catch {}
  }
  return null;
}

export async function registerDeviceForUser(userId: string) {
  const ids = await getDeviceIds();
  const rows = ids.map(device_id => ({
    user_id: userId,
    device_id,
    last_seen: new Date().toISOString(),
  }));
  try {
    await withTimeout(
      (supabase as any).from("user_devices").upsert(rows, { onConflict: "user_id,device_id" }),
      null,
    );
  } catch {}
}
