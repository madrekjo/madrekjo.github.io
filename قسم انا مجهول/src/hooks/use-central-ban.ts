import { useEffect } from "react";
import { isGloballyBanned } from "@/lib/global-bans";
import { readSsoPayload, ssoEmail } from "@/lib/sso-session";

// درع الحظر المركزي داخل التطبيق: يفحص قائمة الحظر الموحّد (قاعدة الشات) دورياً
// ويطرد المحظور فوراً حتى لو كانت الصفحة مفتوحة من قبل — يكمّل js/auth-gate.js
// الذي يعمل عند تحميل الصفحة فقط.
const SSO_KEY = "mdk:sso:session";
const INTERVAL_MS = 60_000;

function wipeAndGoBanned() {
  try {
    localStorage.removeItem(SSO_KEY);
    Object.keys(localStorage).forEach((k) => {
      if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k);
    });
  } catch { /* ignore */ }
  const from = location.pathname + location.search + location.hash;
  location.replace(`/login/?from=${encodeURIComponent(from)}&banned=1`);
}

export function useCentralBan() {
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    const schedule = () => {
      if (!alive) return;
      timer = window.setTimeout(check, INTERVAL_MS);
    };

    async function check() {
      if (!alive) return;
      const email = ssoEmail(readSsoPayload());
      if (!email) { schedule(); return; }
      try {
        const banned = await isGloballyBanned(email);
        if (alive && banned) { wipeAndGoBanned(); return; }
      } catch { /* fail-open */ }
      schedule();
    }

    void check();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);
}
