/**
 * MADARIK CHAT - Read Gateway Worker (بوابة القراءة)
 *
 * بوابة قراءة واحدة لكل أجهزة المستخدمين: البيانات العامة (الإعدادات/أقفال
 * الأقسام/الكلمات المحظورة/الجلسات) تُقرأ من القاعدة مرة واحدة ويوزّعها
 * Cloudflare KV على كل الأجهزة، و /feed يُقرأ بصلاحيات كل مستخدم (JWT) مع
 * كاش مُقسَّم لكل حساب.
 *
 * الكاش: ساعة واحدة لكل الجداول (TTL = 3600s).
 * الإبطال: عوضاً عن حذف مفاتيح كثيرة (حصة KV free للكتابة/الحذف محدودة)
 * نستخدم "stamp" منطقياً لكل مجموعة جداول: أي قيمة كاش تحمل stamp قديمة
 * تُعد منتهية عند القراءة فيُعاد جلبها — بدون أي حذف. يُرفع الـ stamp
 * عند أي كتابة من الكلاينت عبر:
 *   POST|GET /invalidate?table=<اسم_الجدول>
 * ويُتجاهل أي جدول غير مخزّن في البوابة (لا يحتاج إبطال).
 *
 * عدّاد الاستهلاك: يقيس كل قراءة تصدر عن البوابة نحو Supabase (بالبايت لكل
 * جدول+عملية) وكل استجابة تُؤدى للعملاء (بالبايت لكل مسار)، يُحفظ في الذاكرة
 * ويُصفّى إلى KV كل 5 دقائق تحت مفتاح واحد m:YYYY-MM-DD (حتى لا نتجاوز حصة
 * 1000 كتابة/يوم) ويُقرأ من:
 *   GET /metrics?date=YYYY-MM-DD
 *
 * تثبيت:
 *   1) wrangler kv namespace create CHAT_KV        (انسخ المُعرّف)
 *   2) ضع المُعرّف في wrangler.toml -> [kv_namespaces] id
 *   3) wrangler secret put CHAT_SERVICE_KEY        (مفتاح الخدمة)
 *   4) wrangler deploy
 */

const CHAT_URL = "https://biabdoatwfteqwgjdxzc.supabase.co";

const DEFAULT_ALLOWED_ORIGIN = "https://madrekjo.github.io";

const FEED_PAGE_SIZE = 25;

/** تعليقات المنشور تُجلب عند الطلب فقط، وتُخزَّن 5 دقائق (لا تُدخل في كاش الفيد). */
const COMMENTS_TTL_SECONDS = 300;

/** تحقق صارم من معرّفات UUID (يمنع حقن معاملات PostgREST في القيم). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ساعة واحدة لجميع جداول البوابة (مطلوب المستخدم). */
const CACHE_TTL_SECONDS = 3600;

/** لا نكتب الـ stamp أكثر من مرة كل دقيقة (تقتير في حصة KV write/day). */
const STAMP_COALESCE_MS = 60 * 1000;

/** تصفية عدّاد الاستهلاك إلى KV كل 5 دقائق. */
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

/** إبقاء مفاتيح المقاييس اليومية أسبوعين فقط. */
const METRIC_TTL_SECONDS = 14 * 24 * 3600;

/**
 * ربط كل جدول مخزّن بمجموعته المنطقية. أي جدول غير موجود هنا تُتجاهله
 * /invalidate لأنه لا يُخزَّن في البوابة (لا يحتاج إبطال).
 */
/**
 * ربط كل جدول مخزّن بمجموعته المنطقية. أي جدول غير موجود هنا تُتجاهله
 * /invalidate لأنه لا يُخزَّن في البوابة (لا يحتاج إبطال).
 *
 * الفصل المعتمد (Phase A): التعليقات وإعجابات التعليقات في مجموعة مستقلة
 * "comments" حتى لا يُسقط أي تعليق كاش الفيد لدى الجميع (كان يرفع stamp
 * الفيد مع كل تعليق = إبطال شامل مستمر). كاش الفيد الآن لا يُبطل إلا عند
 * إنشاء/تثبيت/حذف منشور أو إعجاب (الأقل تكراراً).
 */
