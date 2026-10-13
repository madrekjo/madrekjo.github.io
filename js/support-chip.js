/* ============================================================
   support-chip.js — زر الدعم في الشريط العلوي للصفحات النهائية
   (صفحات الحقول 2009 + صفحة 2010).
   يظهر دائماً (حتى للزائر بلا حساب) ويفتح /support/.
   يعمل بنفس نمط profile-chip.js ويُدرج في نفس الشريط.
   ============================================================ */
(function () {
  "use strict";

  var SUPPORT_URL = "/support/";
  var STYLE_ID = "mdk-schip-style";

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent =
      ".mdk-schip{display:inline-flex;align-items:center;gap:7px;text-decoration:none;" +
      "flex-shrink:0;padding:6px 13px;border-radius:50px;" +
      "background:var(--field-accent-dim, rgba(255,255,255,.06));" +
      "border:1px solid var(--field-accent-border, rgba(255,255,255,.14));" +
      "color:var(--text, #f0f0f5);transition:background .2s,border-color .2s;" +
      "font-family:'Cairo',sans-serif;font-size:.82rem;font-weight:700;}" +
      ".mdk-schip:hover{background:var(--field-accent-dim, rgba(255,255,255,.12));" +
      "border-color:var(--field-accent, rgba(255,255,255,.3));}" +
      ".mdk-schip svg{width:17px;height:17px;flex-shrink:0;}" +
      "@media(max-width:640px){.mdk-schip span{display:none;}.mdk-schip{padding:7px;}}";
    (document.head || document.documentElement).appendChild(st);
  }

  function buildChip() {
    var a = document.createElement("a");
    a.className = "mdk-schip";
    a.href = SUPPORT_URL;
    a.title = "الدعم والمساعدة";
    a.setAttribute("aria-label", "الدعم والمساعدة");
    a.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/>' +
      '<path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>' +
      '<span>الدعم</span>';
    return a;
  }

  function mount() {
    var bar = document.querySelector("#sharedTopbar .topbar-right");
    if (!bar || bar.querySelector(".mdk-schip")) return;
    injectStyle();
    bar.insertBefore(buildChip(), bar.firstChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
