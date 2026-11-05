/* مدارك جو — درع الدخول الموحّد + حاجز الحظر المركزي
 * 1) يمنع عرض أي صفحة (غير المصرّح بها) قبل تسجيل الدخول الموحّد.
 * 2) إن كان المستخدم مسجّلاً، يتحقق من قائمة الحظر المركزية (global_bans)
 *    عبر RPC is_global_banned، ويطرد المحظور فوراً (مع مسح جلسته).
 *
 * مبدأ التصميم: الفحص الأمني لا يجوز أن يُعلّق الموقع.
 *   - لا نُخفي الصفحة أثناء الفحص (كان يسبّب شاشة فارغة/«الموقع معلّق»
 *     حين تتعطّل قاعدة الدردشة).
 *   - مهلة قصيرة (3.5 ثانية) بدل 5.
 *   - عند تعذّر الفحص نسمح بالمرور ونسجّل فشلاً مؤقتاً (دقيقتان) حتى لا
 *     يتكرر الطلب الميت مع كل صفحة.
 *
 * الجلسة تُكتب في localStorage بصيغة:
 *   mdk:sso:session = { chat: {access_token, refresh_token}, ... , target, viaCode? }
 * ويكتبها: مسار Google عبر الوركر ومسار رمز الدعوة في /login/.
 * ومن يسجّل الدخول من داخل قسم (sb-<ref>-auth-token) يُعتبر مسجّلاً أيضاً.
 */
