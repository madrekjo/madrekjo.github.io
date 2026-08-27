import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function serverClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function extractIp(): string {
  const candidates = [
    getRequestHeader("cf-connecting-ip"),
    getRequestHeader("x-real-ip"),
    getRequestHeader("x-forwarded-for"),
  ].filter(Boolean) as string[];
  for (const raw of candidates) {
    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

const IP_SALT = "id-mjhwl-fp-v1";

/**
 * Records the visitor's device fingerprint (device_id + hashed IP + hashed UA)
 * on the server, then returns whether the device is banned.
 *
 * Automatically catches bans made in a previous session by matching the IP
 * hash against `banned_fingerprints` — this defeats incognito / new-device_id
 * bypass attempts.
 */
export const checkVisitor = createServerFn({ method: "POST" })
  .inputValidator((data: { device_id: string }) => {
    if (!data || typeof data.device_id !== "string" || data.device_id.length < 8 || data.device_id.length > 128) {
      throw new Error("invalid device");
    }
    return { device_id: data.device_id };
  })
  .handler(async ({ data }) => {
    const ip = extractIp();
    const ua = getRequestHeader("user-agent") ?? "";
    const ipHash = sha256(IP_SALT + "|" + ip);
    const uaHash = sha256(IP_SALT + "|" + ua);
    const sb = serverClient();
    const { data: result, error } = await sb.rpc("record_visitor_fingerprint", {
      p_device_id: data.device_id,
      p_ip_hash: ipHash,
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
  });

/**
 * Removes a device's own ban using a secret code — user-facing bypass path
 * from the ban screen (does nothing unless the code matches server-side).
 */
export const bypassOwnBan = createServerFn({ method: "POST" })
  .inputValidator((data: { device_id: string; code: string }) => {
    if (!data || typeof data.device_id !== "string" || data.device_id.length < 8) throw new Error("invalid");
    if (typeof data.code !== "string" || data.code.length > 32) throw new Error("invalid");
    return { device_id: data.device_id, code: data.code };
  })
  .handler(async ({ data }) => {
    const sb = serverClient();
    const { data: result } = await sb.rpc("bypass_ban_with_code", { p_device_id: data.device_id, p_code: data.code });
    const parsed = (result ?? { ok: false }) as { ok?: boolean };
    return { ok: !!parsed.ok };
  });

/**
 * Submits a user report on a post/comment. Enforces:
 *  - reporter is not banned
 *  - duplicate reports from the same device on the same content are ignored
 *  - reason text length limit
 */
export const submitReport = createServerFn({ method: "POST" })
  .inputValidator((data: {
    device_id: string;
    content_type: "post" | "comment" | "chat_post" | "chat_comment";
    content_id: string;
    reason_code: string;
    reason_text?: string;
  }) => {
    if (!data || typeof data.device_id !== "string" || data.device_id.length < 8) throw new Error("invalid device");
    if (!["post", "comment", "chat_post", "chat_comment"].includes(data.content_type)) throw new Error("invalid type");
    if (typeof data.content_id !== "string" || data.content_id.length < 8) throw new Error("invalid content id");
    if (typeof data.reason_code !== "string" || data.reason_code.trim().length === 0) throw new Error("reason required");
    const reason_text = typeof data.reason_text === "string" ? data.reason_text.slice(0, 500) : "";
    return {
      device_id: data.device_id,
      content_type: data.content_type,
      content_id: data.content_id,
      reason_code: data.reason_code.slice(0, 40),
      reason_text,
    };
  })
  .handler(async ({ data }) => {
    const sb = serverClient();
    const { error } = await sb.rpc("submit_report", {
      p_reporter_device_id: data.device_id,
      p_content_type: data.content_type,
      p_content_id: data.content_id,
      p_reason_code: data.reason_code,
      p_reason_text: data.reason_text || "",
    });
    if (error) {
      if (error.message?.toLowerCase().includes("banned")) return { ok: false, reason: "banned" };
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  });
