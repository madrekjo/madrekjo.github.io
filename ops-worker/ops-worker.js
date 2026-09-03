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
        return await handleLogin(request, env);
      }
      if (url.pathname === "/api" && request.method === "POST") {
        return await handleApi(request, env);
      }
      if (url.pathname === "/health") {
        return json({ ok: true }, origin);
      }
      return json({ error: "not found" }, origin, 404);
    } catch (e) {
      return json({ error: e?.message || "internal error" }, origin, 500);
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
      id: "chat",
      url: CHAT_URL,
      key: env.CHAT_SERVICE_KEY,
    },
    anon: {
      id: "anon",
      url: ANON_URL,
      key: env.ANON_SERVICE_KEY,
    },
    achievement: {
      id: "achievement",
      url: ACHIEVEMENT_URL,
      key: env.ACHIEVEMENT_SERVICE_KEY,
    },
  };
}

async function supabaseRequest(svc, method, path, body, query = "") {
  const prefer = method === "UPSERT" ? "resolution=merge-duplicates,return=representation" : "return=representation";
  const httpMethod = method === "UPSERT" ? "POST" : method;
  const res = await fetch(`${svc.url}/rest/v1/${path}?${query}`, {
    method: httpMethod,
    headers: {
      apikey: svc.key,
      Authorization: `Bearer ${svc.key}`,
      "Content-Type": "application/json",
      Prefer: prefer,
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

/* =====================================================================
 * builders for REST paths/query params (PostgREST safe escaping)
 * =================================================================== */

function esc(v) {
  return String(v).replace(/[.*]/g, (c) => `\\${c}`);
}

function eq(name, v) {
  return `${name}=eq.${esc(v)}`;
}

function inList(name, vals) {
  return `${name}=in.(${vals.map(esc).join(",")})`;
}

function orQuery(...conds) {
  return `or=${conds.map((c) => `(${c})`).join(",")}`;
}

async function dispatch(svc, action, params) {
  switch (action) {
    /* ====================== CHAT (biabdoatwfteqwgjdxzc) ====================== */

    /* --- users / moderation --- */
    case "ban_user":
      return supabaseRequest(svc, "PATCH", "profiles", { is_banned: true }, eq("user_id", params.user_id));
    case "unban_user":
      return supabaseRequest(svc, "PATCH", "profiles", { is_banned: false, chat_banned: false }, eq("user_id", params.user_id));
    case "toggle_chat_ban":
      return supabaseRequest(svc, "PATCH", "profiles", { chat_banned: !!params.chat_banned }, eq("user_id", params.user_id));
    case "set_timeout":
      return supabaseRequest(svc, "PATCH", "profiles", { timeout_until: params.timeout_until || null }, eq("user_id", params.user_id));
    case "rename_user":
      return supabaseRequest(svc, "PATCH", "profiles", { full_name: params.full_name }, eq("user_id", params.user_id));
    case "set_gender":
      return supabaseRequest(svc, "PATCH", "profiles", { gender: params.gender }, eq("user_id", params.user_id));
    case "set_theme":
      return supabaseRequest(svc, "PATCH", "profiles", { theme: params.theme }, eq("user_id", params.user_id));
    case "set_field":
      return supabaseRequest(svc, "PATCH", "profiles", { field: params.field }, eq("user_id", params.user_id));

    /* --- delete user (chat RPC) --- */
    case "delete_user":
      if (svc.id === "achievement") {
        return supabaseRequest(svc, "DELETE", "profiles", undefined, eq("user_id", params.user_id));
      }
      return supabaseRpc(svc, "admin_delete_user", { _user_id: params.user_id });

    /* --- posts / comments --- */
    case "delete_post":
      if (svc.id === "anon") {
        return supabaseRequest(svc, "DELETE", "posts", undefined, eq("id", params.post_id));
      }
      return supabaseRpc(svc, "hard_delete_post", { _post_id: params.post_id });
    case "reject_post":
      if (svc.id === "anon") {
        return supabaseRequest(svc, "DELETE", "posts", undefined, eq("id", params.post_id));
      }
      return supabaseRpc(svc, "reject_post", { p_post_id: params.post_id });
    case "approve_post":
      if (svc.id === "anon") {
        return supabaseRequest(svc, "PATCH", "posts", { status: "approved" }, eq("id", params.post_id));
      }
      return supabaseRpc(svc, "approve_post", { p_post_id: params.post_id });
    case "delete_comment":
      if (svc.id === "anon") {
        return supabaseRequest(svc, "DELETE", "comments", undefined, eq("id", params.comment_id));
      }
      return supabaseRpc(svc, "hard_delete_comment", { _comment_id: params.comment_id });
    case "toggle_pin":
      if (svc.id === "anon") {
        return supabaseRequest(svc, "PATCH", "posts", { pinned: params.pinned }, eq("id", params.post_id));
      }
      return supabaseRequest(svc, "PATCH", "posts", { is_pinned: params.is_pinned }, eq("id", params.post_id));
    case "toggle_hide":
      if (svc.id === "anon") {
        return supabaseRequest(svc, "PATCH", "posts", { hidden: params.hidden }, eq("id", params.post_id));
      }
      return supabaseRequest(svc, "PATCH", "posts", { hidden: params.hidden }, eq("id", params.post_id));

    /* --- deleted-items restore (only when a restore_* action exists) --- */
    case "restore_post":
      return supabaseRequest(svc, "PATCH", "posts", { deleted_at: null, deleted_by: null }, eq("id", params.post_id));
    case "restore_comment":
      return supabaseRequest(svc, "PATCH", "comments", { deleted_at: null, deleted_by: null }, eq("id", params.comment_id));

    /* --- banned words --- */
    case "add_banned_word":
      return supabaseRequest(svc, "POST", "banned_words", { word: String(params.word || "").toLowerCase() });
    case "remove_banned_word":
      return supabaseRequest(svc, "DELETE", "banned_words", undefined, eq("id", params.id));

    /* --- roles & permissions --- */
    case "add_role":
      return supabaseRequest(svc, "POST", "user_roles", { user_id: params.user_id, role: params.role });
    case "remove_role":
      return supabaseRequest(svc, "DELETE", "user_roles", undefined, `${eq("user_id", params.user_id)}&${eq("role", params.role)}`);
    case "save_role_permissions":
      return supabaseRequest(svc, "UPSERT", "role_permissions", {
        role: params.role,
        ...(params.permissions || {}),
        updated_at: new Date().toISOString(),
      }, `on_conflict=role`);

    /* --- channel settings / section locks --- */
    case "set_channel":
      return supabaseRequest(svc, "UPSERT", "channel_settings", {
        channel: params.channel,
        enabled: params.enabled,
        updated_at: new Date().toISOString(),
      }, `on_conflict=channel`);
    case "save_section_lock":
      return supabaseRequest(svc, "UPSERT", "section_locks", {
        section: params.section,
        locked: !!params.locked,
        message: params.message || null,
        updated_at: new Date().toISOString(),
      }, `on_conflict=section`);

    /* --- report handling --- */
    case "set_report_status":
      return supabaseRequest(svc, "PATCH", "post_reports", {
        status: params.status,
        reviewed_by: "ops-console",
        reviewed_at: new Date().toISOString(),
      }, eq("id", params.report_id));

    /* --- rounds (chat study_rounds) --- */
    case "cancel_round":
      return supabaseRequest(svc, "PATCH", "study_rounds", { status: "cancelled", ended_at: new Date().toISOString() }, eq("id", params.round_id));
    case "end_round":
      if (svc.id === "achievement") {
        return supabaseRequest(svc, "PATCH", "rounds", { status: "ended", credited: true }, eq("id", params.round_id));
      }
      return supabaseRequest(svc, "PATCH", "study_rounds", { status: "ended", ended_at: new Date().toISOString() }, eq("id", params.round_id));

    /* ====================== ANON (dqrzsllhdcvykoisisoy) ====================== */

    /* --- devices --- */
    case "ban_device":
      return supabaseRpc(svc, "admin_ban_device", {
        p_device_id: params.device_id,
        p_reason: params.reason || "حظر من لوحة التحكم",
        p_evidence_url: params.evidence_url || null,
        p_expires_at: params.expires_at || null,
        p_evidence_visible: params.evidence_visible != null ? params.evidence_visible : true,
      });
    case "unban_device":
      return supabaseRequest(svc, "DELETE", "blocked_devices", undefined, eq("device_id", params.device_id));
    case "set_device_label":
      return supabaseRequest(svc, "POST", "device_notes", {
        device_id: params.device_id,
        label: params.label,
        updated_at: new Date().toISOString(),
      });
    case "set_admin_device":
      return supabaseRequest(svc, "UPSERT", "admin_devices", { device_id: params.device_id, note: params.note || "admin profile" }, `on_conflict=device_id`);
    case "remove_admin_device":
      return supabaseRequest(svc, "DELETE", "admin_devices", undefined, eq("device_id", params.device_id));

    /* --- anon post delete (fallback, non-RPC) --- */
    case "delete_anon_post":
      return supabaseRequest(svc, "DELETE", "posts", undefined, eq("id", params.post_id));

    /* --- anon post show/hide --- */
    case "show_post":
      return supabaseRequest(svc, "PATCH", "posts", { hidden: false }, eq("id", params.post_id));

    /* --- site settings (anon id=1) --- */
    case "set_site_enabled":
      return supabaseRequest(svc, "PATCH", "site_settings", { site_enabled: params.enabled, updated_at: new Date().toISOString() }, "id=eq.1");
    case "set_maintenance":
      return supabaseRequest(svc, "PATCH", "site_settings", { maintenance_message: params.message, updated_at: new Date().toISOString() }, "id=eq.1");
    case "set_reopen_at":
      return supabaseRequest(svc, "PATCH", "site_settings", { site_reopen_at: params.reopen_at || null, updated_at: new Date().toISOString() }, "id=eq.1");
    case "set_chat_mode":
      return supabaseRequest(svc, "PATCH", "site_settings", { chat_mode_enabled: params.enabled, updated_at: new Date().toISOString() }, "id=eq.1");
    case "set_admin_colors":
      return supabaseRequest(svc, "PATCH", "site_settings", {
        admin_post_bg: params.admin_post_bg || null,
        admin_post_text: params.admin_post_text || null,
        admin_comment_bg: params.admin_comment_bg || null,
        admin_comment_text: params.admin_comment_text || null,
        updated_at: new Date().toISOString(),
      }, "id=eq.1");

    /* --- anon reports (RPC, with direct fallback) --- */
    case "resolve_report":
      if (svc.id === "anon") {
        try {
          return await supabaseRpc(svc, "admin_resolve_report", {
            p_report_id: params.report_id,
            p_action: params.action || "resolved",
            p_note: params.note || null,
          });
        } catch {
          const status =
            params.action === "dismissed" ? "dismissed" :
            params.action === "resolved" ? "resolved" : "closed";
          return supabaseRequest(svc, "PATCH", "reports", {
            status,
            resolved_at: new Date().toISOString(),
            resolved_by: "ops-console",
          }, eq("id", params.report_id));
        }
      }
      return supabaseRequest(svc, "PATCH", "post_reports", {
        status: params.action === "resolved" ? "resolved" : "dismissed",
        reviewed_by: "ops-console",
        reviewed_at: new Date().toISOString(),
      }, eq("id", params.report_id));

    /* --- anon chat messages --- */
    case "delete_chat_message":
      return supabaseRequest(svc, "DELETE", "chat_messages", undefined, eq("id", params.id));

    /* ====================== ACHIEVEMENT (itflhfhsfzrdfpxvlzrv) ====================== */

    /* --- support messages --- */
    case "mark_messages_read":
      return supabaseRequest(svc, "PATCH", "messages", { is_read: true },
        `${eq("sender_id", params.user_id)}&${eq("receiver_id", params.admin_id)}&is_read=eq.false`);
    case "send_message":
      return supabaseRequest(svc, "POST", "messages", {
        sender_id: params.sender_id,
        receiver_id: params.receiver_id,
        content: params.content,
        is_read: false,
      });
    case "delete_conversation":
      return supabaseRequest(svc, "DELETE", "messages", undefined,
        orQuery(
          andEq("sender_id", params.user_id, "receiver_id", params.admin_id),
          andEq("sender_id", params.admin_id, "receiver_id", params.user_id)
        ));
    case "delete_message":
      return supabaseRequest(svc, "DELETE", "messages", undefined, eq("id", params.id));

    /* --- achievement users / roles --- */
    case "set_admin_role":
      if (params.remove) {
        return supabaseRequest(svc, "DELETE", "user_roles", undefined, `${eq("user_id", params.user_id)}&${eq("role", "admin")}`);
      }
      return supabaseRequest(svc, "POST", "user_roles", { user_id: params.user_id, role: "admin" });
    case "set_round_creator":
      if (params.remove) {
        return supabaseRequest(svc, "DELETE", "round_creators", undefined, eq("user_id", params.user_id));
      }
      return supabaseRequest(svc, "POST", "round_creators", { user_id: params.user_id });
    case "set_display_name":
      return supabaseRequest(svc, "PATCH", "profiles", { display_name: params.display_name }, eq("user_id", params.user_id));

    /* --- achievement delete user (full cascade) --- */
    case "achievement_delete_user":
      await supabaseRequest(svc, "DELETE", "tasks", undefined, eq("user_id", params.user_id));
      await supabaseRequest(svc, "DELETE", "user_roles", undefined, eq("user_id", params.user_id));
      return supabaseRequest(svc, "DELETE", "profiles", undefined, eq("user_id", params.user_id));

    /* --- achievement tasks --- */
    case "update_task":
      {
        const t = {};
        if (params.duration != null) t.duration = params.duration;
        if (params.title != null) t.title = params.title;
        if (params.is_success != null) t.is_success = params.is_success;
        if (params.completed != null) t.completed = params.completed;
        return supabaseRequest(svc, "PATCH", "tasks", t, eq("id", params.task_id));
      }
    case "delete_task":
      return supabaseRequest(svc, "DELETE", "tasks", undefined, eq("id", params.task_id));
    case "reset_user_tasks":
      return supabaseRequest(svc, "DELETE", "tasks", undefined, eq("user_id", params.user_id));

    default:
      throw new Error(`إجراء غير معروف: ${action}`);
  }
}

function andEq(a, av, b, bv) {
  return `and(${eq(a, av)},${eq(b, bv)})`;
}
