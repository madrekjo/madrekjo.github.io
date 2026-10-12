import { SSO_AUTH_BASE_URL, SSO_TARGET } from "@/config/sso-config";
import { supabase } from "@/integrations/supabase/client";

export interface SsoSectionSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
  user?: unknown;
}

const STORAGE_KEY = "mdk:sso:sutur";

export function ssoLoginUrl(): string {
  return `${SSO_AUTH_BASE_URL}/login?target=${encodeURIComponent(SSO_TARGET)}`;
}

export function getStoredSsoSession(): SsoSectionSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SsoSectionSession) : null;
  } catch {
    return null;
  }
}

function setStoredSsoSession(session: SsoSectionSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* تجاهل */
  }
}

export function clearStoredSsoSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* تجاهل */
  }
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
  const payload = (await res.json()) as Record<string, unknown>;
  const session = payload?.sutur as SsoSectionSession | undefined;
  if (!session?.access_token) {
    throw new Error("sutur session missing — section not open yet");
  }
  setStoredSsoSession(session);
  // ربط الجلسة بعميل supabase للقسم ليُستثمر الحارس والمزايا اللاحقة
  // (الحظر الشامل، تحويل المتصفح،...) مربوطة بالحساب.
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