const TABLE_GROUPS = {
  posts: "feed",
  likes: "feed",
  comments: "comments",
  comment_likes: "comments",
  profiles: "profiles",
  channel_settings: "config",
  section_locks: "config",
  user_roles: "config",
  banned_words: "banned_words",
  study_rounds: "rounds",
  round_participants: "rounds",
  round_meetings: "rounds",
};

/* ------------------- عدّاد الاستهلاك (داخل الإيزيليت) ------------------- */

const COUNTERS = {
  since: Date.now(),          // لحظة إقلاع هذا الإيزيليت
  up: {},                     // "جدول:عملية" -> {count, bytes} (قراءات تخرج لـ Supabase)
  served: {},                 // "مسار" -> {count, bytes} (استجابات تُؤدى للعملاء)
};
let lastFlush = Date.now();

function recordUp(table, op, bytes) {
  const label = `${table}:${op}`;
  const e = (COUNTERS.up[label] = COUNTERS.up[label] || { count: 0, bytes: 0 });
  e.count += 1;
  e.bytes += bytes;
}

function recordServed(key, bytes) {
  const e = (COUNTERS.served[key] = COUNTERS.served[key] || { count: 0, bytes: 0 });
  e.count += 1;
  e.bytes += bytes;
}

/** التاريخ بتوقيت عمّان (UTC+3) لتصنيف المقاييس اليومية. */
function ammanDate(d = new Date()) {
  return new Date(d.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function mergeCounters(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    const cur = out[k] || { count: 0, bytes: 0 };
    out[k] = { count: cur.count + v.count, bytes: cur.bytes + v.bytes };
  }
  return out;
}

/**
 * يصفّي العدّاد الحالي إلى KV تحت مفتاح يومي واحد ثم يصفّر الذاكرة.
 * يُستدعى عبر waitUntil مرة كل FLUSH_INTERVAL_MS على الأكثر.
 * (تعدّ هذه سجلاً تقريبياً — القيمة الحقيقية من لوحة Supabase Usage.)
 */
async function maybeFlush(env) {
  const now = Date.now();
  if (now - lastFlush < FLUSH_INTERVAL_MS) return;
  lastFlush = now;
  const kv = env.CHAT_KV;
  const date = ammanDate();
  const key = `m:${date}`;
  let acc = { up: {}, served: {}, flushes: 0 };
  try {
    const raw = await kv.get(key);
    if (raw !== null) acc = { up: {}, served: {}, flushes: 0, ...JSON.parse(raw) };
  } catch {
    /* تجاهل وابدأ من الصفر */
  }
  acc.up = mergeCounters(acc.up, COUNTERS.up);
  acc.served = mergeCounters(acc.served, COUNTERS.served);
  acc.flushes = (acc.flushes || 0) + 1;
  acc.lastFlush = now;
  acc.updated = now;
  // نُصفّر قبل put: إن فشلت الكتابة لا نضيّع إلا آخر نافذة.
  COUNTERS.up = {};
  COUNTERS.served = {};
  await kv.put(key, JSON.stringify(acc), { expirationTtl: METRIC_TTL_SECONDS });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      const res = await dispatch(url, request, origin, env);
      // تصفية العدّاد (مرة كل 5 دقائق كحد أقصى) دون تعطيل الاستجابة.
      ctx.waitUntil(maybeFlush(env));
      return res;
    } catch (e) {
      return json({ error: e?.message || "internal error", type: "internal" }, origin, 500);
    }
  },
};

