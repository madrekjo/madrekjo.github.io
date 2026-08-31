import { supabase } from "@/integrations/supabase/client";

async function sha256Hex(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

let uaHashPromise: Promise<string> | undefined;
function userAgentHash(): Promise<string> {
  if (!uaHashPromise) uaHashPromise = sha256Hex("anon-ua|" + (navigator.userAgent || ""));
  return uaHashPromise;
}

/**
 * Records the visitor's device fingerprint (device_id + hashed UA) and returns
 * whether the device is banned. Runs fully client-side against Supabase RPC.
 */
export async function checkVisitor({ data }: { data: { device_id: string } }) {
  if (!data || typeof data.device_id !== "string" || data.device_id.length < 8 || data.device_id.length > 128) {
    throw new Error("invalid device");
  }
  const uaHash = await userAgentHash();
  const { data: result, error } = await (supabase.rpc as any)("record_visitor_fingerprint", {
    p_device_id: data.device_id,
    p_ip_hash: "unknown",
    p_ua_hash: uaHash,
  });
  if (error) {
    return { banned: false as boolean, reason: null as string | null, expires_at: null as string | null, evidence_url: null as string | null };
  }
  const parsed = (result ?? { banned: false }) as { banned?: boolean; reason?: string; expires_at?: string; evidence_url?: string };
  return {
    banned: !!parsed.banned,
    reason: parsed.reason ?? null,
    expires_at: parsed.expires_at ?? null,
    evidence_url: parsed.evidence_url ?? null,
  };
}

/**
 * Removes a device's own ban using a secret code — user-facing bypass path
 * from the ban screen (does nothing unless the code matches server-side).
 */
export async function bypassOwnBan({ data }: { data: { device_id: string; code: string } }) {
  if (!data || typeof data.device_id !== "string" || data.device_id.length < 8) throw new Error("invalid");
  if (typeof data.code !== "string" || data.code.length > 32) throw new Error("invalid");
  const { data: result } = await (supabase.rpc as any)("bypass_ban_with_code", {
    p_device_id: data.device_id,
    p_code: data.code,
  });
  const parsed = (result ?? { ok: false }) as { ok?: boolean };
  return { ok: !!parsed.ok };
}

/**
 * Submits a user report on a post/comment. Enforces:
 *  - reporter is not banned
 *  - duplicate reports from the same device on the same content are ignored
 *  - reason text length limit
 */
export async function submitReport({ data }: { data: {
  device_id: string;
  content_type: "post" | "comment" | "chat_post" | "chat_comment";
  content_id: string;
  reason_code: string;
  reason_text?: string;
} }) {
  if (!data || typeof data.device_id !== "string" || data.device_id.length < 8) throw new Error("invalid device");
  if (!["post", "comment", "chat_post", "chat_comment"].includes(data.content_type)) throw new Error("invalid type");
  if (typeof data.content_id !== "string" || data.content_id.length < 8) throw new Error("invalid content id");
  if (typeof data.reason_code !== "string" || data.reason_code.trim().length === 0) throw new Error("reason required");
  const reason_text = typeof data.reason_text === "string" ? data.reason_text.slice(0, 500) : "";

  const { error } = await (supabase.rpc as any)("submit_report", {
    p_reporter_device_id: data.device_id,
    p_content_type: data.content_type,
    p_content_id: data.content_id,
    p_reason_code: data.reason_code.slice(0, 40),
    p_reason_text: reason_text || "",
  });
  if (error) {
    if (error.message?.toLowerCase().includes("banned")) return { ok: false, reason: "banned" };
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}