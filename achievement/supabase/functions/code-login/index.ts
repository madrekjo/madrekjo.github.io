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

// الدخول المباشر برمز الدعوة (مشروع الإنجاز):
//   - الرمز صالح → لا يُستهلك هنا، فيبقى صالحاً حتى انتهاء مدته أو إلغائه.
//   - إن لم يكن مرتبطاً بأي حساب → mode=signup (ينشئ حساباً جديداً).
//   - إن كان مرتبطاً بحساب → يُرجع token_hash (رابط سحري) فيسجّل العميل الدخول
//     في مشروع الإنجاز بلا كلمة مرور.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CodeAccount = { user_id: string; name: string | null; email: string | null };

async function magicToken(url: string, service: string, email: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ type: "magiclink", email }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`[code-login] generate_link failed: ${res.status} ${txt.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    // REST /admin/generate_link يُرجع hashed_token في الجذر،
    // و supabase-js يلفّه داخل properties. نغطّي الحالتين.
    return data?.properties?.hashed_token || data?.hashed_token || null;
  } catch (e) {
    console.error("[code-login] generate_link threw:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { code, email } = await req.json().catch(() => ({}));

    if (!code || !/\d/.test(String(code))) return json({ error: "code_required" }, 400);
    const codeStr = String(code).replace(/\D/g, "").padStart(6, "0");
    if (codeStr.length !== 6) return json({ error: "code_required" }, 400);

    // --- تحديد المحاولات حسب IP (حماية من تخمين الرمز) ---------------------
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const { data: allowed, error: rateErr } = await admin.rpc("register_code_attempt", {
      p_key: ip,
      p_max: 10,
      p_window_seconds: 600,
    });
    if (rateErr) return json({ error: "db_error:" + rateErr.message }, 500);
    if (allowed === false) return json({ error: "too_many_attempts" }, 429);

    // --- التحقق من صلاحية الرمز -------------------------------------------
    const { data: val, error: valErr } = await admin.rpc("validate_access_code", {
      p_code: codeStr,
    });
    if (valErr) return json({ error: "db_error:" + valErr.message }, 500);
    if (!val?.valid) {
      const reasons: Record<string, string> = {
        not_found: "wrong_code",
        expired: "code_expired",
        used_up: "code_used_up",
      };
      return json({ error: reasons[val?.reason] || "code_invalid" }, 400);
    }

    // --- الحسابات المرتبطة بالرمز -----------------------------------------
    const { data: accounts, error: accErr } = await admin.rpc("invited_accounts_for_code", {
      p_code: codeStr,
    });
    if (accErr) return json({ error: "db_error:" + accErr.message }, 500);

    const list: CodeAccount[] = Array.isArray(accounts) ? accounts : [];

    // لا حساب مرتبط → رمز جديد يُستخدم لإنشاء حساب.
    if (list.length === 0) {
      return json({ ok: true, mode: "signup", message: val?.message || "" });
    }

    let target: CodeAccount | null = null;
    if (email && EMAIL_RE.test(String(email))) {
      const norm = String(email).trim().toLowerCase();
      target = list.find((a) => (a.email || "").toLowerCase() === norm) || null;
      if (!target) return json({ error: "email_mismatch" }, 400);
    } else if (list.length === 1) {
      target = list[0];
    } else {
      // أكثر من حساب على نفس الرمز → نطلب إيميله للتمييز.
      return json({ ok: true, mode: "choose", count: list.length });
    }

    if (!target?.email) return json({ error: "account_missing_email" }, 400);

    // --- توليد جلسة دخول سحرية في مشروع الإنجاز ----------------------------
    const token = await magicToken(supabaseUrl, serviceRoleKey, target.email);
    if (!token) return json({ error: "link_failed" }, 500);

    return json({
      ok: true,
      mode: "login",
      name: target.name || "",
      email: target.email,
      token_hash: token,
    });
  } catch (e) {
    console.error("code-login error:", e);
    return json({ error: String(e) }, 500);
  }
});
