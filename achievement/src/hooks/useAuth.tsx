import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { exchangeTicket, syncAchievementUserFromChat, SsoResult } from "@/lib/ssoSession";

interface SiblingAccount {
  user: User;
  sourceSection: "chat";
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  chatUser: User | null;
  achievementUser: User | null;
  siblingSync: SiblingAccount | null;
  syncWithChat: () => Promise<SsoResult>;
  dismissSiblingSync: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  chatUser: null,
  achievementUser: null,
  siblingSync: null,
  syncWithChat: async () => ({ ok: false, error: "غير جاهز" }),
  dismissSiblingSync: () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [achievementUser, setAchievementUser] = useState<User | null>(null);
  const [achievementSession, setAchievementSession] = useState<Session | null>(null);
  const [chatUser, setChatUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [siblingSync, setSiblingSync] = useState<SiblingAccount | null>(null);

  const dismissSiblingSync = () => setSiblingSync(null);

  const refresh = async () => {
    const [{ data: chat }, { data: ach }] = await Promise.all([
      supabase.auth.getSession(),
      achievementSupabase.auth.getSession(),
    ]);

    const chatUsr = chat.session?.user ?? null;
    const achUsr = ach.session?.user ?? null;

    setChatUser(chatUsr);
    setAchievementUser(achUsr);
    setAchievementSession(ach.session ?? null);

    // في هذا التطبيق (الإنجاز) user يجب أن يمثل مستخدم مشروع الإنجاز دائمًا،
    // لأن كل استعلامات البيانات (tasks/messages/profiles/rounds) تعتمد على id الإنجاز.
    // إذا لم يوجد مستخدم إنجاز بينما توجد جلسة دردشة، نعرض Dialog المزامنة بدل لوغين مباشرة.
    setSiblingSync(achUsr || !chatUsr ? null : { user: chatUsr, sourceSection: "chat" });
    setLoading(false);
  };

  useEffect(() => {
    let active = true;

    const safeRefresh = async () => {
      await refresh();
      if (!active) return;
    };

    void safeRefresh();

    const { data: { subscription: sub1 } } = supabase.auth.onAuthStateChange(() => {
      void safeRefresh();
    });
    const { data: { subscription: sub2 } } = achievementSupabase.auth.onAuthStateChange(() => {
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
      sub1.unsubscribe();
      sub2.unsubscribe();
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const syncWithChat = async (): Promise<SsoResult> => {
    const res = await syncAchievementUserFromChat();
    await refresh();
    return res;
  };

  const signOut = async () => {
    await Promise.allSettled([
      supabase.auth.signOut(),
      achievementSupabase.auth.signOut(),
    ]);
    try { localStorage.removeItem("sb-ofltanaffcxoobfvlkii-auth-token"); } catch { /* ignore */ }
    try { localStorage.removeItem("sb-itflhfhsfzrdfpxvlzrv-auth-token"); } catch { /* ignore */ }
    setSiblingSync(null);
  };

  const value: AuthContextType = {
    user: achievementUser,
    session: achievementSession,
    loading,
    chatUser,
    achievementUser,
    siblingSync,
    syncWithChat,
    dismissSiblingSync,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
