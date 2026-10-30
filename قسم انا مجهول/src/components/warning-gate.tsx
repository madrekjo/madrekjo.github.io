import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ackMyWarning, myActiveWarning, type ActiveWarning } from "@/lib/warnings";
import { WarningScreen } from "@/components/warning-screen";

// فحص دوري للتحذير النشط للحساب: يظهر فوراً عند فتح الموقع
// ثم يتابع كل ٤٥ ثانية حتى لو كان الأدمن أرسل التحذير والصفحة مفتوحة.
const INTERVAL_MS = 45_000;

function keyOf(w: ActiveWarning) {
  return `${w.at ?? ""}|${w.message}`;
}

export function WarningGate() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [warning, setWarning] = useState<ActiveWarning | null>(null);
  // توقيع آخر تحذير أغلقه المستخدم — يمنع إعادة فتح الشاشة لنفس التحذير
  const dismissedRef = useRef<string | null>(null);

  useEffect(() => {
    setWarning(null);
    dismissedRef.current = null;
    if (!uid) return;

    let alive = true;
    let timer: number | undefined;

    const schedule = () => {
      if (!alive) return;
      timer = window.setTimeout(() => { void check(); }, INTERVAL_MS);
    };

    async function check() {
      if (!alive) return;
      try {
        const w = await myActiveWarning();
        if (!alive) return;
        if (!w) {
          setWarning((prev) => (prev ? null : prev));
        } else if (dismissedRef.current !== keyOf(w)) {
          // نفس الكائن إن لم يتغيّر التحذير => لا إعادة تركيب ولا إعادة صوت
          setWarning((prev) => (prev && keyOf(prev) === keyOf(w) ? prev : w));
        }
      } catch {
        /* تجاهل — إعادة المحاولة لاحقاً */
      }
      schedule();
    }

    void check();

    const onWake = () => {
      if (document.visibilityState !== "visible" || !alive) return;
      if (timer) clearTimeout(timer);
      void check();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [uid]);

  if (!warning) return null;

  return (
    <WarningScreen
      warning={warning}
      onDismiss={() => {
        dismissedRef.current = keyOf(warning);
        setWarning(null);
        void ackMyWarning();
      }}
    />
  );
}
