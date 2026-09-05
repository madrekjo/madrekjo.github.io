/**
 * MADARIK CHAT - Read Gateway Worker (وسطاء قراءة Layer 2)
 *
 * بوابة قراءة واحدة لكل أجهزة المستخدمين: البيانات العامة (الإعدادات/أقفال
 * الأقسام/الكلمات المحظورة) تُقرأ من القاعدة مرة واحدة ويوزّعها Cloudflare KV
 * على كل الأجهزة بدل تكرارها مئات المرات، أما /feed فيُقرأ بصلاحيات كل مستخدم
 * (JWT) مع كاش مُقسَّم لكل حساب.
 *
 * المنشورات/التعليقات: عند إضافة مشاركة جديدة تُطلب `?force=1` لتحديث
 * الكاش فوراً (أو انتظر 15 ثانية فقط).
 *
 * /feed خاص بحساب المستخدم: يجب أن يحمل الطلب ترويسة
 *   Authorization: Bearer <JWT المستخدم>
 * ويعيد الـ Worker الترويسة نفسها إلى PostgREST حتى يطبّق Supabase الـ RLS.
 * بدون JWT يُرفض الطلب (401) ولا يُستخدم مفتاح الخدمة أبداً في مسار /feed،
 * وكاش /feed مُقسَّم لكل مستخدم (hash للترويسة) فلا تتسرب بيانات بين الحسابات.
 *
 * تثبيت:
 *   1) wrangler kv namespace create CHAT_KV        (انسخ المُعرّف)
 *   2) ضع المُعرّف في wrangler.toml -> [kv_namespaces] id
 *   3) wrangler secret put CHAT_SERVICE_KEY        (مفتاح الخدمة)
 *   4) wrangler deploy
 *
 * اختياري: عدّل ترتيب ALLOWED_ORIGINS لملائمة نطاقاتك.
 */

const CHAT_URL = "https://biabdoatwfteqwgjdxzc.supabase.co";

const DEFAULT_ALLOWED_ORIGIN = "https://madrekjo.github.io";

const TTL = {
  config: 60,   // ثانية — إعدادات القنوات/الأقفال (تنعكس تعديلات الإدارة بسرعة)
  feed: 15,     // ثانية — الفيد (منشورات/تعليقات/تفاعلات)
  rounds: 20,   // ثانية — الجلسات الدراسية
  bannedWords: 120, // ثانية
};

const FEED_PAGE_SIZE = 25;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin), status: 204 });
    }

    if (request.method !== "GET") {
      return json({ error: "method_not_allowed", message: "القراءة فقط" }, origin, 405);
    }

    try {
      return await route(url, origin, env, request.headers);
    } catch (e) {
      return json({ error: e?.message || "internal error", type: "internal" }, origin, 500);
    }
  },
};

async function route(url, origin, env, headers) {
  const path = url.pathname;
  const force = url.searchParams.get("force") === "1";

  if (path === "/health") {
    return json({ ok: true, time: Date.now() }, origin);
  }

  const kv = env.CHAT_KV;
  const svc = { url: CHAT_URL, key: env.CHAT_SERVICE_KEY };

  if (path === "/config") {
    const data = await withCache(kv, "config", TTL.config, force, async () => {
      const [channels, locks] = await Promise.all([
        fetchAll(svc, "channel_settings", "select=*"),
        fetchAll(svc, "section_locks", "select=*"),
      ]);
      const channelMap = {};
      (channels || []).forEach((c) => { channelMap[c.channel] = !!c.enabled; });
      const locksMap = {};
      (locks || []).forEach((l) => { locksMap[l.section] = { locked: !!l.locked, message: l.message, locked_until: l.locked_until }; });
      return { channels: channelMap, locks: locksMap };
    });
    return json(data, origin);
  }

  if (path === "/banned_words") {
    const data = await withCache(kv, "banned_words", TTL.bannedWords, force, async () => {
      const rows = await fetchAll(svc, "banned_words", "select=word");
      return (rows || []).map((w) => w.word.toLowerCase());
    });
    return json({ words: data }, origin);
  }

  if (path === "/rounds") {
    const data = await withCache(kv, "rounds", TTL.rounds, force, async () => {
      return fetchAll(svc, "study_rounds", "select=*&order=starts_at.desc&limit=50");
    });
    return json({ rounds: data }, origin);
  }

  if (path === "/feed") {
    // /feed يُقرأ بصلاحيات المستخدم نفسه (JWT) — مفتاح الخدمة محظور هنا.
    const token = bearerToken(headers);
    if (!token) {
      return json({ error: "unauthorized", message: "/feed يتطلب Authorization: Bearer <JWT>" }, origin, 401);
    }
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(50, parseInt(url.searchParams.get("limit") || String(FEED_PAGE_SIZE), 10) || FEED_PAGE_SIZE);
    const channel = sanitizeChannel(url.searchParams.get("channel"));
    // كاش لكل مستخدم — القسم (principal) مشتق من الترويسة فلا يُخدم حساب من كاش حساب آخر.
    const principal = await tokenHash(token);
    const cacheKey = `feed:${principal}:p${page}:n${limit}:c${channel}`;
    const data = await withCache(kv, cacheKey, TTL.feed, force, async () => buildFeed(svc, page, limit, channel, token));
    return json(data, origin);
  }

  return json({ error: "not_found", message: "المسار غير موجود" }, origin, 404);
}

