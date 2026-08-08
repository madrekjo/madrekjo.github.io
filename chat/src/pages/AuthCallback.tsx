import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const AuthCallback = () => {
  const [status, setStatus] = useState("جاري التحقق من تسجيل الدخول...");

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let subscription: any = null;

    const sendSuccess = (session: any) => {
      console.log("[AuthCallback] ✅ session ready, sending to opener", {
        hasAccessToken: !!session.access_token,
        hasRefreshToken: !!session.refresh_token,
        expiresAt: session.expires_at,
      });

      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: "GOOGLE_LOGIN_SUCCESS",
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            },
            window.opener.origin
          );
          console.log("[AuthCallback] ✅ postMessage sent to opener");
        } else {
          console.warn("[AuthCallback] ⚠️ opener not available");
        }
      } catch (err) {
        console.error("[AuthCallback] ❌ postMessage failed", err);
      }

      setStatus("تم تسجيل الدخول بنجاح");
      setTimeout(() => {
        if (!cancelled) window.close();
      }, 500);
    };

    const check = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      console.log("[AuthCallback] getSession attempt", attempts, {
        hasSession: !!data?.session,
        error: error?.message,
      });

      if (data?.session) {
        sendSuccess(data.session);
      } else if (attempts < 20) {
        attempts++;
        setTimeout(check, 300);
      } else {
        console.error("[AuthCallback] ❌ timeout waiting for session");
        setStatus("انتهت مهلة تسجيل الدخول، حاول مرة أخرى");
      }
    };

    check();

    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[AuthCallback] onAuthStateChange", event, {
        hasSession: !!session,
      });
      if (cancelled) return;
      if (event === "SIGNED_IN" && session) {
        sendSuccess(session);
      }
    });

    subscription = sub;

    return () => {
      cancelled = true;
      if (subscription) subscription.unsubscribe();
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
