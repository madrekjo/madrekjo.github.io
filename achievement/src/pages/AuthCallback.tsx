import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  SSO_AUTH_BASE_URL,
  SIBLING_SUPABASE_URL,
  SIBLING_SUPABASE_ANON_KEY,
} from "@/config/sso-config";

const AuthCallback = () => {
  const [status, setStatus] = useState("جاري التحقق من تسجيل الدخول...");

  useEffect(() => {
    let cancelled = false;

    const applySsoSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const ticket = params.get("ticket");

      if (!ticket) {
        console.error("[AuthCallback] no ticket in URL");
        if (!cancelled) setStatus("انتهت مهلة تسجيل الدخول، حاول مرة أخرى");
        return;
      }

      try {
        const res = await fetch(
          `${SSO_AUTH_BASE_URL}/session?ticket=${encodeURIComponent(ticket)}`
        );
        if (!res.ok) throw new Error(`ticket غير صالح (${res.status})`);
        const data = await res.json();

        const achievementSession = data?.achievement;
        const chatSession = data?.chat;
        if (
          !achievementSession?.access_token ||
          !achievementSession?.refresh_token ||
          !chatSession?.access_token ||
          !chatSession?.refresh_token
        ) {
          throw new Error("بيانات الجلسة ناقصة");
        }

        await supabase.auth.setSession({
          access_token: achievementSession.access_token,
          refresh_token: achievementSession.refresh_token,
        });

        const chatSupabase = createClient(
          SIBLING_SUPABASE_URL,
          SIBLING_SUPABASE_ANON_KEY
        );
        await chatSupabase.auth.setSession({
          access_token: chatSession.access_token,
          refresh_token: chatSession.refresh_token,
        });

        const url = new URL(window.location.href);
        url.searchParams.delete("ticket");
        window.history.replaceState({}, document.title, url.toString());

        if (cancelled) return;
        setStatus("تم تسجيل الدخول بنجاح");
        setTimeout(() => {
          if (!cancelled) window.location.href = "/achievement/";
        }, 600);
      } catch (err) {
        console.error("[AuthCallback] SSO failed", err);
        if (!cancelled) setStatus("فشل تسجيل الدخول، حاول مرة أخرى");
      }
    };

    applySsoSession();

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
