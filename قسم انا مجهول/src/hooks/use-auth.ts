import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

// كاش مشترك بين كل نسخ useAuth (الهيدر + الصفحات) حتى لا تتكرر الطلبات
type Cache = { uid: string | null; isAdmin: boolean; checked: boolean; error: string | null; at: number };
let cache: Cache = { uid: null, isAdmin: false, checked: false, error: null, at: 0 };
const listeners = new Set<(c: Cache) => void>();
let inflight: Promise<void> | null = null;

function publish(c: Cache) {
  cache = c;
  listeners.forEach((l) => l(c));
}

/** 1) RPC my_admin_status (يتجاوز RLS)  2) عند فشله: قراءة user_roles  3) إعادة محاولة */
async function runCheck(uid: string, attempt = 0) {
  const { data, error } = await (supabase.rpc as any)("my_admin_status");
  if (!error) {
    const r = (data ?? {}) as { is_admin: boolean };
    publish({ uid, isAdmin: !!r.is_admin, checked: true, error: null, at: Date.now() });
    return;
  }
  const { data: row, error: e2 } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (e2) {
    if (attempt < 2) {
      setTimeout(() => { void runCheck(uid, attempt + 1); }, 800);
      return;
    }
    publish({ uid, isAdmin: false, checked: true, error: e2.message, at: Date.now() });
    return;
  }
  publish({ uid, isAdmin: !!row, checked: true, error: null, at: Date.now() });
}

function ensureCheck(uid: string | null, force = false) {
  if (!uid) {
    publish({ uid: null, isAdmin: false, checked: true, error: null, at: Date.now() });
    return;
  }
  if (!force && cache.uid === uid && cache.checked) return;
  if (inflight) return;
  inflight = runCheck(uid).finally(() => { inflight = null; });
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [st, setSt] = useState<Cache>(cache);
  const [loading, setLoading] = useState(true);
  const uid = session?.user?.id ?? null;

  useEffect(() => {
    listeners.add(setSt);
    return () => { listeners.delete(setSt); };
  }, []);

  useEffect(() => {
    ensureCheck(uid);
    setSt(cache);
  }, [uid]);

  // إعادة فحص عند العودة للتاب (بمعدل واحد كل ١٠ ثوانٍ) — بلا حلقة تحديث
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - cache.at < 10_000) return;
      ensureCheck(uid, true);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [uid]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      const id = s?.user?.id ?? null;
      setSession((prev) => (prev?.user?.id ?? null) === id ? prev : s);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const isAdmin = !!uid && st.uid === uid && st.isAdmin;
  const adminChecked = !uid || (st.uid === uid && st.checked);
  return { session, isAdmin, adminChecked, adminError: st.error, loading };
}
