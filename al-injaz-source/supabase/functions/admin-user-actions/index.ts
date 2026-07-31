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
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body ?? {};
    console.log("admin-user-actions called with action:", action);

    if (action === "delete_task") {
      const { taskId } = body;
      const { error } = await adminClient.from("tasks").delete().eq("id", taskId);
      if (error) throw error;
    } else if (action === "update_task") {
      const { taskId, updates } = body;
      const ALLOWED_FIELDS = ["duration", "title", "is_success", "completed"] as const;
      const safeUpdates: Record<string, unknown> = {};
      for (const key of ALLOWED_FIELDS) {
        if (updates && Object.prototype.hasOwnProperty.call(updates, key)) {
          safeUpdates[key] = updates[key];
        }
      }
      if (Object.keys(safeUpdates).length === 0) {
        return new Response(JSON.stringify({ error: "No allowed fields to update" }), { status: 400, headers: corsHeaders });
      }
      const { error } = await adminClient.from("tasks").update(safeUpdates).eq("id", taskId);
      if (error) throw error;
    } else if (action === "reset_user") {
      // delete all tasks for a specific user
      const { userId } = body;
      const { error } = await adminClient.from("tasks").delete().eq("user_id", userId);
      if (error) throw error;
    } else if (action === "reduce_hours") {
      // reduce total minutes from user's completed daily tasks
      const { userId, minutesToRemove } = body;
      let remaining = Number(minutesToRemove);
      if (!remaining || remaining <= 0) {
        return new Response(JSON.stringify({ error: "Invalid minutes" }), { status: 400, headers: corsHeaders });
      }
      const { data: tasks } = await adminClient
        .from("tasks")
        .select("*")
        .eq("user_id", userId)
        .eq("completed", true)
        .eq("is_success", true)
        .eq("category", "daily")
        .order("created_at", { ascending: false });

      for (const t of tasks ?? []) {
        if (remaining <= 0) break;
        if (t.duration <= remaining) {
          remaining -= t.duration;
          await adminClient.from("tasks").delete().eq("id", t.id);
        } else {
          await adminClient.from("tasks").update({ duration: t.duration - remaining }).eq("id", t.id);
          remaining = 0;
        }
      }
    } else if (action === "get_user_email") {
      const { userId } = body;
      const { data, error } = await adminClient.auth.admin.getUserById(userId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, email: data.user?.email ?? null, created_at: data.user?.created_at ?? null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      return new Response(JSON.stringify({ error: "Unknown action", received: action ?? null }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
