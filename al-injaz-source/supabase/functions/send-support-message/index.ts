import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { content } = await req.json().catch(() => ({}));
    const trimmed = typeof content === "string" ? content.trim() : "";
    if (!trimmed || trimmed.length > 4000) {
      return new Response(JSON.stringify({ error: "Invalid content" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Look up admin user_ids server-side; never leak them to the client.
    const { data: admins, error: adminErr } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (adminErr) throw adminErr;

    const targets = (admins ?? []).map((r) => r.user_id as string);
    if (targets.length === 0) {
      return new Response(JSON.stringify({ error: "No admins available" }), { status: 503, headers: corsHeaders });
    }

    const rows = targets.map((id) => ({
      sender_id: user.id,
      receiver_id: id,
      content: trimmed,
    }));
    const { error: insertErr } = await adminClient.from("messages").insert(rows);
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
