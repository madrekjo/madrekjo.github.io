import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

const GENDERS = ["male", "female"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { code, email, password, name, gender } = await req.json().catch(() => ({}));

    // --- التحقق من المدخلات -------------------------------------------------
    if (!code) return json({ error: "code_required" }, 400);
    if (!email || !EMAIL_RE.test(String(email))) return json({ error: "invalid_email" }, 400);
    if (!password || String(password).length < MIN_PASSWORD)
      return json({ error: "weak_password" }, 400);
    if (!name || !String(name).trim()) return json({ error: "name_required" }, 400);
    if (!GENDERS.includes(String(gender))) return json({ error: "gender_required" }, 400);

    const codeStr = String(code).replace(/\D/g, "").padStart(6, "0");
    const normEmail = String(email).trim().toLowerCase();
    const cleanName = String(name).trim().slice(0, 40);

    // --- استهلاك الكود بشكل ذرّي (حجز استخدام واحد إن كان صالحاً) ------------
    const { data: consume, error: consumeErr } = await adminClient.rpc(
      "consume_access_code",
      { p_code: codeStr }
    );
    if (consumeErr) return json({ error: "db_error:" + consumeErr.message }, 500);
    if (!consume?.ok) {
      const reasons: Record<string, string> = {
        not_found: "wrong_code",
        expired: "code_expired",
        used_up: "code_used_up",
      };
      return json({ error: reasons[consume.reason] || "code_invalid" }, 400);
    }

    const refund = async () => {
    try {
      await adminClient.rpc("refund_access_code", { p_code: codeStr });
    } catch { /* تجاهل أي فشل في الاسترجاع */ }
  };

    // --- إنشاء حساب بدون أي تأكيد بريد ----------------------------------------
    // gender إلزامي لمن دخل برمز دعوة، وvia_invite=true ليميّز الأدمن هذا المستخدم.
    // منع تكرار الإيميل يتم ذرّياً هنا: إن سبق تسجيل الإيميل يرفض createUser نفسه
    // (دون الحاجة إلى مسح قائمة المستخدمين البطيء الذي قد يتجاوز مهلة الطلب).
    const { data, error } = await adminClient.auth.admin.createUser({
      email: normEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: {
        full_name: cleanName,
        gender: String(gender),
        via_invite: true,
      },
    });
    if (error) {
      await refund();
      if (/already been registered/i.test(error.message)) {
        return json({ error: "email_exists" }, 409);
      }
      return json({ error: "create_failed:" + error.message }, 400);
    }

    return json({ ok: true, user_id: data.user!.id, email: normEmail });
  } catch (e) {
    console.error("invite-signup error:", e);
    return json({ error: String(e) }, 500);
  }
});