/**
 * MADARIK OPS - Control Center Worker
 *
 * وسيط مركزي يحمل مفاتيح service_role بشكل آمن على الخادم.
 * واجهة الصفحة (React) لا تملك مفاتيح الخدمة — كل العمليات الإدارية
 * (حظر، حذف، تثبيت...) تمر عبر هذا الـ Worker بعد التحقق من كلمة المرور.
 *
 * يمكن نشر هذا الـ Worker مع متغيرات:
 *   wrangler secret put OPS_PASSWORD_HASH   (SHA-256 لكلمة المرور)
 *   wrangler secret put OPS_TOKEN_SECRET    (مفتاح توقيع التوكن)
 *   wrangler secret put CHAT_SERVICE_KEY
 *   wrangler secret put ANON_SERVICE_KEY
 *   wrangler secret put ACHIEVEMENT_SERVICE_KEY
 */

const CHAT_URL = "https://biabdoatwfteqwgjdxzc.supabase.co";
const ANON_URL = "https://dqrzsllhdcvykoisisoy.supabase.co";
const ACHIEVEMENT_URL = "https://itflhfhsfzrdfpxvlzrv.supabase.co";

const SESSION_TTL = 60 * 60 * 1000; // ساعة
const DEFAULT_ALLOWED_ORIGIN = "https://madrekjo.github.io";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(origin),
        status: 204,
      });
    }

    try {
      if (url.pathname === "/login" && request.method === "POST") {
        return handleLogin(request, env);
      }
      if (url.pathname === "/api" && request.method === "POST") {
        return handleApi(request, env);
      }
      if (url.pathname === "/health") {
        return json({ ok: true }, origin);
      }
      return json({ error: "not found" }, origin, 404);
    } catch (e) {
      return json({ error: e.message || "internal error" }, origin, 500);
    }
  },
};

function allowedOrigin(request, env) {
  const configOrigins = (env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGIN)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get("Origin");
  if (origin && configOrigins.includes(origin)) return origin;
  return null;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || DEFAULT_ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, origin, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

/* ---------------- Authentication Helpers ---------------- */

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function handleLogin(request, env) {
  const origin = allowedOrigin(request, env);
  const body = await request.json().catch(() => ({}));
  const { password } = body || {};
  if (!password) return json({ error: "كلمة المرور مطلوبة" }, origin, 400);

  const hash = await sha256(password);
  if (hash !== env.OPS_PASSWORD_HASH) {
    return json({ error: "كلمة المرور غير صحيحة" }, origin, 401);
  }

  const payload = {
    sub: "ops-root",
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL,
  };
  const token = await signToken(payload, env.OPS_TOKEN_SECRET);
  return json({ ok: true, token }, origin);
}

async function signToken(payload, secret) {
  const encoded = btoa(JSON.stringify(payload));
  const sig = await hmac(encoded, secret);
  return `${encoded}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token || !token.includes(".")) return null;
  const [encoded, sig] = token.split(".");
  const expected = await hmac(encoded, secret);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(atob(encoded));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmac(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ---------------- API Dispatch ---------------- */

async function handleApi(request, env) {
  const origin = allowedOrigin(request, env);
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");

  const payload = await verifyToken(token, env.OPS_TOKEN_SECRET);
  if (!payload) {
    return json({ error: "جلسة غير صالحة" }, origin, 401);
  }

  const body = await request.json().catch(() => ({}));
  const { target, action, params = {} } = body || {};
  if (!target || !action) {
    return json({ error: "بيانات ناقصة" }, origin, 400);
  }

  const services = await getServices(env);
  const svc = services[target];
  if (!svc) return json({ error: "قسم غير معروف" }, origin, 400);

  const result = await dispatch(svc, action, params);
  return json({ ok: true, result }, origin);
}

async function getServices(env) {
  return {
    chat: {
      url: CHAT_URL,
      key: env.CHAT_SERVICE_KEY,
    },
    anon: {
      url: ANON_URL,
      key: env.ANON_SERVICE_KEY,
    },
    achievement: {
      url: ACHIEVEMENT_URL,
      key: env.ACHIEVEMENT_SERVICE_KEY,
    },
  };
}

async function supabaseRequest(svc, method, path, body, query = "") {
  const res = await fetch(`${svc.url}/rest/v1/${path}?${query}`, {
    method,
    headers: {
      apikey: svc.key,
      Authorization: `Bearer ${svc.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

async function supabaseRpc(svc, fn, args = {}) {
  return supabaseRequest(svc, "POST", `rpc/${fn}`, args);
}

/* ---------------- Action Handlers ---------------- */

async function dispatch(svc, action, params) {
  switch (action) {
    /* ---- CHAT ---- */
    case "ban_user":
      return supabaseRequest(svc, "PATCH", "profiles", { is_banned: true }, `user_id=eq.${params.user_id}`);
    case "unban_user":
      return supabaseRequest(svc, "PATCH", "profiles", { is_banned: false, chat_banned: false }, `user_id=eq.${params.user_id}`);
    case "delete_user":
      return supabaseRpc(svc, "admin_delete_user", { _user_id: params.user_id });
    case "delete_post":
      return supabaseRpc(svc, "hard_delete_post", { _post_id: params.post_id });
    case "approve_post":
      return supabaseRpc(svc, "approve_post", { p_post_id: params.post_id });
    case "toggle_pin":
      return supabaseRequest(svc, "PATCH", "posts", { is_pinned: params.is_pinned }, `id=eq.${params.post_id}`);
    case "cancel_round":
      return supabaseRequest(svc, "PATCH", "study_rounds", { status: "cancelled", ended_at: new Date().toISOString() }, `id=eq.${params.round_id}`);

    /* ---- ANON ---- */
    case "delete_post":
      return supabaseRequest(svc, "DELETE", "posts", undefined, `id=eq.${params.post_id}`);
    case "toggle_pin":
      return supabaseRequest(svc, "PATCH", "posts", { pinned: params.pinned }, `id=eq.${params.post_id}`);
    case "toggle_hide":
      return supabaseRequest(svc, "PATCH", "posts", { hidden: params.hidden }, `id=eq.${params.post_id}`);
    case "ban_device":
      return supabaseRequest(svc, "POST", "blocked_devices", {
        device_id: params.device_id,
        reason: params.reason || "حظر من لوحة التحكم",
        created_at: new Date().toISOString(),
      });
    case "unban_device":
      return supabaseRequest(svc, "DELETE", "blocked_devices", undefined, `device_id=eq.${params.device_id}`);
    case "resolve_report":
      return supabaseRequest(svc, "PATCH", "reports", {
        status: params.action === "resolved" ? "resolved" : "dismissed",
        resolved_at: new Date().toISOString(),
        resolved_by: "ops-console",
      }, `id=eq.${params.report_id}`);
    case "set_site_enabled":
      return supabaseRequest(svc, "PATCH", "site_settings", { site_enabled: params.enabled, updated_at: new Date().toISOString() }, `id=eq.1`);
    case "set_chat_mode":
      return supabaseRequest(svc, "PATCH", "site_settings", { chat_mode_enabled: params.enabled, updated_at: new Date().toISOString() }, `id=eq.1`);

    /* ---- ACHIEVEMENT ---- */
    case "delete_user":
      return supabaseRequest(svc, "DELETE", "profiles", undefined, `user_id=eq.${params.user_id}`);
    case "end_round":
      return supabaseRequest(svc, "PATCH", "rounds", { status: "ended" }, `id=eq.${params.round_id}`);

    default:
      throw new Error(`إجراء غير معروف: ${action}`);
  }
}
