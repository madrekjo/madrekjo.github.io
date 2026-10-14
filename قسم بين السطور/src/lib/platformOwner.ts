// القاعدة الموحّدة: مالكو قسم الدردشة = أدمن في كل الأقسام.
// مصدر الحقيقة الوحيد: user_roles (role='owner') في قاعدة الدردشة، عبر RPC
// is_platform_owner. أي شخص يُرقّى مالكاً في الدردشة يصير أدمن هنا تلقائياً.
import { supabase } from "@/integrations/supabase/client";

const CHAT_REST_URL = "https://romocwtqzdnovfgtmwzb.supabase.co";
const CHAT_PUBLISHABLE_KEY = "sb_publishable_FxIiY1SHBKXkoByvKu0-Jg_msr2Qd45";

let ownerCache: { email: string; value: boolean; at: number } | null = null;

export async function isPlatformOwner(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (!e) return false;
  if (ownerCache && ownerCache.email === e && Date.now() - ownerCache.at < 300_000) {
    return ownerCache.value;
  }
  try {
    const res = await fetch(`${CHAT_REST_URL}/rest/v1/rpc/is_platform_owner`, {
      method: "POST",
      headers: {
        apikey: CHAT_PUBLISHABLE_KEY,
        Authorization: `Bearer ${CHAT_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_email: e }),
    });
    const value = res.ok ? (await res.json()) === true : false;
    ownerCache = { email: e, value, at: Date.now() };
    return value;
  } catch {
    return false;
  }
}

/** يقرأ إيميل الجلسة في هذا القسم ثم يفحص هل صاحبه مالك في الدردشة. */
export async function currentEmailIsPlatformOwner(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return await isPlatformOwner(data.session?.user?.email);
  } catch {
    return false;
  }
}
