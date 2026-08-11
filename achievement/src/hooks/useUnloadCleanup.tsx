import { useEffect } from "react";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { SIBLING_SUPABASE_URL, SIBLING_SUPABASE_ANON_KEY } from "@/config/sso-config";
import { useAuth } from "./useAuth";

/**
 * When the user closes the tab / leaves the site:
 *  - Delete any uncompleted (in-flight) tasks of theirs.
 *  - Remove them from any rounds they joined.
 * Uses fetch keepalive so the requests survive the page unload.
 */
export const useUnloadCleanup = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const url = SIBLING_SUPABASE_URL;
    const apikey = SIBLING_SUPABASE_ANON_KEY;

    const cleanup = async () => {
      const { data } = await achievementSupabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const headers = {
        apikey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      try {
        // Pause active stopwatch tasks (preserve elapsed time across sessions)
        fetch(
          `${url}/rest/v1/tasks?user_id=eq.${user.id}&completed=eq.false&is_stopwatch=eq.true&paused_at=is.null`,
          {
            method: "PATCH",
            headers: { ...headers, Prefer: "return=minimal" },
            body: JSON.stringify({ paused_at: new Date().toISOString() }),
            keepalive: true,
          },
        );
        // Delete non-stopwatch in-flight (uncompleted) tasks
        fetch(
          `${url}/rest/v1/tasks?user_id=eq.${user.id}&completed=eq.false&is_stopwatch=eq.false`,
          { method: "DELETE", headers, keepalive: true },
        );
        // Leave ONLY rounds that are still active — finished rounds keep history
        fetch(`${url}/rest/v1/rpc/leave_active_rounds`, {
          method: "POST",
          headers: { ...headers },
          body: "{}",
          keepalive: true,
        });
      } catch {
        /* best-effort */
      }
    };

    const onHide = () => { void cleanup(); };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [user]);
};
