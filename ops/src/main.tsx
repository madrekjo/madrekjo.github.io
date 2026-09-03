import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/index.css";

// OPS يعمل على نطاق الموقع الرئيسي (madrekjo.github.io) إذن يسري عليه
// Service Worker الخاص بالموقع الأساسي (sw.js) الذي يعترض الطلبات الخارجية
// (Supabase + Worker) ويسبب أخطاء CORS / Failed to fetch.
// هنا نُعطّل/نُلغي أي Service Worker يتحكم بصفحة التحكم:
async function neutralizeServiceWorker() {
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length > 0) {
      await Promise.all(regs.map((r) => r.unregister().then(() => r.active && r.active.postMessage({ type: "SKIP_WAITING" })).catch(() => {})));
      // بعد إلغاء التسجيل، لا يزال SW الحالي يتحكم بالصفحة حتى إعادة تحميل.
      sessionStorage.setItem("ops_sw_bypassed", "1");
      // لمرة واحدة فقط، أعِد تحميل الصفحة للتخلص من سيطرة الـ SW القديم.
      if (!sessionStorage.getItem("ops_sw_reloaded")) {
        sessionStorage.setItem("ops_sw_reloaded", "1");
        window.location.reload();
      }
    }
  }
}

neutralizeServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
