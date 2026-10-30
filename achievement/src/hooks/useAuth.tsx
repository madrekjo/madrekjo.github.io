import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { exchangeTicket } from "@/lib/ssoSession";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [achievementUser, setAchievementUser] = useState<User | null>(null);
  const [achievementSession, setAchievementSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data } = await achievementSupabase.auth.getSession();

    setAchievementUser(data.session?.user ?? null);
    setAchievementSession(data.session ?? null);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;

    const safeRefresh = async () => {
      await refresh();
      if (!active) return;
    };

    void safeRefresh();

    const { data: { subscription } } = achievementSupabase.auth.onAuthStateChange(() => {
      void safeRefresh();
    });

    /**
     * استقبال تدفق OAuth Popup من نافذة AuthCallback.
     *
     * الأمان:
     * - نتحقق من event.origin و event.source.
     * - لا ننقل أي access/refresh token عبر postMessage — فقط ticket مؤقت.
     * - بعد النجاح نرد بـ GOOGLE_LOGIN_POPUP_CLOSE لإغلاق النافذة المنبثقة.
     */
    const handleMessage = (event: MessageEvent) => {
      const allowedOrigins = [
        window.location.origin,
        "https://madrekjo.github.io",
        "https://madrekjo.study",
      ];
      if (!allowedOrigins.includes(event.origin)) return;
      if (event.data?.type !== "GOOGLE_LOGIN_SUCCESS") return;

      const ackPopup = (success: boolean) => {
        try {
          const source = event.source as Window | null;
          if (source && typeof source.postMessage === "function") {
            source.postMessage(
              { type: "GOOGLE_LOGIN_POPUP_CLOSE", success },
              event.origin
            );
          }
        } catch {
          /* ignore */
        }
      };

      const ticket = event.data?.ticket;
      if (typeof ticket !== "string" || ticket.trim().length === 0) return;

      void (async () => {
        const res = await exchangeTicket(ticket);
        if (!active) return;
        await refresh();
        ackPopup(res.ok);
      })();
    };

    window.addEventListener("message", handleMessage);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const signOut = async () => {
    await achievementSupabase.auth.signOut();
    try { localStorage.removeItem("sb-itflhfhsfzrdfpxvlzrv-auth-token"); } catch { /* ignore */ }
    // تنظيف بقايا جلسة الدردشة القديمة إن وُجدت (الدردشة اختيارية الآن).
    try { localStorage.removeItem("sb-biabdoatwfteqwgjdxzc-auth-token"); } catch { /* ignore */ }
  };

  const value: AuthContextType = {
    user: achievementUser,
    session: achievementSession,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
