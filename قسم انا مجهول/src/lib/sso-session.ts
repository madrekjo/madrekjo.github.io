// قراءة خام لسجل الجلسة الموحّد `mdk:sso:session` المكتوب من صفحة /login/.
// نطابق شريحة المشروع بالمرجع (ref) لا بالاسم، ونستخرج الإيميل للتعرّف على
// المالك حتى قبل أن تُثبَّت جلسة القسم.
export const SSO_KEY = "mdk:sso:session";
const ANON_PROJECT_REF = "jmucsccdxxizvqtkyieq";

export type SsoSlice = { access_token?: string; refresh_token?: string };
export type SsoPayload = Record<string, SsoSlice | undefined>;

export function readSsoPayload(): SsoPayload | null {
  try {
    const raw = localStorage.getItem(SSO_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && typeof p === "object" ? (p as SsoPayload) : null;
  } catch {
    return null;
  }
}

export function decodeJwt(token?: string): Record<string, unknown> | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(pad)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function belongsToProject(token?: string, ref = ANON_PROJECT_REF): boolean {
  const c = decodeJwt(token);
  if (!c) return false;
  if (c.ref === ref) return true;
  return typeof c.iss === "string" && c.iss.includes(ref);
}

/** شريحة جلسة هذا القسم — تُطابَق بمرجع المشروع لا بالاسم. */
export function sliceForAnonProject(payload: SsoPayload | null = readSsoPayload()): SsoSlice | null {
  if (!payload) return null;
  const named = payload["anon"];
  if (named?.access_token && belongsToProject(named.access_token)) return named;
  for (const key of Object.keys(payload)) {
    const s = payload[key];
    if (s?.access_token && belongsToProject(s.access_token)) return s;
  }
  return null;
}

/** إيميل حساب الجلسة الموحّدة (شريحة القسم أولاً ثم أي شريحة). */
export function ssoEmail(payload: SsoPayload | null = readSsoPayload()): string | null {
  if (!payload) return null;
  const ordered: SsoSlice[] = [];
  const main = sliceForAnonProject(payload);
  if (main) ordered.push(main);
  for (const key of Object.keys(payload)) {
    const s = payload[key];
    if (s) ordered.push(s);
  }
  for (const s of ordered) {
    const e = decodeJwt(s.access_token)?.email;
    if (typeof e === "string" && e) return e;
  }
  return null;
}
