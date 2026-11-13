import { provisionSections } from "../_shared/provision.ts";

// ============================================================================
// تجهيز جلسات كل الأقسام لمستخدم يملك جلسة صالحة في مشروع الإنجاز.
//
// يستخدمه /login/ بعد الدخول برمز الدعوة (الرمز يُتحقَّق منه في مشروع الإنجاز)،
// وكذلك قسم «أنا مجهول» لمعالجة نفسه إن وصل بلا جلسة anon.
//
// الأمان:
//   - لا نثق بأي إيميل يرسله العميل: نتحقق من توكن الإنجاز عند مشروع الإنجاز
//     عبر /auth/v1/user ونستخرج الإيميل من الاستجابة الموثوقة.
//   - مفاتيح service_role تبقى في أسرار الدالة ولا تعود للعميل أبداً.
//   - نعيد token_hash (استخدام لمرة واحدة) لا جلسات جاهزة.
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ACH_URL = "https://itflhfhsfzrdfpxvlzrv.supabase.co";

// مفتاح عام (publishable) — آمن للنشر. يمكن تجاوزه بسرّ إن رغبت.
function achAnonKey(): string {
  try {
    return Deno.env.get("ACHIEVEMENT_ANON_KEY") ||
      "sb_publishable_3mypt4J1F0sG5RD6oTSZZg_6PNgwoyY";
  } catch {
    return "sb_publishable_3mypt4J1F0sG5RD6oTSZZg_6PNgwoyY";
  }
}

interface AchUser {
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

// الحظر الموحّد يعيش في مشروع الدردشة (is_global_banned). نتحقق منه قبل منح أي
// جلسة حتى لا يفتح الرمز الأقسام لحساب محظور. وإن تعذّر الفحص لا نُفشل الدخول
// (نفس سلوك بقية المسارات)، فالحارس في كل قسم يبقى خط الدفاع الأخير.
async function isBanned(email: string): Promise<boolean> {
  try {
    const base = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${base}/rest/v1/rpc/is_global_banned`, {
      method: "POST",
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_email: email }),
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch {
    return false;
  }
}

// يتحقق من توكن الإنجاز ويعيد المستخدم (أو null إن كان التوكن غير صالح).
async function verifyAchievementToken(token: string): Promise<AchUser | null> {
  try {
    const res = await fetch(`${ACH_URL}/auth/v1/user`, {
      headers: {
        apikey: achAnonKey(),
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user || typeof user !== "object" || !user.email) return null;
    return user as AchUser;
  } catch (e) {
    console.error("[provision-sections] verify token threw:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing_token" }, 401);

  const user = await verifyAchievementToken(token);
  if (!user?.email) return json({ error: "invalid_token" }, 401);

  if (await isBanned(user.email)) return json({ error: "banned" }, 403);

  try {
    const meta = user.user_metadata || {};
    const metadata = {
      full_name: (meta.full_name as string) || (meta.name as string) || "مستخدم جديد",
      avatar_url: (meta.avatar_url as string) || (meta.picture as string) || "",
      gender: (meta.gender as string) || null,
      via_code: true,
      provisioning: "sections",
    };

    const { map: sections, debug } = await provisionSections(user.email, metadata);

    // لا نكشف تفاصيل حسّاسة؛ debug يحتوي حالات فقط (ok/no_key/...).
    return json({ ok: true, email: user.email, sections, debug });
  } catch (e) {
    console.error("provision-sections error:", e);
    return json({ error: String(e) }, 500);
  }
});