async function dispatch(url, request, origin, env) {
  const path = url.pathname;
  const method = request.method;

  if (method !== "GET" && method !== "POST") {
    return json({ error: "method_not_allowed", message: "GET or POST only" }, origin, 405);
  }

  const kv = env.CHAT_KV;
  const svc = { url: CHAT_URL, key: env.CHAT_SERVICE_KEY };
  const force = url.searchParams.get("force") === "1";

  if (path === "/health") {
    return json({ ok: true, time: Date.now() }, origin, 200, "health");
  }

  if (path === "/metrics") {
    return metrics(kv, url, origin);
  }

  if (path === "/invalidate") {
    return invalidate(kv, url, request, origin);
  }

  if (path === "/config") {
    const data = await withCache(kv, "config", "config", CACHE_TTL_SECONDS, force, async () => {
      const [channels, locks] = await Promise.all([
        fetchAll(svc, "channel_settings", "select=*", null, "config"),
        fetchAll(svc, "section_locks", "select=*", null, "config"),
      ]);
      const channelMap = {};
      (channels || []).forEach((c) => { channelMap[c.channel] = !!c.enabled; });
      const locksMap = {};
      (locks || []).forEach((l) => { locksMap[l.section] = { locked: !!l.locked, message: l.message, locked_until: l.locked_until }; });
      return { channels: channelMap, locks: locksMap };
    });
    return json(data, origin, 200, "config");
  }

  if (path === "/banned_words") {
    const data = await withCache(kv, "banned_words", "banned_words", CACHE_TTL_SECONDS, force, async () => {
      const rows = await fetchAll(svc, "banned_words", "select=word", null, "banned_words");
      return (rows || []).map((w) => w.word.toLowerCase());
    });
    return json({ words: data }, origin, 200, "banned_words");
  }

  if (path === "/rounds") {
    const data = await withCache(kv, "rounds", "rounds", CACHE_TTL_SECONDS, force, async () => {
      return fetchAll(svc, "study_rounds", "select=*&order=starts_at.desc&limit=50", null, "rounds");
    });
    return json({ rounds: data }, origin, 200, "rounds");
  }

  if (path === "/comments") {
    // تعليقات منشور واحد عند الطلب — بلا إدخالها في كاش الفيد (فيد رفيع).
    const postId = String(url.searchParams.get("post_id") || "").trim();
    if (!UUID_RE.test(postId)) {
      return json({ error: "bad_post_id", message: "post_id يجب أن يكون UUID" }, origin, 400, "comments");
    }
    const data = await withCache(kv, `comments:${postId}`, "comments", COMMENTS_TTL_SECONDS, force, () =>
      buildComments(svc, postId)
    );
    return json(data, origin, 200, "comments");
  }

  if (path === "/feed") {
    // /feed يُقرأ بصلاحيات المستخدم نفسه (JWT) — مفتاح الخدمة محظور هنا.
    const token = bearerToken(request.headers);
    if (!token) {
      return json({ error: "unauthorized", message: "/feed يتطلب Authorization: Bearer <JWT>" }, origin, 401, "feed");
    }
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(50, parseInt(url.searchParams.get("limit") || String(FEED_PAGE_SIZE), 10) || FEED_PAGE_SIZE);
    const channel = sanitizeChannel(url.searchParams.get("channel"));
    const principal = await tokenHash(token);
    const cacheKey = `feed:${principal}:p${page}:n${limit}:c${channel}`;
    const data = await withCache(kv, cacheKey, "feed", CACHE_TTL_SECONDS, force, () => buildFeed(svc, page, limit, channel, token));
    return json(data, origin, 200, "feed");
  }

  return json({ error: "not_found", message: "المسار غير موجود" }, origin, 404);
}

/* ------------------- إبطال الكاش (stamps) ------------------- */

/**
 * يرفع stamp مجموعة الجداول بعد أي كتابة حتى تنتهي كل قيم الكاش الحاملة
 * stamp أقدم فوراً — معلمياً، بلا حذف (يحترم حصة KV write/day).
 */
