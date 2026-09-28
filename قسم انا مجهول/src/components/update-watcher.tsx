import { useEffect } from "react";
import { toast } from "sonner";

/**
 * مراقب النسخة: GitHub Pages يخزّن index.html بـ cache لمدة 10 دقائق،
 * فبعض الزوار يضلّوا على نسخة قديمة. هنا نطلب الصفحة بدون كاش ونقارن
 * اسم ملف الحزمة: إذا اختلفت نعرض تنبيها مع زر تحديث (أو تحديث تلقائي
 * إذا المستخدم ما كان يكتب).
 */
function currentBundle(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/anon/assets/"]');
  return el?.getAttribute("src") ?? null;
}

export function UpdateWatcher() {
  useEffect(() => {
    let cancelled = false;
    let busy = false;

    async function check() {
      if (busy || cancelled) return;
      if (sessionStorage.getItem("anon-update-seen") === currentBundle()) return;
      busy = true;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}?t=${Date.now()}`, { cache: "no-store" });
        const html = await res.text();
        const m = html.match(/\/anon\/assets\/index-[A-Za-z0-9_-]+\.js/);
        const latest = m?.[0] ?? null;
        const mine = currentBundle();
        if (!latest || !mine || latest === mine || cancelled) return;
        sessionStorage.setItem("anon-update-seen", latest);
        const typing = !!document.querySelector<HTMLElement>("textarea:focus, input:focus, [contenteditable='true']:focus");
        if (!typing) {
          location.reload();
          return;
        }
        toast("⬆️ في نسخة جديدة جاهزة", {
          description: "حدّث الصفحة عشان تشوف آخر التعديلات",
          duration: 12_000,
          action: { label: "تحديث", onClick: () => location.reload() },
        });
      } catch {
        /* تجاهل — لا نريد إزعاج المستخدم */
      } finally {
        busy = false;
      }
    }

    void check();
    const id = setInterval(() => void check(), 90_000);
    const onWake = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onWake);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  return null;
}
