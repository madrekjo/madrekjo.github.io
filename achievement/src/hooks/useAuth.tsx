import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session, createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  SIBLING_SUPABASE_URL,
  SIBLING_SUPABASE_ANON_KEY,
} from "@/config/sso-config";

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const chatSupabase = createClient(
      SIBLING_SUPABASE_URL,
      SIBLING_SUPABASE_ANON_KEY
    );
    await Promise.allSettled([
      supabase.auth.signOut(),
      chatSupabase.auth.signOut(),
    ]);
    try { localStorage.removeItem("sb-ofltanaffcxoobfvlkii-auth-token"); } catch { /* ignore */ }
    try { localStorage.removeItem("sb-cwqzhwunpivvdliytalw-auth-token"); } catch { /* ignore */ }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