async function bumpStamp(kv, group) {
  const key = `stamp:${group}`;
  const now = Date.now();
  let current = 0;
  try {
    const raw = await kv.get(key);
    if (raw !== null) current = Number(raw) || 0;
  } catch {
    /* تجاهل */
  }
  if (current > 0 && now - current < STAMP_COALESCE_MS) {
    return { stamp: current, coalesced: true };
  }
  await kv.put(key, String(now));
  return { stamp: now, coalesced: false };
}

async function invalidate(kv, url, request, origin) {
  let table = (url.searchParams.get("table") || "").trim().toLowerCase();
  if (!table && request.method === "POST") {
    try {
      const body = await request.json();
      table = String(body?.table || "").trim().toLowerCase();
    } catch {
      /* بلا جسم — نعتمد على المعامل */
    }
  }
  if (!table) {
    return json({ error: "missing_table", message: "أرسل table=<اسم_الجدول>" }, origin, 400, "invalidate");
  }
  const group = TABLE_GROUPS[table];
  if (!group) {
    return json({ ok: true, table, group: null, handled: false, message: "جدول غير مخزّن — لا يحتاج إبطال" }, origin, 200, "invalidate");
  }
  const stamped = await bumpStamp(kv, group);
  return json({ ok: true, table, group, handled: true, ...stamped }, origin, 200, "invalidate");
}

/* ------------------- المقاييس ------------------- */

async function metrics(kv, url, origin) {
  const rawDate = (url.searchParams.get("date") || "").trim();
  const date = /^20\d\d-\d\d-\d\d$/.test(rawDate) ? rawDate : ammanDate();
  const key = `m:${date}`;
  let stored = {};
  try {
    const raw = await kv.get(key);
    if (raw !== null) stored = JSON.parse(raw);
  } catch {
    /* لا يوجد بعد */
  }
  const body = {
    ok: true,
    date,
    since: COUNTERS.since,
    live: { up: COUNTERS.up, served: COUNTERS.served },
    stored,
  };
  return json(body, origin, 200, "metrics");
}

/* ------------------- Feed (تجميعة الفيد — بصلاحيات المستخدم نفسه) ------------------- */

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
    `select=id,user_id,content,image_url,image_urls,video_url,created_at,updated_at,is_pinned,generation,field,channel,status&deleted_at=is.null&${channelFilter}&order=created_at.desc&limit=${limit}&offset=${offset}`, token, "feed") || []);

  const postIds = posts.map((p) => p.id);

  // فيد رفيع: نُحصي التعليقات فقط (post_id) بدل إرسال كل محتواها مع الفيد.
  // التعليقات الكاملة تُجلب عند الطلب عبر /comments?post_id=...
  let commentCounts = {};
  if (postIds.length > 0) {
    const countRows = (await fetchAll(svc, "comments",
      `select=post_id&post_id=in.(${postIds.join(",")})&deleted_at=is.null&limit=2000`, token, "feed") || []);
    countRows.forEach((r) => {
      commentCounts[r.post_id] = (commentCounts[r.post_id] || 0) + 1;
    });
  }

  // إعجابات المنشورات (لأيقونة/عداد اللايك — تبقى حية في الفيد).
  const likes = postIds.length
    ? (await fetchAll(svc, "likes", `select=post_id,user_id&post_id=in.(${postIds.join(",")})&limit=2000`, token, "feed") || [])
    : [];

  // الملفات الشخصية المعنية بشكل مركزي — أعمدة عامة فقط، بدون is_banned.
  const userIds = [...new Set(posts.map((p) => p.user_id))];
  let profiles = {};
  if (userIds.length > 0) {
    const rows = await fetchAll(svc, "profiles",
      `select=user_id,full_name,avatar_url,generation,field,gender&user_id=in.(${userIds.join(",")})&limit=1000`, token, "feed");
    (rows || []).forEach((r) => { profiles[r.user_id] = r; });
  }

  return {
    page,
    limit,
    posts,
    commentCounts,
    likes: likes || [],
    profiles,
  };
}

