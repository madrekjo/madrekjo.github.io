/* ============================================================
   profile-chip.js — زر البروفايل في الشريط العلوي للصفحات النهائية
   (صفحات الحقول 2009 + صفحة 2010).
   يقرأ الجلسة الموحّدة (mdk:sso:session) ويعرض صورة المستخدم واسمه
   في أقصى يمين الشريط، ويفتح /profile/ عند الضغط.
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "mdk:sso:session";
  var PROFILE_URL = "/profile/";
  var ORDER = ["chat", "achievement", "sutur", "anon", "ajr", "talaawat"];
  var STYLE_ID = "mdk-pchip-style";

  function b64urlDecode(str) {
    try {
      str = String(str).replace(/-/g, "+").replace(/_/g, "/");
      while (str.length % 4) str += "=";
      var bin = atob(str);
      var out = "";
      for (var i = 0; i < bin.length; i++) {
        out += "%" + ("00" + bin.charCodeAt(i).toString(16)).slice(-2);
      }
      return decodeURIComponent(out);
    } catch (e) { return null; }
  }

  function decodeJwt(token) {
    try {
      var parts = String(token).split(".");
      if (parts.length < 2) return null;
      var json = b64urlDecode(parts[1]);
      return json ? JSON.parse(json) : null;
    } catch (e) { return null; }
  }

  function readSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch (e) { return null; }
  }

  function getIdentity(session) {
    if (!session) return null;
    var found = null;
    for (var i = 0; i < ORDER.length && !found; i++) {
      var s = session[ORDER[i]];
      if (s && s.access_token) found = s;
    }
    if (!found) {
      for (var k in session) {
        if (session[k] && session[k].access_token) { found = session[k]; break; }
      }
    }
    if (!found) return null;
    var p = decodeJwt(found.access_token);
    if (!p) return null;
    var um = p.user_metadata || {};
    var email = p.email || um.email || "";
    var name = um.full_name || um.name || um.display_name || um.user_name ||
      (email ? email.split("@")[0] : "");
    var avatar = um.avatar_url || um.picture || "";
    return { name: name || "حسابي", avatar: avatar };
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent =
      ".mdk-pchip{display:inline-flex;align-items:center;gap:9px;text-decoration:none;" +
      "flex-shrink:0;padding:5px 12px 5px 6px;border-radius:50px;" +
      "background:var(--field-accent-dim, rgba(255,255,255,.06));" +
      "border:1px solid var(--field-accent-border, rgba(255,255,255,.14));" +
      "color:var(--text, #f0f0f5);transition:background .2s,border-color .2s;}" +
      ".mdk-pchip:hover{background:var(--field-accent-dim, rgba(255,255,255,.12));" +
      "border-color:var(--field-accent, rgba(255,255,255,.3));}" +
      ".mdk-pchip .mdk-pchip-img,.mdk-pchip .mdk-pchip-fallback{" +
      "width:32px;height:32px;border-radius:50%;flex-shrink:0;}" +
      ".mdk-pchip .mdk-pchip-img{object-fit:cover;display:block;}" +
      ".mdk-pchip .mdk-pchip-fallback{display:flex;align-items:center;justify-content:center;" +
      "font-family:'Tajawal',sans-serif;font-size:15px;font-weight:800;color:#0a1420;" +
      "background:linear-gradient(135deg,var(--gold,#FFD700),var(--gold-dark,#B8860B));}" +
      ".mdk-pchip-name{font-family:'Cairo',sans-serif;font-size:.82rem;font-weight:700;" +
      "max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      "@media(max-width:640px){.mdk-pchip{padding:4px;}" +
      ".mdk-pchip-name{display:none;}}";
    (document.head || document.documentElement).appendChild(st);
  }

  function buildChip(identity) {
    var a = document.createElement("a");
    a.className = "mdk-pchip";
    a.href = PROFILE_URL;
    a.title = identity.name ? identity.name + " — الملف الشخصي" : "الملف الشخصي";
    a.setAttribute("aria-label", "الملف الشخصي");

    if (identity.avatar) {
      var img = document.createElement("img");
      img.className = "mdk-pchip-img";
      img.src = identity.avatar;
      img.alt = identity.name || "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", function () {
        a.replaceChild(fallback(identity), img);
      });
      a.appendChild(img);
    } else {
      a.appendChild(fallback(identity));
    }

    var nm = document.createElement("span");
    nm.className = "mdk-pchip-name";
    nm.textContent = identity.name || "حسابي";
    a.appendChild(nm);
    return a;
  }

  function fallback(identity) {
    var d = document.createElement("span");
    d.className = "mdk-pchip-fallback";
    var ch = (identity.name || "؟").trim().charAt(0);
    d.textContent = ch || "؟";
    return d;
  }

  function mount() {
    var bar = document.querySelector("#sharedTopbar .topbar-right");
    if (!bar || bar.querySelector(".mdk-pchip")) return;
    var identity = getIdentity(readSession());
    if (!identity) return; // البوابة تتكفّل بالتحويل عند غياب الجلسة
    injectStyle();
    bar.insertBefore(buildChip(identity), bar.firstChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
