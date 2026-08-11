import { useEffect, useState } from "react";
import { exchangeTicket } from "@/lib/ssoSession";

const AuthCallback = () => {
  const [status, setStatus] = useState("جاري التحقق من تسجيل الدخول...");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const ticket = params.get("ticket");

      const isPopup = Boolean(window.opener && !window.opener.closed);

      if (!ticket) {
        console.error("[AuthCallback] no ticket in URL");
        if (!cancelled) setStatus("انتهت مهلة تسجيل الدخول، حاول مرة أخرى");
        if (isPopup) window.setTimeout(() => window.close(), 3000);
        return;
      }

      /**
       * وضع النافذة المنبثقة (Popup):
       *
       * النافذة فتحت عبر window.open() من تطبيق الإنجاز، لذلك window.opener
       * هو نافذة التطبيق نفسها. لا ننقل أي access/refresh token عبر postMessage —
       * نرسل فقط الـticket المؤقت، والتطبيق يجلبه مرة واحدة عبر /session
       * ثم يرد بـ GOOGLE_LOGIN_POPUP_CLOSE لإغلاق هذه النافذة.
       */
      if (isPopup) {
        const targetOrigin = window.location.origin;

        window.opener.postMessage(
          { type: "GOOGLE_LOGIN_SUCCESS", ticket },
          targetOrigin
        );

        if (!cancelled) {
          setStatus("تم تسجيل الدخول بنجاح، جاري الإغلاق...");
        }

        const closePopup = () => {
          if (!cancelled) window.close();
        };

        const handleCloseMessage = (event: MessageEvent) => {
          if (event.origin !== targetOrigin) return;
          if (event.source !== window.opener) return;
          if (event.data?.type !== "GOOGLE_LOGIN_POPUP_CLOSE") return;

          window.removeEventListener("message", handleCloseMessage);
          closePopup();
        };

        window.addEventListener("message", handleCloseMessage);

        // إغلاق احتياطي إذا تعذر وصول رسالة الإغلاق
        window.setTimeout(closePopup, 8000);

        return;
      }

      /**
       * وضع الصفحة الكاملة: نستبدل الـticket مباشرة وننتقل للإنجاز.
       */
      const res = await exchangeTicket(ticket);
      if (cancelled) return;

      const url = new URL(window.location.href);
      url.searchParams.delete("ticket");
      window.history.replaceState({}, document.title, url.toString());

      if (res.ok) {
        setStatus("تم تسجيل الدخول بنجاح");
        console.log("[AuthCallback] SSO session fully established");
        window.location.replace("/achievement/");
      } else {
        console.error("[AuthCallback] SSO failed", res.error);
        setStatus(
          res.error
            ? `فشل تسجيل الدخول: ${res.error}`
            : "فشل تسجيل الدخول، حاول مرة أخرى"
        );
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-muted-foreground">{status}</p>
      </div>
    </div>
  );
};

export default AuthCallback;
