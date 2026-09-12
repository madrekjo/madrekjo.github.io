import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

const ADMIN_SEEN_KEY = "madrekjo_tf_admin_seen";

/* علّم أن هذا المتصفح دخل أدمن من قبل — يستخدم لاستعادة الدخول الصامت
 * (بتسجيل مؤقت) عند انقطاع الجلسة دون طلب الرمز مرة أخرى. */
export function markAdminSeen() {
  try {
    localStorage.setItem(ADMIN_SEEN_KEY, "1");
  } catch {}
}
export function clearAdminSeen() {
  try {
    localStorage.removeItem(ADMIN_SEEN_KEY);
  } catch {}
}
function wasAdminSeen() {
  try {
    return localStorage.getItem(ADMIN_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

async function silentAdminRelogin() {
  const { error } = await supabase.auth.signInAnonymously();
  return !error;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [loading, setLoading] = useState(true);

  async function checkAdmin(userId: string) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(!!data);
    if (data) markAdminSeen();
    setAdminChecked(true);
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    let sess = data.session;
    if (!sess && wasAdminSeen() && (await silentAdminRelogin())) {
      const again = await supabase.auth.getSession();
      sess = again.data.session;
    }
    setSession(sess);
    if (sess?.user) {
      setAdminChecked(false);
      await checkAdmin(sess.user.id);
    } else {
      setIsAdmin(false);
      setAdminChecked(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      /* إشارات الإنهاء الحقيقية فقط هي من تطفئ اللوحة؛
         أي حدث آخر (كالتجديد) لا يمسح صلاحية الأدمن. */
      if (event === "SIGNED_OUT") {
        setSession(null);
        setIsAdmin(false);
        setAdminChecked(true);
        return;
      }
      setSession(s);
      if (s?.user) {
        setAdminChecked(false);
        checkAdmin(s.user.id);
      }
    });

    refresh();

    const onBecameVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onBecameVisible);
    window.addEventListener("focus", onBecameVisible);

    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onBecameVisible);
      window.removeEventListener("focus", onBecameVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { session, isAdmin, adminChecked, loading };
}