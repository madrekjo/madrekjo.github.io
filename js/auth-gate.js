/* مدارك جو — درع الدخول الموحّد + حاجز الحظر المركزي
 * 1) يمنع عرض أي صفحة (غير المصرّح بها) قبل تسجيل الدخول الموحّد.
 * 2) إن كان المستخدم مسجّلاً، يتحقق من قائمة الحظر المركزية (global_bans)
 *    عبر RPC is_global_banned، ويطرد المحظور فوراً (مع مسح جلسته).
 *
 * الجلسة تُكتب في localStorage بصيغة:
 *   mdk:sso:session = { chat: {access_token, refresh_token}, ... , target, viaCode? }
 * ويكتبها: مسار Google عبر الوركر ومسار رمز الدعوة في /login/.
 */
(function () {
  "use strict";

  var GATE_ON = true;                    /* مفتاح التشغيل العام للدرع */
  var SESSION_KEY = "mdk:sso:session";   /* جلسة الدخول الموحّد */
  var LOGIN_PATH = "/login/";            /* صفحة الدخول الموحّد (عامة) */

  /* فحص الحظر المركزي (نفس ما يستخدمه الوركر). المفتاح عام بطبيعته. */
  var BAN_URL = "https://romocwtqzdnovfgtmwzb.supabase.co/rest/v1/rpc/is_global_banned";
  var BAN_KEY = "sb_publishable_FxIiY1SHBKXkoByvKu0-Jg_msr2Qd45";
  var BAN_CACHE_KEY = "mdk:ban:cache";
  var BAN_TTL = 5 * 60 * 1000;           /* مهلة صلاحية نتيجة الفحص */
  var BAN_TIMEOUT = 5000;                /* أقصى انتظار لفحص الحظر */

  if (!GATE_ON) return;

  var docEl = document.documentElement;

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

  function readSession() {
    var raw = null;
    try { raw = localStorage.getItem(SESSION_KEY); } catch (e) { return undefined; }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function goLogin(banned) {
    var from = location.pathname + location.search + location.hash;
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

  function hide() { try { docEl.style.visibility = "hidden"; } catch (e) {} }
  function show() { try { docEl.style.visibility = ""; } catch (e) {} }

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

    /* فحص طازج: نُخفي المحتوى ريثما ينتهي حتى لا يرى المحظور شيئاً. */
    hide();
    fetchBanned(email).then(function (banned) {
      writeCache(email, banned);
      if (banned) { wipeAndGoBanned(); return; }
      show();
    }).catch(function () {
      show();                          /* تعذّر الفحص: نسمح (fail-open) */
    });
  }

  /* -------- التنفيذ -------- */
  try {
    if (isPublic()) return;

    var session = readSession();
    if (session === undefined) return;   /* تعذّر قراءة المخزن: fail-open */
    if (!session) { goLogin(false); return; }

    checkBan(session);
  } catch (e) { /* لا نمنع التحميل عند أي خطأ غير متوقع */ }
})();
