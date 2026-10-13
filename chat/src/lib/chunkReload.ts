// تحديث ذاتي للنسخة:
// 1) إذا فشل تحميل حزمة (chunk) بعد نشر جديد يرمي المتصفح:
//    "Failed to fetch dynamically imported module" — نعيد التحميل مرة واحدة.
// 2) عندما تتفعّل نسخة جديدة من الـService Worker نعيد التحميل مرة واحدة
//    حتى لا يبقى المستخدم على نسخة قديمة من التطبيق.

function reloadOnce(key: string): boolean {
  try {
    if (sessionStorage.getItem(key) === "1") return false; // تجنّب حلقة لا نهائية
    sessionStorage.setItem(key, "1");
  } catch {
    /* التخزين غير متاح */
  }
  window.location.reload();
  return true;
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnce("mdk:chunk-reload");
});

if ("serviceWorker" in navigator) {
  // ابحث عن تحديث جديد للـSW فوراً وكل 30 دقيقة
  navigator.serviceWorker.ready
    .then((reg) => {
      try {
        reg.update();
      } catch {
        /* تجاهل */
      }
      setInterval(() => {
        try {
          reg.update();
        } catch {
          /* تجاهل */
        }
      }, 30 * 60 * 1000);
    })
    .catch(() => {
      /* لا يوجد تسجيل — تجاهل */
    });

  // عند تفعيل نسخة جديدة من الـSW أعِد التحميل مرة واحدة
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    reloadOnce("mdk:sw-reload");
  });
}
