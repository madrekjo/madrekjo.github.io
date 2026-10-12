import { SSO_AUTH_BASE_URL, SSO_TARGET } from "@/config/sso-config";
import { supabase } from "@/integrations/supabase/client";

export interface SsoSectionSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
  user?: unknown;
}

// مفتاح الجلسة الموحّدة — يشترك فيه كل أقسام المنصة (نفس النطاق madrekjo.study).
const SHARED_KEY = "mdk:sso:session";

type SharedPayload = Record<string, unknown>;

function readShared(): SharedPayload {
  try {
    const raw = localStorage.getItem(SHARED_KEY);
    return raw ? (JSON.parse(raw) as SharedPayload) : {};
  } catch {
    return {};
  }
}

function writeShared(payload: SharedPayload): void {
  try {
    localStorage.setItem(SHARED_KEY, JSON.stringify(payload));
  } catch {
    /* تجاهل */
  }
}

export function ssoLoginUrl(): string {
  return `${SSO_AUTH_BASE_URL}/login?target=${encodeURIComponent(SSO_TARGET)}`;
}

export function unifiedLoginUrl(): string {
  return `/login/?from=${encodeURIComponent(SSO_TARGET)}`;
}

export function getStoredSsoSession(): SsoSectionSession | null {
  const session = readShared().sutur as SsoSectionSession | undefined;
  return session?.access_token ? session : null;
}

function setStoredSsoSession(session: SsoSectionSession): void {
  const payload = readShared();
  payload.sutur = session;
  writeShared(payload);
}

export function clearStoredSsoSession(): void {
  const payload = readShared();
  delete payload.sutur;
  writeShared(payload);
}

export async function consumeSsoTicket(ticket: string): Promise<SsoSectionSession> {
  const res = await fetch(
    `${SSO_AUTH_BASE_URL}/session?ticket=${encodeURIComponent(ticket)}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sso session failed (${res.status}): ${text.slice(0, 160)}`);
  }
  const payload = (await res.json()) as SharedPayload;
  const session = payload?.sutur as SsoSectionSession | undefined;
  if (!session?.access_token) {
    throw new Error("sutur session missing — section not open yet");
  }
  // احفظ كامل الحمولة في الجلسة الموحّدة (لا نُسقط باقي الأقسام).
  writeShared(payload);
  // ربط الجلسة بعميل supabase للقسم ليُستثمر الحارس والمزايا اللاحقة
  // (الحظر الشامل...) مربوطة بالحساب.
  try {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  } catch {
    // طبقة البيانات في القسم تعمل بمفتاح الأنون + معرف الجهاز؛
    // فشل الربط هنا لا يمنع الدخول.
  }
  return session;
}

export function logout(): void {
  clearStoredSsoSession();
  try {
    void supabase.auth.signOut();
  } catch {
    /* تجاهل */
  }
  window.location.replace("/sutur/");
}