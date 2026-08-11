import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  SSO_AUTH_BASE_URL,
  SIBLING_SUPABASE_URL,
  SIBLING_SUPABASE_ANON_KEY,
} from "@/config/sso-config";

const AuthCallback = () => {
  const [status, setStatus] = useState(
    "جاري التحقق من تسجيل الدخول..."
  );

  useEffect(() => {
    let cancelled = false;

    const applySsoSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const ticket = params.get("ticket");

      if (!ticket) {
        console.error("[AuthCallback] no ticket in URL");

        if (!cancelled) {
          setStatus(
            "انتهت مهلة تسجيل الدخول، حاول مرة أخرى"
          );
        }

        return;
      }

      try {
        console.log("[AuthCallback] requesting SSO session...");

        const res = await fetch(
          `${SSO_AUTH_BASE_URL}/session?ticket=${encodeURIComponent(
            ticket
          )}`
        );

        if (!res.ok) {
          throw new Error(
            `ticket غير صالح (${res.status})`
          );
        }

        const data = await res.json();

        const chatSession = data?.chat;
        const achievementSession = data?.achievement;

        if (
          !chatSession?.access_token ||
          !chatSession?.refresh_token
        ) {
          throw new Error(
            "بيانات جلسة الدردشة ناقصة"
          );
        }

        if (
          !achievementSession?.access_token ||
          !achievementSession?.refresh_token
        ) {
          throw new Error(
            "بيانات جلسة الإنجاز ناقصة"
          );
        }

        /**
         * --------------------------------------------------
         * CHAT SESSION
         * --------------------------------------------------
         */

        console.log(
          "[AuthCallback] applying chat session..."
        );

        const {
          data: chatSessionData,
          error: chatSessionError,
        } = await supabase.auth.setSession({
          access_token: chatSession.access_token,
          refresh_token: chatSession.refresh_token,
        });

        if (chatSessionError) {
          throw new Error(
            `فشل إنشاء جلسة الدردشة: ${chatSessionError.message}`
          );
        }

        if (!chatSessionData.session) {
          throw new Error(
            "لم يتم إنشاء جلسة الدردشة"
          );
        }

        console.log(
          "[AuthCallback] Chat session established",
          {
            userId: chatSessionData.session.user.id,
          }
        );

        /**
         * --------------------------------------------------
         * VERIFY CHAT SESSION
         * --------------------------------------------------
         *
         * نتأكد فعليًا أن Supabase أصبح يرى الجلسة
         * قبل الانتقال إلى /chat/.
         */

        const {
          data: verifiedChatSession,
          error: verifyChatError,
        } = await supabase.auth.getSession();

        if (verifyChatError) {
          throw new Error(
            `فشل التحقق من جلسة الدردشة: ${verifyChatError.message}`
          );
        }

        console.log(
          "[AuthCallback] verified chat session",
          {
            hasSession: !!verifiedChatSession.session,
            userId:
              verifiedChatSession.session?.user?.id ??
              null,
          }
        );

        if (!verifiedChatSession.session) {
          throw new Error(
            "جلسة الدردشة لم يتم حفظها بشكل صحيح"
          );
        }

        /**
         * --------------------------------------------------
         * ACHIEVEMENT SESSION
         * --------------------------------------------------
         */

        console.log(
          "[AuthCallback] applying achievement session..."
        );

        const achievementSupabase = createClient(
          SIBLING_SUPABASE_URL,
          SIBLING_SUPABASE_ANON_KEY
        );

        const {
          data: achievementSessionData,
          error: achievementSessionError,
        } = await achievementSupabase.auth.setSession({
          access_token:
            achievementSession.access_token,
          refresh_token:
            achievementSession.refresh_token,
        });

        if (achievementSessionError) {
          throw new Error(
            `فشل إنشاء جلسة الإنجاز: ${achievementSessionError.message}`
          );
        }

        if (!achievementSessionData.session) {
          throw new Error(
            "لم يتم إنشاء جلسة الإنجاز"
          );
        }

        console.log(
          "[AuthCallback] Achievement session established",
          {
            userId:
              achievementSessionData.session.user.id,
          }
        );

        /**
         * --------------------------------------------------
         * VERIFY ACHIEVEMENT SESSION
         * --------------------------------------------------
         */

        const {
          data: verifiedAchievementSession,
          error: verifyAchievementError,
        } =
          await achievementSupabase.auth.getSession();

        if (verifyAchievementError) {
          throw new Error(
            `فشل التحقق من جلسة الإنجاز: ${verifyAchievementError.message}`
          );
        }

        console.log(
          "[AuthCallback] verified achievement session",
          {
            hasSession:
              !!verifiedAchievementSession.session,
            userId:
              verifiedAchievementSession.session?.user
                ?.id ?? null,
          }
        );

        if (!verifiedAchievementSession.session) {
          throw new Error(
            "جلسة الإنجاز لم يتم حفظها بشكل صحيح"
          );
        }

        /**
         * --------------------------------------------------
         * REMOVE TICKET FROM URL
         * --------------------------------------------------
         */

        const url = new URL(window.location.href);

        url.searchParams.delete("ticket");

        window.history.replaceState(
          {},
          document.title,
          url.toString()
        );

        if (cancelled) return;

        /**
         * --------------------------------------------------
         * REDIRECT
         * --------------------------------------------------
         *
         * لا يوجد setTimeout هنا.
         *
         * وصلنا لهذه النقطة فقط بعد التأكد أن جلسة
         * الدردشة موجودة فعلًا داخل Supabase.
         */

        setStatus("تم تسجيل الدخول بنجاح");

        console.log(
          "[AuthCallback] SSO session fully established"
        );

        window.location.replace("/chat/");
      } catch (err) {
        console.error(
          "[AuthCallback] SSO failed",
          err
        );

        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "خطأ غير معروف";

          console.error(
            "[AuthCallback] error details:",
            message
          );

          setStatus(
            "فشل تسجيل الدخول، حاول مرة أخرى"
          );
        }
      }
    };

    void applySsoSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />

        <p className="text-sm text-muted-foreground">
          {status}
        </p>
      </div>
    </div>
  );
};

export default AuthCallback;