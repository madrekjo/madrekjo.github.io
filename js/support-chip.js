/* ============================================================
   support-chip.js — زر الدعم الدائري في الشريط العلوي للصفحات النهائية
   (صفحات الحقول 2009 + صفحة 2010)، في أقصى يمين الشريط (topbar-right).
   يظهر دائماً (حتى للزائر بلا حساب) ويفتح /support/.
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
      ".mdk-schip{display:inline-flex;align-items:center;justify-content:center;" +
      "width:44px;height:44px;border-radius:50%;flex-shrink:0;text-decoration:none;" +
      "color:var(--gold-light,#FFF3B0);" +
      "background:linear-gradient(135deg,var(--field-accent-dim, rgba(255,215,0,.18)),rgba(255,215,0,.05));" +
      "border:1.5px solid var(--field-accent-border, rgba(255,215,0,.55));" +
      "box-shadow:0 6px 18px rgba(0,0,0,.4),0 0 22px rgba(255,215,0,.12);" +
      "transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;}" +
      ".mdk-schip:hover{transform:translateY(-2px) scale(1.06);" +
      "border-color:var(--field-accent, rgba(255,215,0,.9));" +
      "box-shadow:0 10px 24px rgba(0,0,0,.5),0 0 34px rgba(255,215,0,.3);}" +
      ".mdk-schip svg{width:23px;height:23px;}" +
      "@media(max-width:640px){.mdk-schip{width:38px;height:38px;}.mdk-schip svg{width:20px;height:20px;}}";
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
      '<path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>';
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