(function () {
  "use strict";

  var GATE_ON = true;                    /* مفتاح التشغيل العام للدرع */
  var REQUIRE_LOGIN = true;              /* هل نُحوّل الزائر غير المسجّل إلى /login/ ؟ */
  var SESSION_KEY = "mdk:sso:session";   /* جلسة الدخول الموحّد */
  var LOGIN_PATH = "/login/";            /* صفحة الدخول الموحّد (عامة) */

  /* فحص الحظر المركزي (نفس ما يستخدمه الوركر). المفتاح عام بطبيعته. */
  var BAN_URL = "https://romocwtqzdnovfgtmwzb.supabase.co/rest/v1/rpc/is_global_banned";
  var BAN_KEY = "sb_publishable_FxIiY1SHBKXkoByvKu0-Jg_msr2Qd45";
  var BAN_CACHE_KEY = "mdk:ban:cache";
  var BAN_FAIL_KEY = "mdk:ban:fail";
  var BAN_TTL = 5 * 60 * 1000;           /* مهلة صلاحية نتيجة الفحص */
  var BAN_FAIL_TTL = 2 * 60 * 1000;      /* لا نعيد محاولة فاشلة قبل دقيقتين */
  var BAN_TIMEOUT = 3500;                /* أقصى انتظار لفحص الحظر */

  if (!GATE_ON) return;

  function pathNow() {
    return location.pathname.replace(/\/index\.html$/, "/");
  }

  function isPublic() {
    var path = pathNow();
    var PUBLIC = [
      /^\/login(\/|$)/,
      /^\/support(\/|$)/,
      /^\/maintenance\.html$/,
      /^\/404\.html$/,
      /^\/privacy\.html$/,
      /^\/coming-soon\.html$/
    ];
    for (var i = 0; i < PUBLIC.length; i++) {
      if (PUBLIC[i].test(path)) return true;
    }
    return false;
  }

  /* محركات البحث وأدوات المعاينة: لا تُحوَّل إلى /login/ (التي تحمل noindex)
     حتى تقرأ الصفحة نفسها التي يراها الزائر المسجّل بدل تسجيل «استُبعدت
     بوسم noindex» في Search Console. لا يمنح هذا أي وصول لبيانات خاصة:
     المحتوى المحمي في Supabase يبقى محكوماً بسياسات RLS. */
  var CRAWLER_RE = /bot|crawler|spider|crawling|facebookexternalhit|twitterbot|slackbot|telegrambot|whatsapp|linkedinbot|discordbot|embedly|pinterest|redditbot|applebot|bingpreview|google-inspectiontool|chrome-lighthouse|headlesschrome/i;

  function isCrawler() {
    try { return CRAWLER_RE.test(navigator.userAgent || ""); } catch (e) { return false; }
  }

  function readSession() {
    var raw = null;
    try { raw = localStorage.getItem(SESSION_KEY); } catch (e) { return undefined; }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  /* جلسة قسم مباشرة (تسجيل دخول من داخل القسم نفسه):
     Supabase يحفظها في sb-<ref>-auth-token بصيغتين — {access_token...}
     أو {session:{access_token...}} — وبعض الإصدارات تُقسّمها إلى أجزاء. */
  function readSectionSession() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^sb-.*-auth-token$/.test(k)) keys.push(k);
      }
      for (var j = 0; j < keys.length; j++) {
        var raw = localStorage.getItem(keys[j]);
        if (!raw) continue;
        var v = JSON.parse(raw);
        var s = (v && v.session) ? v.session : v;
        if (s && s.access_token) return { access_token: s.access_token };
        if (v && v.access_token) return { access_token: v.access_token };
      }
    } catch (e) { /* تجاهل */ }
    return null;
  }

  function goLogin(banned) {
    /* الوجهة تُطبَّع: "/index.html" → "/" (وإلا وصلت وجهة غير معروفة
       للوركر). الاستعلام والجزء يُحفظان ليعود المستخدم لنفس الموضع. */
    var from = pathNow() + location.search + location.hash;
    var url = LOGIN_PATH + "?from=" + encodeURIComponent(from);
    if (banned) url += "&banned=1";
    location.replace(url);
  }

  function wipeAndGoBanned() {
    try {
      localStorage.removeItem(SESSION_KEY);
      Object.keys(localStorage).forEach(function (k) {
        if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k);
      });
    } catch (e) {}
    goLogin(true);
  }

  function decodeEmail(session) {
    var order = ["chat", "achievement", "sutur", "anon", "ajr", "talaawat"];
    var tok = null, i, k;
    for (i = 0; i < order.length && !tok; i++) {
      var s = session && session[order[i]];
      if (s && s.access_token) tok = s.access_token;
    }
    if (!tok) {
      for (k in session) {
        if (session[k] && session[k].access_token) { tok = session[k].access_token; break; }
      }
    }
    if (!tok) return "";
    try {
      var part = String(tok).split(".")[1];
      if (!part) return "";
      part = part.replace(/-/g, "+").replace(/_/g, "/");
      while (part.length % 4) part += "=";
      var bin = atob(part);
      var out = "";
      for (i = 0; i < bin.length; i++) out += "%" + ("00" + bin.charCodeAt(i).toString(16)).slice(-2);
      var p = JSON.parse(decodeURIComponent(out));
      return (p && (p.email || (p.user_metadata && p.user_metadata.email))) || "";
    } catch (e) { return ""; }
  }

  function readCache(email) {
    try {
      var c = JSON.parse(localStorage.getItem(BAN_CACHE_KEY) || "null");
      if (!c || c.email !== email) return null;
      if (typeof c.banned !== "boolean") return null;
      if (Date.now() - (c.t || 0) > BAN_TTL) return null;
      return c.banned;
    } catch (e) { return null; }
  }

  function writeCache(email, banned) {
    try {
      localStorage.setItem(BAN_CACHE_KEY, JSON.stringify({ email: email, banned: banned, t: Date.now() }));
    } catch (e) {}
  }

  function failedRecently(email) {
    try {
      var c = JSON.parse(localStorage.getItem(BAN_FAIL_KEY) || "null");
      return !!(c && c.email === email && Date.now() - (c.t || 0) < BAN_FAIL_TTL);
    } catch (e) { return false; }
  }

  function markFailed(email) {
    try {
      localStorage.setItem(BAN_FAIL_KEY, JSON.stringify({ email: email, t: Date.now() }));
    } catch (e) {}
  }

  function clearFailed() {
    try { localStorage.removeItem(BAN_FAIL_KEY); } catch (e) {}
  }

  function fetchBanned(email) {
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, BAN_TIMEOUT);
    return fetch(BAN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: BAN_KEY,
        Authorization: "Bearer " + BAN_KEY
      },
      body: JSON.stringify({ p_email: String(email).toLowerCase() }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error("ban_check_" + res.status);
      return res.json();
    }).then(function (data) {
      return data === true;
    }).catch(function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function checkBan(session) {
    var email = decodeEmail(session);
    if (!email) return;               /* بلا إيميل: لا نستطيع الفحص (fail-open) */

    var cached = readCache(email);
    if (cached === true) { wipeAndGoBanned(); return; }
    if (cached === false) return;     /* سليم خلال المهلة */

    /* تعذّر الفحص حديثاً: لا نُكرر الطلب ولا نُعلّق الصفحة. */
    if (failedRecently(email)) return;

    /* فحص طازج في الخلفية — الصفحة تظهر فوراً، والحظر يُطبَّق عند وصول الرد. */
    fetchBanned(email).then(function (banned) {
      clearFailed();
      writeCache(email, banned);
      if (banned) { wipeAndGoBanned(); }
    }).catch(function () {
      markFailed(email);              /* تعذّر الفحص: نسمح (fail-open) */
    });
  }

  /* -------- التنفيذ -------- */
  try {
    if (isPublic()) return;
    if (isCrawler()) return;          /* محرك بحث/معاينة: اعرض الصفحة كما هي */

    var session = readSession();
    if (session === undefined) return;   /* تعذّر قراءة المخزن: fail-open */
    if (!session) session = readSectionSession();  /* مسجّل من داخل قسم */
    if (!session) {
      if (REQUIRE_LOGIN) goLogin(false);
      return;
    }

    checkBan(session);
  } catch (e) { /* لا نمنع التحميل عند أي خطأ غير متوقع */ }
})();
