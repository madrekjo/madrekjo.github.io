import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { provisionSections } from "../_shared/provision.ts";

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

// دالة الدخول المباشر برمز الدعوة:
//   - الرمز صالح (نشط: غير منتهٍ ولم تُستهلك كل استخداماته) → لا يُستهلك هنا،
//     فيبقى الرمز صالحاً حتى انتهاء صلاحيته أو إلغائه، ويمكن لصاحب الحساب
//     الدخول أكثر من مرة خلال تلك المدة.
//   - يُجهّز الحساب في كل الأقسام النشطة ويُرجع رمز دخول سحري (token_hash) لكل
//     قسم، فيسجّل العميل الدخول بالرمز في كل المنصة بلا كلمة مرور.
//   - إن لم يكن الرمز مربوطاً بأي حساب → mode=signup (ينشئ حساباً جديداً).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { code, email } = await req.json().catch(() => ({}));

    if (!code || !/\d/.test(String(code))) return json({ error: "code_required" }, 400);
    const codeStr = String(code).replace(/\D/g, "").padStart(6, "0");
    if (codeStr.length !== 6) return json({ error: "code_required" }, 400);

    // --- تحديد المحاولات حسب IP (حماية من تخمين الرمز) ---------------------
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const { data: allowed, error: rateErr } = await adminClient.rpc("register_code_attempt", {
      p_key: ip,
      p_max: 10,
      p_window_seconds: 600,
    });
    if (rateErr) return json({ error: "db_error:" + rateErr.message }, 500);
    if (allowed === false) return json({ error: "too_many_attempts" }, 429);

    // --- التحقق من صلاحية الرمز -------------------------------------------
    const { data: val, error: valErr } = await adminClient.rpc("validate_access_code", {
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
    const { data: accounts, error: accErr } = await adminClient.rpc("invited_accounts_for_code", {
      p_code: codeStr,
    });
    if (accErr) return json({ error: "db_error:" + accErr.message }, 500);

    const list: Array<{ user_id: string; name: string | null; email: string | null }> =
      Array.isArray(accounts) ? accounts : [];

    // لا حساب مرتبط → رمز جديد يُستخدم لإنشاء حساب.
    if (list.length === 0) {
      return json({ ok: true, mode: "signup" });
    }

    let target: (typeof list)[number] | null = null;
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

    // --- التحقق من الحظر قبل منح أي جلسة (الحظر الموحد أو حظر الدردشة) -------
    const { data: bannedFlag } = await adminClient.rpc("is_global_banned", {
      p_email: target.email,
    });
    if (bannedFlag === true) return json({ error: "banned" }, 403);

    // --- بيانات البروفايل (لنقل الاسم/الصورة/الجنس إلى بقية الأقسام) --------
    const { data: prof } = await adminClient
      .from("profiles")
      .select("full_name, avatar_url, gender")
      .eq("user_id", target.user_id)
      .maybeSingle();

    const metadata = {
      full_name: prof?.full_name || target.name || "مستخدم جديد",
      avatar_url: prof?.avatar_url || "",
      gender: prof?.gender || null,
      via_invite: true,
      invited_code: codeStr,
    };

    // --- تجهيز الحساب في كل الأقسام + توليد جلسة دخول لكل قسم --------------
    const { map: sections, debug } = await provisionSections(target.email!, metadata);

    if (!sections.chat) {
      return json({ error: "link_failed:no_chat_session", debug }, 500);
    }

    return json({
      ok: true,
      mode: "login",
      name: target.name,
      sections,
    });
  } catch (e) {
    console.error("invite-login error:", e);
    return json({ error: String(e) }, 500);
  }
});
