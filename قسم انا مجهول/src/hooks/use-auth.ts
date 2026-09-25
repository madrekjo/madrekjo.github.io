import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setAdminChecked(false);
        setTimeout(() => checkAdmin(s.user.id), 0);
      } else {
        setIsAdmin(false);
        setAdminChecked(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) checkAdmin(data.session.user.id);
      else setAdminChecked(true);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function checkAdmin(userId: string, attempt = 0) {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) {
      if (attempt < 1) {
        setTimeout(() => checkAdmin(userId, attempt + 1), 900);
        return;
      }
      setAdminError(error.message);
      setIsAdmin(false);
      setAdminChecked(true);
      return;
    }
    setAdminError(null);
    setIsAdmin(!!data);
    setAdminChecked(true);
  }

  return { session, isAdmin, adminChecked, adminError, loading };
}
