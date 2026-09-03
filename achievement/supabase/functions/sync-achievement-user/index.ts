import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHAT_AUTH_BASE = "https://biabdoatwfteqwgjdxzc.supabase.co";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// التحقق من أن صاحب الـ chat access token هو نفس الـ email المطلوب مزامنته.
// email هو المعرف المشترك بين المشروعين لنفس الحساب (نفس حساب Google).
async function verifyChatEmail(token: string, email: string): Promise<boolean> {
  try {
    const res = await fetch(`${CHAT_AUTH_BASE}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: "sb_publishable_V7dBpXLxsRDy9D0WdK4aig_xp5vHWJc" },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.email && String(data.email).toLowerCase() === String(email).toLowerCase();
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, chat_access_token, chat_user_id, name, avatar_url } = await req.json().catch(() => ({}));
    if (!email || !chat_access_token) {
      return json({ error: "email and chat_access_token are required" }, 400);
    }

    const ok = await verifyChatEmail(chat_access_token, email);
    if (!ok) {
      return json({ error: "Invalid chat access token for this email" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // البحث عن حساب الإنجاز الحالي بنفس البريد
    const { data: list } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = (list?.users ?? []).find(
      (u) => u.email && u.email.toLowerCase() === String(email).toLowerCase()
    );

    let user;
    let created = false;
    // كلمة مرور عشوائية تُستخدم مرة واحدة فقط لتسجيل الدخول الصامت
    // من تطبيق الإنجاز (لا تُعرض للمستخدم، وGoogle تبقى طريقة الدخول الأساسية).
    const password = crypto.randomUUID().replace(/-/g, "") + "Ab1!";

    if (existing) {
      // حساب موجود بنفس البريد → نستخدمه مع تعيين كلمة مرور عشوائية
      // كي يتمكن التطبيق من فتح جلسة صامتة بنفس البريد عند الحاجة.
      user = existing;
      const { error: pwErr } = await adminClient.auth.admin.updateUserById(
        user.id,
        { password }
      );
      if (pwErr) return json({ error: pwErr.message }, 400);
    } else {
      // حساب جديد في مشروع الإنجاز → يُنشأ بكلمة المرور العشوائية نفسها.
      const { data, error } = await adminClient.auth.admin.createUser({
        email: String(email),
        password,
        email_confirm: true,
        user_metadata: {
          name: name ?? "",
          avatar_url: avatar_url ?? "",
          email: String(email),
          chat_user_id: chat_user_id ?? null,
        },
      });
      if (error) return json({ error: error.message }, 400);
      user = data.user!;
      created = true;
    }

    // تحديث بيانات meta (الاسم/الصورة/ربط الدردشة).
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata ?? {}),
        name: name ?? user.user_metadata?.name ?? "",
        avatar_url: avatar_url ?? user.user_metadata?.avatar_url ?? "",
        email: String(email),
        chat_user_id: chat_user_id ?? user.user_metadata?.chat_user_id ?? null,
      },
    });
    if (updateErr) return json({ error: updateErr.message }, 400);

    // التأكد من وجود profile (trigger handle_new_user ينشئه تلقائياً؛ نضمنه هنا عند الحاجة)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) {
      const { error: insertErr } = await adminClient.from("profiles").insert({
        user_id: user.id,
        display_name: name || null,
        avatar_url: avatar_url || "",
      });
      if (insertErr) return json({ error: insertErr.message }, 400);
    }

    return json({ user_id: user.id, email, password, created });
  } catch (e) {
    console.error("sync-achievement-user error:", e);
    return json({ error: String(e) }, 500);
  }
});
