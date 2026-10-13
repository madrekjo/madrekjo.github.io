// معالجة فشل تحميل حزمة (chunk) بعد نشر جديد:
// عندما يبقى المتصفح على نسخة قديمة ثم يحدث نشر، قد يفشل تحميل جزء مؤجَّل
// (dynamic import) ويرمي: "Failed to fetch dynamically imported module".
// هنا نعيد التحميل مرة واحدة لكل جلسة ليجلب المتصفح النسخة الجديدة.
const RELOAD_KEY = "mdk:chunk-reload";

window.addEventListener("vite:preloadError", (event) => {
  let alreadyTried = false;
  try {
    alreadyTried = sessionStorage.getItem(RELOAD_KEY) === "1";
  } catch {
    /* التخزين غير متاح */
  }
  if (alreadyTried) return; // تجنّب حلقة إعادة تحميل لا نهائية
  try {
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    /* التخزين غير متاح */
  }
  event.preventDefault();
  window.location.reload();
});