/* ---------------- Feed (تجميعة الفيد — بصلاحيات المستخدم نفسه) ---------------- */

// قنوات معروفة فقط — حماية من حقن قيم/عوامل PostgREST عبر معامل channel.
const KNOWN_CHANNELS = new Set(["all", "male", "female", "09", "10", "11"]);

function sanitizeChannel(raw) {
  const v = (raw || "all").trim();
  return KNOWN_CHANNELS.has(v) ? v : "all";
}

// بصمة صغيرة/ثابتة للترويسة تُستخدم كمفتاح تَقسيم الكاش لكل مستخدم.
async function tokenHash(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest.slice(0, 10)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bearerToken(headers) {
  const auth = headers.get("Authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  return m ? m[1] : null;
}

async function buildFeed(svc, page, limit, channel, token) {
  const offset = (page - 1) * limit;

  // نفس الفلاتر التي يطبّقها الفيد مباشرةً: deleted_at = null + القناة.
  // الـ RLS (عبر token المستخدم) يتكفل ببقية الرؤية (مثل status=pending).
  const channelFilter =
    channel === "all"
      ? "or=(channel.is.null,channel.eq.all)"
      : `channel=eq.${channel}`;

  const posts = (await fetchAll(svc, "posts",
    `select=id,user_id,content,image_url,image_urls,video_url,created_at,updated_at,is_pinned,generation,field,channel,status&deleted_at=is.null&${channelFilter}&order=created_at.desc&limit=${limit}&offset=${offset}`, token) || []);

  const postIds = posts.map((p) => p.id);

  // تعليقات المنشورات دفعة واحدة (بدل طلب لكل منشور)
  const commentsMap = {};
  let comments = [];
  if (postIds.length > 0) {
    comments = (await fetchAll(svc, "comments",
      `select=id,post_id,user_id,content,parent_comment_id,created_at,is_pinned&post_id=in.(${postIds.join(",")})&deleted_at=is.null&order=created_at.asc&limit=500`, token) || []);
    comments.forEach((c) => {
      (commentsMap[c.post_id] = commentsMap[c.post_id] || []).push(c);
    });
  }

  // تفاعلات المنشورات والتعليقات
  // (الإعجابات تُقرأ ضمن ما يسمح به RLS لصاحب الطلب — لا أدوار هنا:
  //  الفيد يستخدم كاش admin_ids المشترك في appCache).
  const [likes, commentLikes] = await Promise.all([
    postIds.length ? fetchAll(svc, "likes", `select=post_id,user_id&post_id=in.(${postIds.join(",")})&limit=2000`, token) : [],
    comments.length ? fetchAll(svc, "comment_likes", `select=comment_id,user_id&comment_id=in.(${comments.map((c) => c.id).join(",")})&limit=2000`, token) : [],
  ]);

  // الملفات الشخصية المعنية بشكل مركزي — أعمدة عامة فقط، بدون is_banned.
  const userIds = [...new Set([
    ...posts.map((p) => p.user_id),
    ...comments.map((c) => c.user_id),
  ])];
  let profiles = {};
  if (userIds.length > 0) {
    const rows = await fetchAll(svc, "profiles",
      `select=user_id,full_name,avatar_url,generation,field,gender&user_id=in.(${userIds.join(",")})&limit=1000`, token);
    (rows || []).forEach((r) => { profiles[r.user_id] = r; });
  }

  return {
    page,
    limit,
    posts,
    commentsMap,
    likes: likes || [],
    commentLikes: commentLikes || [],
    profiles,
  };
}

/* ---------------- KV caching ---------------- */

async function withCache(kv, cacheKey, ttlSeconds, force, fetcher) {
  if (!force) {
    const hit = await kv.get(cacheKey);
    if (hit !== null) {
      try {
        const parsed = JSON.parse(hit);
        if (parsed && parsed.ts && Date.now() - parsed.ts < ttlSeconds * 1000) {
          return parsed.v;
        }
      } catch {
        /* تجاهل كاش فاسد وأعد القراءة */
      }
    }
  }

  const value = await fetcher();
  await kv.put(cacheKey, JSON.stringify({ ts: Date.now(), v: value }), {
    expirationTtl: Math.max(ttlSeconds * 2, 60),
  });
  return value;
}

/* ---------------- Supabase REST (قراءة) ---------------- */

// authToken اختياري: عند تمريره (طلب /feed) يُحمَل في Authorization — فيطبّق
// Supabase الـ RLS بصلاحية المستخدم نفسه. بدون تمريره تُستخدم البوابة مفتاح
// الخدمة للبيانات العامة (/config, /banned_words, /rounds).
async function fetchAll(svc, table, query, authToken) {
  const res = await fetch(`${svc.url}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: {
      apikey: svc.key,
      Authorization: `Bearer ${authToken || svc.key}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${table} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/* ---------------- CORS ---------------- */

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
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
  };
}

function json(body, origin, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}