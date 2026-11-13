import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import { supabase } from "./integrations/supabase/client";
import { sliceForAnonProject, readSsoPayload, SSO_KEY, type SsoPayload } from "./lib/sso-session";

// دالة provision-sections داخل مشروع الإنجاز (المصدر الموحّد للدخول) تتحقق من
// توكن الإنجاز ثم تعيد token_hash لكل الأقسام. نستعملها كمعالجة ذاتية حين يصل
// القسم بلا جلسة anon (مثل الدخول برمز الدعوة من تطبيق الإنجاز مباشرة أو من
// /login/ قبل تجهيز الأقسام) حتى لا يُطلب من المستخدم «سجّل الدخول» عند
// التعليق أو الإعجاب.
const ACH_URL = "https://itflhfhsfzrdfpxvlzrv.supabase.co";
const ACH_PUBLISHABLE_KEY = "sb_publishable_3mypt4J1F0sG5RD6oTSZZg_6PNgwoyY";
const ACH_PROJECT_REF = "itflhfhsfzrdfpxvlzrv";

async function hasValidSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const cur = data.session;
  if (!cur?.access_token) return false;
  const now = Math.floor(Date.now() / 1000);
  return !cur.expires_at || cur.expires_at - 60 > now;
}

// توكن الإنجاز من تخزين مشروع الإنجاز — نفس الأصل (Origin) فالتخزين مشترك.
// يُغطّي الدخول من /achievement/login/ الذي لا يكتب mdk:sso:session.
function achTokenFromStorage(): string | null {
  try {
    const raw = localStorage.getItem(`sb-${ACH_PROJECT_REF}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = parsed?.currentSession?.access_token ?? parsed?.access_token;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

function achievementToken(payload: SsoPayload | null): string | null {
  const fromSso = payload?.achievement?.access_token;
  if (typeof fromSso === "string" && fromSso) return fromSso;
  return achTokenFromStorage();
}

function writeAnonSlice(slice: { access_token: string; refresh_token: string }) {
  try {
    const payload = readSsoPayload() || {};
    payload.anon = slice;
    localStorage.setItem(SSO_KEY, JSON.stringify(payload));
  } catch {
    /* تجاهل — الجلسة مثبّتة في عميل القسم بالفعل */
  }
}

async function healAnonSession(): Promise<void> {
  const token = achievementToken(readSsoPayload());
  if (!token) return;
  const res = await fetch(`${ACH_URL}/functions/v1/provision-sections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ACH_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: "{}",
  });
  if (!res.ok) return;
  const data = await res.json().catch(() => null);
  const tokenHash = data?.sections?.anon?.token_hash;
  if (typeof tokenHash !== "string" || !tokenHash) return;
  const { data: verified, error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  const session = verified?.session;
  if (error || !session?.access_token) return;
  writeAnonSlice({
    access_token: session.access_token,
    refresh_token: session.refresh_token ?? "",
  });
}

// اربط جلسة الدخول الموحّد بعميل القسم قبل الإقلاع (مثل بقية الأقسام)، حتى
// يُعرف حساب المستخدم مباشرة ويصير المالك أدمن فوراً بلا صفحة دخول منفصلة.
async function linkSsoSession() {
  try {
    const slice = sliceForAnonProject(readSsoPayload());
    if (slice?.access_token && !(await hasValidSession())) {
      await supabase.auth.setSession({
        access_token: slice.access_token,
        refresh_token: slice.refresh_token ?? "",
      });
    }
  } catch {
    /* تجاهل — الحارس (auth-gate) يتكفّل ببوابة الدخول */
  }

  // لا جلسة صالحة في القسم؟ نولّدها من جلسة الإنجاز بدل مطالبة المستخدم بالدخول.
  try {
    if (!(await hasValidSession())) await healAnonSession();
  } catch {
    /* تجاهل — يبقى السلوك القديم إن تعذّر التجهيز */
  }
}

void linkSsoSession().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
