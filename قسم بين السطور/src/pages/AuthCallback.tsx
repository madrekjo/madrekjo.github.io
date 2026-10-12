import { useEffect, useRef, useState } from "react";
import { consumeSsoTicket } from "@/lib/sso";

type Status = "working" | "error" | "done";

export default function AuthCallback() {
  const [status, setStatus] = useState<Status>("working");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("ticket") || "";
    if (!ticket) {
      setStatus("error");
      return;
    }

    (async () => {
      try {
        await consumeSsoTicket(ticket);
        setStatus("done");
        window.location.replace("/sutur/");
      } catch (err) {
        console.error("[AuthCallback] consume failed", err);
        setStatus("error");
      }
    })();
  }, []);

  if (status === "error") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
        <div className="w-full max-w-md rounded-3xl border border-gold/40 bg-card p-8 shadow-xl">
          <div className="text-5xl">⚠️</div>
          <h1 className="mt-3 font-serif text-2xl font-bold text-ink">
            تعذّر إكمال تسجيل الدخول
          </h1>
          <p className="mt-2 text-sm leading-7 text-ink-soft">
            التذكرة غير صالحة أو انتهت صلاحيتها، أو أن دخول القسم لم
            يُفعَّل بعد. أعد المحاولة من صفحة الدخول.
          </p>
          <a
            href="/sutur/"
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-gold px-6 py-3 text-sm font-bold text-white transition hover:bg-gold-deep"
          >
            العودة لصفحة الدخول
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="font-serif text-3xl font-bold text-gold-deep">
        بين السطور
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        {status === "done" ? "تم الدخول، جارٍ التحويل..." : "جارٍ تسجيل دخولك..."}
      </p>
      {status !== "done" && (
        <div className="mt-4 size-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      )}
    </div>
  );
}