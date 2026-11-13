import { provisionSections } from "../_shared/provision.ts";

// ============================================================================
// تجهيز جلسات أقسام المنصة لمستخدم يملك جلسة صالحة في مشروع الإنجاز.
//
// مشروع الإنجاز هو مصدر الدخول الموحّد (رمز الدعوة + Google)، ولا يوجد مشروع
// دردشة منفصل. يستخدمه:
//   - /login/ بعد التحقق من رمز الدعوة (verifyOtp) ليفتح بقية الأقسام.
//   - «أنا مجهول» لمعالجة نفسه إن وصل بلا جلسة anon.
//
// الأمان:
//   - لا نثق بأي إيميل يرسله العميل: نتحقق من التوكن عند /auth/v1/user في
//     مشروع الإنجاز ونستخرج الإيميل من الاستجابة الموثوقة.
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

// مفتاح عام (publishable) لمشروع الإنجاز — آمن للنشر.
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

// يتحقق من توكن الإنجاز ويعيد المستخدم (أو null إن كان التوكن غير صالح).
async function verifyAchievementToken(token: string): Promise<AchUser | null> {
  try {
    const base = Deno.env.get("SUPABASE_URL")!;
    const res = await fetch(`${base}/auth/v1/user`, {
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
    return json({ ok: true, sections, debug });
  } catch (e) {
    console.error("provision-sections error:", e);
    return json({ error: String(e) }, 500);
  }
});
