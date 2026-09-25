import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

type AdminState = { is_admin: boolean; email: string | null };

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // فحص الدور عبر RPC (my_admin_status) — يتجاوز RLS على user_roles
  const checkAdmin = useCallback(async (attempt = 0): Promise<void> => {
    const { data, error } = await (supabase.rpc as any)("my_admin_status");
    if (error) {
      if (attempt < 2) {
        setTimeout(() => { void checkAdmin(attempt + 1); }, 700);
        return;
      }
      setAdminError(error.message);
      setIsAdmin(false);
      setAdminChecked(true);
      return;
    }
    const r = (data ?? {}) as AdminState;
    setAdminError(null);
    setIsAdmin(!!r.is_admin);
    setAdminChecked(true);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setAdminChecked(false);
        setTimeout(() => { void checkAdmin(); }, 0);
      } else {
        setIsAdmin(false);
        setAdminChecked(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) void checkAdmin();
      else setAdminChecked(true);
      setLoading(false);
    });

    // إعادة الفحص عند العودة للتاب (بعد تسجيل دخول في تاب آخر مثلاً)
    const onFocus = () => { if (document.visibilityState === "visible") setNonce((n) => n + 1); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkAdmin]);

  useEffect(() => {
    if (nonce > 0 && session?.user) {
      setAdminChecked(false);
      void checkAdmin();
    }
  }, [nonce, session?.user, checkAdmin]);

  return { session, isAdmin, adminChecked, adminError, loading };
}
