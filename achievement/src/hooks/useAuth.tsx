import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";

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
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const sync = (chatSession: Session | null, achievementSession: Session | null) => {
      if (!active) return;
      // هذا التطبيق يقرأ بياناته من مشروع الإنجاز، لذا user هنا يجب أن يمثل
      // حساب مستخدم الإنجاز (id الإنجاز) وليس حساب الدردشة.
      const resolvedUser = achievementSession?.user ?? chatSession?.user ?? null;
      const resolvedSession = achievementSession ?? chatSession ?? null;
      setSession(resolvedSession);
      setUser(resolvedUser);
      setLoading(false);
    };

    const refresh = async () => {
      const [{ data: chat }, { data: ach }] = await Promise.all([
        supabase.auth.getSession(),
        achievementSupabase.auth.getSession(),
      ]);
      sync(chat.session, ach.session);
    };

    void refresh();

    const { data: { subscription: sub1 } } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    const { data: { subscription: sub2 } } = achievementSupabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => {
      active = false;
      sub1.unsubscribe();
      sub2.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await Promise.allSettled([
      supabase.auth.signOut(),
      achievementSupabase.auth.signOut(),
    ]);
    try { localStorage.removeItem("sb-ofltanaffcxoobfvlkii-auth-token"); } catch { /* ignore */ }
    try { localStorage.removeItem("sb-itflhfhsfzrdfpxvlzrv-auth-token"); } catch { /* ignore */ }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
