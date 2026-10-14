// عميل القائمة المركزية للحظر الموحّد (تعيش في قاعدة الشات).
// الإدارة بتحقّق البريد (owner/admin) عبر RPCs آمنة — لا نقرأ الجدول مباشرة.
const CHAT_REST_URL = "https://romocwtqzdnovfgtmwzb.supabase.co";
const CHAT_PUBLISHABLE_KEY = "sb_publishable_FxIiY1SHBKXkoByvKu0-Jg_msr2Qd45";

export type GlobalBan = {
  email: string;
  reason: string | null;
  banned_by: string | null;
  banned_at: string;
};

async function rpc<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 6000) : null;
  try {
    const res = await fetch(`${CHAT_REST_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: CHAT_PUBLISHABLE_KEY,
        Authorization: `Bearer ${CHAT_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res.ok) {
      let msg = `http_${res.status}`;
      try {
        const j = await res.json();
        msg = j?.message || j?.error_description || j?.hint || msg;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    return (await res.json()) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function listGlobalBans(adminEmail: string): Promise<GlobalBan[]> {
  if (!adminEmail) return [];
  const data = await rpc<GlobalBan[]>("list_global_bans", {
    p_admin_email: adminEmail.trim().toLowerCase(),
  });
  return Array.isArray(data) ? data : [];
}

export async function addGlobalBan(adminEmail: string, email: string, reason: string): Promise<void> {
  await rpc("add_global_ban", {
    p_admin_email: adminEmail.trim().toLowerCase(),
    p_email: email.trim().toLowerCase(),
    p_reason: reason.trim() || null,
  });
}

export async function removeGlobalBan(adminEmail: string, email: string): Promise<void> {
  await rpc("remove_global_ban", {
    p_admin_email: adminEmail.trim().toLowerCase(),
    p_email: email.trim().toLowerCase(),
  });
}

/** فحص الحظر المركزي لبريد (يستخدمه الدرع المباشر داخل التطبيق). */
export async function isGloballyBanned(email: string): Promise<boolean> {
  if (!email) return false;
  const res = await fetch(`${CHAT_REST_URL}/rest/v1/rpc/is_global_banned`, {
    method: "POST",
    headers: {
      apikey: CHAT_PUBLISHABLE_KEY,
      Authorization: `Bearer ${CHAT_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ p_email: email.trim().toLowerCase() }),
  });
  if (!res.ok) throw new Error(`ban_check_${res.status}`);
  return (await res.json()) === true;
}
