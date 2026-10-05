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

/** رمز الجهاز (من العتاد فقط) — قد تتطابق بين أجهزة متشابهة. */
async function fullCode(): Promise<string> {
  try {
    const fp = await deviceFingerprint();
    return (fp || "").replace(/[^0-9a-f]/gi, "").toLowerCase().slice(0, 12).padEnd(12, "0");
  } catch {
    return "";
  }
}

const SALT_KEY = "anon_visitor_salt";
const VISITOR_KEY = "anon_visitor_code";

function salt(): string {
  let s = localStorage.getItem(SALT_KEY);
  if (!s || s.length < 8) {
    s = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(SALT_KEY, s);
  }
  return s;
}

let resolved: Promise<void> | undefined;

/**
 * بصمة الزائر: device_code + salt خاص فيه.
 * - مستخدمان على جهاز واحد ← بصمتان مختلفتان (لا تشارك ولا تصادم)
 * - نفس المستخدم على نفس الجهاز ← نفس البصمة
 * salt لا يُشارَك مع أحد، فلا يمكن أن يُشتق جهازان متطابقان من بعضهما.
 */
export function resolveIdentity(): Promise<void> {
  if (!resolved) resolved = (async () => {
    const deviceCode = await fullCode();
    if (!deviceCode) return;
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await (supabase.rpc as any)("issue_visitor_code", {
        p_device_code: deviceCode,
        p_salt: salt(),
      });
      const vc = (data as { visitor_code?: string } | null)?.visitor_code;
      if (vc && vc.length >= 8) {
        localStorage.setItem(VISITOR_KEY, vc);
        sessionStorage.setItem("anon_visitor_code", vc);
        sessionStorage.removeItem("anon_identity_restored");
      }
    } catch {}
  })();
  return resolved;
}

export function visitorCode(): string {
  try {
    return sessionStorage.getItem("anon_visitor_code") || localStorage.getItem(VISITOR_KEY) || "";
  } catch {
    return "";
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