/**
 * تعليقات منشور واحد عند الطلب (لازي): التعليقات + إعجاباتها + الملفات المعنية.
 * تُخزَّن في KV معزولة بمفتاح المنشور لمدة 5 دقائق — أي مستخدم يفتح نفس
 * المنشور يشارك نفس القراءة من القاعدة.
 */
async function buildComments(svc, postId) {
  const comments = (await fetchAll(svc, "comments",
    `select=id,post_id,user_id,content,parent_comment_id,created_at,is_pinned&post_id=eq.${postId}&deleted_at=is.null&order=created_at.asc&limit=100`, null, "comments") || []);

  if (comments.length === 0) {
    return { comments: [], commentLikes: [], profiles: {} };
  }

  const commentIds = comments.map((c) => c.id);
  const [commentLikes, profileRows] = await Promise.all([
    fetchAll(svc, "comment_likes",
      `select=comment_id,user_id&comment_id=in.(${commentIds.join(",")})&limit=500`, null, "comments"),
    (() => {
      const userIds = [...new Set(comments.map((c) => c.user_id))];
      return fetchAll(svc, "profiles",
        `select=user_id,full_name,avatar_url,generation,field,gender&user_id=in.(${userIds.join(",")})&limit=500`, null, "comments");
    })(),
  ]);

  const profiles = {};
  (profileRows || []).forEach((r) => { profiles[r.user_id] = r; });

  return {
    comments,
    commentLikes: commentLikes || [],
    profiles,
  };
}

/* ---------------- KV caching (مع stamps) ---------------- */

/**
 * قراءة/كتابة كاش: أولاً يحمل stamp مجموعة الجدول، ثم يعتبر أي قيمة كاش
 * منتهية إذا كان stampها أقدم من الحالي (إبطال منطقي) أو تجاوزت TTL.
 */
async function withCache(kv, cacheKey, group, ttlSeconds, force, fetcher) {
  let stamp = 0;
  const stampRaw = group ? await kv.get(`stamp:${group}`) : null;
  if (stampRaw !== null) stamp = Number(stampRaw) || 0;

  if (!force) {
    const hit = await kv.get(cacheKey);
    if (hit !== null) {
      try {
        const parsed = JSON.parse(hit);
        if (parsed && parsed.ts && parsed.stamp === stamp && Date.now() - parsed.ts < ttlSeconds * 1000) {
          return parsed.v;
        }
      } catch {
        /* تجاهل كاش فاسد وأعد القراءة */
      }
    }
  }

  const value = await fetcher();
  // الكتابة في KV أفضل جهد (best-effort): إذا فشلت — مثل تخطي حصة الكتابة
  // اليومية في الخطة المجانية — نُقدّم القيمة الطازجة فقط بدون كاش ولا نسقط
  // الطلب بـ 500. الكاش في المرة القادمة يُعاد بناؤه عند استعادة الحصة.
  try {
    await kv.put(cacheKey, JSON.stringify({ ts: Date.now(), stamp, v: value }), {
      expirationTtl: Math.max(ttlSeconds * 2, 60),
    });
  } catch {
    /* تجاهل: التخزين اختياري */
  }
  return value;
}

/* ---------------- Supabase REST (قراءة مع قياس البايتات) ---------------- */

// authToken اختياري: عند تمريره (طلب /feed) يُحمَل في Authorization — فيطبّق
// Supabase الـ RLS بصلاحية المستخدم نفسه. بدون تمريره تُستخدم البوابة مفتاح
// الخدمة للبيانات العامة (/config, /banned_words, /rounds).
async function fetchAll(svc, table, query, authToken, op) {
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
  // نقرأ كنص لقياس البايتات الفعلية ثم نحلل JSON — أساس عدّاد الاستهلاك.
  const text = await res.text();
  recordUp(table, op || table, new TextEncoder().encode(text).length);
  return JSON.parse(text);
}

/* ---------------- CORS و JSON ---------------- */

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
  };
}

function json(body, origin, status = 200, key) {
  const payload = JSON.stringify(body);
  if (key) recordServed(key, new TextEncoder().encode(payload).length);
  return new Response(payload, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}