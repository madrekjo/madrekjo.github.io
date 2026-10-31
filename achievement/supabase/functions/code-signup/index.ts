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

// إنشاء حساب جديد عبر رمز الدعوة (مشروع الإنجاز):
//   - يستهلك الرمز ذرّياً، ينشئ الحساب مؤكداً بدون أي بريد، ويربطه بالرمز.
//   - يرجع token_hash ليتم الدخول فوراً (وإن تعذّر، يكفي الإيميل وكلمة المرور).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { code, email, password, name } = await req.json().catch(() => ({}));

    // --- التحقق من المدخلات -------------------------------------------------
    if (!code) return json({ error: "code_required" }, 400);
    if (!email || !EMAIL_RE.test(String(email))) return json({ error: "invalid_email" }, 400);
    if (!password || String(password).length < MIN_PASSWORD)
      return json({ error: "weak_password" }, 400);
    if (!name || !String(name).trim()) return json({ error: "name_required" }, 400);

    const codeStr = String(code).replace(/\D/g, "").padStart(6, "0");
    if (codeStr.length !== 6) return json({ error: "code_required" }, 400);
    const normEmail = String(email).trim().toLowerCase();
    const cleanName = String(name).trim().slice(0, 40);

    // --- استهلاك الكود بشكل ذرّي (حجز استخدام واحد إن كان صالحاً) ------------
    const { data: consume, error: consumeErr } = await admin.rpc("consume_access_code", {
      p_code: codeStr,
    });
    if (consumeErr) return json({ error: "db_error:" + consumeErr.message }, 500);
    if (!consume?.ok) {
      const reasons: Record<string, string> = {
        not_found: "wrong_code",
        expired: "code_expired",
        used_up: "code_used_up",
      };
      return json({ error: reasons[consume?.reason] || "code_invalid" }, 400);
    }

    const refund = async () => {
      try {
        await admin.rpc("refund_access_code", { p_code: codeStr });
      } catch { /* تجاهل أي فشل في الاسترجاع */ }
    };

    // --- إنشاء حساب بدون أي تأكيد بريد --------------------------------------
    const { data, error } = await admin.auth.admin.createUser({
      email: normEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: {
        full_name: cleanName,
        via_invite: true,
        invited_code: codeStr,
      },
    });
    if (error) {
      await refund();
      if (/already been registered|already exists|duplicate/i.test(error.message)) {
        return json({ error: "email_exists" }, 409);
      }
      return json({ error: "create_failed:" + error.message }, 400);
    }

    // --- محاولة توليد جلسة فورية (اختيارية — لا تُفشل التسجيل) --------------
    let token: string | null = null;
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ type: "magiclink", email: normEmail }),
      });
      if (res.ok) {
        const link = await res.json();
        token = link?.properties?.hashed_token || link?.hashed_token || null;
      }
    } catch (e) {
      console.error("[code-signup] generate_link threw:", e);
    }

    return json({
      ok: true,
      user_id: data.user?.id,
      email: normEmail,
      token_hash: token,
    });
  } catch (e) {
    console.error("code-signup error:", e);
    return json({ error: String(e) }, 500);
  }
});
