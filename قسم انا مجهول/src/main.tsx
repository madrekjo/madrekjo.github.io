import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import { resolveIdentity } from "./lib/device-identity";
import { supabase } from "./integrations/supabase/client";
import { sliceForAnonProject, readSsoPayload } from "./lib/sso-session";

// اربط جلسة الدخول الموحّد بعميل القسم قبل الإقلاع (مثل بقية الأقسام)، حتى
// يُعرف حساب المستخدم مباشرة ويصير المالك أدمن فوراً بلا صفحة دخول منفصلة.
async function linkSsoSession() {
  try {
    const slice = sliceForAnonProject(readSsoPayload());
    if (!slice?.access_token) return;
    const { data } = await supabase.auth.getSession();
    const cur = data.session;
    const now = Math.floor(Date.now() / 1000);
    // نتخطّى فقط إذا كانت الجلسة الحالية صالحة (غير منتهية). أما جلسة منتهية
    // عالقة في التخزين فتُستبدَل بجلسة الدخول الموحّد (تُجدَّد عبر refresh_token).
    if (cur?.access_token && (!cur.expires_at || cur.expires_at - 60 > now)) return;
    await supabase.auth.setSession({
      access_token: slice.access_token,
      refresh_token: slice.refresh_token ?? "",
    });
  } catch {
    /* تجاهل — الحارس (auth-gate) يتكفّل ببوابة الدخول */
  }
}

void linkSsoSession().finally(() =>
  resolveIdentity().finally(() => {
    createRoot(document.getElementById("root")!).render(<App />);
  })
);
