import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/lib/supabase";

// اربط جلسة الدخول الموحّد بعميل القسم قبل الإقلاع (مثل بقية الأقسام)، حتى
// يُعرف حساب المستخدم مباشرة ويصير المالك أدمن فوراً بلا صفحة دخول منفصلة.
const SSO_KEY = "mdk:sso:session";

async function linkSsoSession() {
  try {
    const raw = localStorage.getItem(SSO_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw) as Record<
      string,
      { access_token?: string; refresh_token?: string } | undefined
    >;
    const s = payload?.ajr;
    if (!s?.access_token) return;
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return; // جلسة القسم موجودة أصلاً
    await supabase.auth.setSession({
      access_token: s.access_token,
      refresh_token: s.refresh_token ?? "",
    });
  } catch {
    /* تجاهل — الحارس (auth-gate) يتكفّل ببوابة الدخول */
  }
}

void linkSsoSession().finally(() =>
  createRoot(document.getElementById("root")!).render(<App />)
);
