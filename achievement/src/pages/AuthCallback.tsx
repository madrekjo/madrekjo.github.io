import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { SSO_AUTH_BASE_URL } from "@/config/sso-config";

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
          access_token: chatSession.access_token,
          refresh_token: chatSession.refresh_token,
        });

        await achievementSupabase.auth.setSession({
          access_token: achievementSession.access_token,
          refresh_token: achievementSession.refresh_token,
        });

        // التأكد أن المستخدم موجود فعلًا في Auth مشروع الإنجاز.
        // إذا كانت جلسة الإنجاز صالحة نكمل مباشرة، وإلا نزامن الحساب عبر Edge Function
        // (تتحقق الدالة من جلسة الدردشة ثم تُنشئ/تستعيد حساب الإنجاز بنفس البريد).
        const { data: achCheck, error: achCheckErr } =
          await achievementSupabase.auth.getUser();

        if (achCheckErr || !achCheck?.user) {
          const {
            data: { user: chatUser },
          } = await supabase.auth.getUser();

          if (!chatUser?.email) {
            throw new Error("جلسة الدردشة لا تحتوي بريد إلكتروني");
          }

          const { data: syncRes, error: syncErr } =
            await achievementSupabase.functions.invoke("sync-achievement-user", {
              body: {
                email: chatUser.email,
                chat_access_token: chatSession.access_token,
                chat_user_id: chatUser.id,
                name:
                  chatUser.user_metadata?.full_name ??
                  chatUser.user_metadata?.name ??
                  "",
                avatar_url: chatUser.user_metadata?.avatar_url ?? "",
              },
            });

          if (syncErr) {
            throw new Error(
              `تعذرت مزامنة حساب الإنجاز: ${syncErr.message ?? "خطأ غير معروف"}`
            );
          }

          if (syncRes?.password) {
            const { error: pErr } =
              await achievementSupabase.auth.signInWithPassword({
                email: syncRes.email ?? chatUser.email,
                password: syncRes.password,
              });
            if (pErr) {
              throw new Error(`تعذر فتح جلسة الإنجاز: ${pErr.message}`);
            }
          }
        }

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
