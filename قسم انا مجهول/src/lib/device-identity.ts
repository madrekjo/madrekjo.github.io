import { deviceFingerprint } from "@/lib/fingerprint";
import { getDeviceId } from "@/lib/device";

export type DeviceKind = "phone" | "tablet" | "computer";

export type DeviceIdentity = {
  kind: DeviceKind;
  kindLabel: string;
  platform: string;
  code: string;
  deviceId: string;
};

const KIND_LABEL: Record<DeviceKind, string> = {
  phone: "هاتف",
  tablet: "تابلت",
  computer: "حاسوب",
};

/** نوع الجهاز ونظامه — من UA وقياس المؤشر، بدون تخزين. */
export function detectDevice(): { kind: DeviceKind; label: string; platform: string } {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return { kind: "computer", label: KIND_LABEL.computer, platform: "" };

  const ua = navigator.userAgent || "";
  const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || "";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const shortSide = Math.min(screen?.width ?? 0, screen?.height ?? 0);
  const touch = navigator.maxTouchPoints ?? 0;

  if (/iPhone|iPod|Windows Phone|BlackBerry|Android.*Mobile/i.test(ua))
    return { kind: "phone", label: KIND_LABEL.phone, platform };

  if (/iPad|Android(?!.*Mobile)|Tablet|Silk/i.test(ua) || (coarse && shortSide >= 600))
    return { kind: "tablet", label: KIND_LABEL.tablet, platform };

  if (coarse && touch > 0 && shortSide > 0 && shortSide < 600)
    return { kind: "phone", label: KIND_LABEL.phone, platform };

  return { kind: "computer", label: KIND_LABEL.computer, platform };
}

/** رمز الجهاز: أول ٨ خانات من بصمة الجهاز، مقسومة ٤-٤. يُحسب من عتاد الجهاز. */
function formatCode(fp: string): string {
  const hex = (fp || "").replace(/[^0-9a-f]/gi, "").toUpperCase().slice(0, 8).padEnd(8, "0");
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/** رمز الجهاز الكامل (١٢ خانة) — أساس الهوية المرتبطة بالعتاد. */
async function fullCode(): Promise<string> {
  try {
    const fp = await deviceFingerprint();
    return (fp || "").replace(/[^0-9a-f]/gi, "").toLowerCase().slice(0, 12).padEnd(12, "0");
  } catch {
    return "";
  }
}

let resolved: Promise<void> | undefined;

/**
 * يربط الهوية برمز الجهاز: يستعيد المعرّف بعد مسح بيانات المتصفح، أو ينشئه.
 * لازم ينادى مرة واحدة قبل أول استدعاء لـ getDeviceId().
 */
export function resolveIdentity(): Promise<void> {
  if (!resolved) resolved = (async () => {
    const code = await fullCode();
    if (!code) return;
    const dev = detectDevice();
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await (supabase.rpc as any)("resolve_device_identity", {
        p_code: code,
        p_kind: dev.kind,
      });
      const id = (data as { device_id?: string } | null)?.device_id;
      if (id && id.length >= 8) {
        const prev = localStorage.getItem("anon_device_id");
        if (prev !== id) {
          const hadName = prev && prev !== id;
          localStorage.setItem("anon_device_id", id);
          if (hadName) {
            localStorage.setItem("anon_identity_restored", "1");
          }
        }
      }
    } catch {}
  })();
  return resolved;
}

export function identityWasRestored(): boolean {
  try {
    return sessionStorage.getItem("anon_identity_restored") === "1";
  } catch {
    return false;
  }
}

let cached: Promise<DeviceIdentity> | undefined;

export function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (typeof window === "undefined")
    return Promise.resolve({
      kind: "computer",
      kindLabel: KIND_LABEL.computer,
      platform: "",
      code: "--------",
      deviceId: "ssr-placeholder",
    });
  if (!cached) {
    cached = (async () => {
      const dev = detectDevice();
      let fp = "";
      try {
        fp = await deviceFingerprint();
      } catch {}
      return { ...dev, kindLabel: dev.label, code: formatCode(fp), deviceId: getDeviceId() };
    })();
  }
  return cached;
}
