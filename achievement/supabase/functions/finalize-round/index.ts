import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MINUTE_MS = 60_000;

const computeWorkMs = (round: any, fromMs: number, toMs: number) => {
  const roundStartMs = new Date(round.starts_at).getTime();
  const roundEndMs = new Date(round.ends_at).getTime();
  const from = Math.max(fromMs, roundStartMs);
  const to = Math.min(toMs, roundEndMs);
  if (to <= from) return 0;

  const workMs = Math.max(0, Number(round.work_minutes) * MINUTE_MS);
  const breakMs = Math.max(0, Number(round.break_minutes) * MINUTE_MS);
  if (workMs <= 0) return 0;
  if (breakMs <= 0) return to - from;

  const cycleMs = workMs + breakMs;
  let total = 0;
  const firstCycle = Math.floor(Math.max(0, from - roundStartMs) / cycleMs);
  const lastCycle = Math.floor(Math.max(0, to - roundStartMs) / cycleMs);

  for (let cycleIndex = firstCycle; cycleIndex <= lastCycle; cycleIndex += 1) {
    const workStart = roundStartMs + cycleIndex * cycleMs;
    const workEnd = workStart + workMs;
    total += Math.max(0, Math.min(to, workEnd) - Math.max(from, workStart));
  }

  return total;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const { roundId } = await req.json().catch(() => ({}));
    if (!roundId || typeof roundId !== "string") {
      return new Response(JSON.stringify({ error: "Missing roundId" }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: round, error: roundErr } = await admin
      .from("rounds")
      .select("*")
      .eq("id", roundId)
      .maybeSingle();
    if (roundErr) throw roundErr;
    if (!round) {
      return new Response(JSON.stringify({ error: "Round not found" }), { status: 404, headers: corsHeaders });
    }

    if (round.credited) {
      return new Response(JSON.stringify({ success: true, alreadyCredited: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(round.ends_at).getTime() > Date.now()) {
      return new Response(JSON.stringify({ error: "Round not yet ended" }), { status: 400, headers: corsHeaders });
    }

    const { data: adminRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    const isCreator = round.creator_id === user.id;
    if (!adminRole && !isCreator) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const roundStartMs = new Date(round.starts_at).getTime();
    const roundEndMs = new Date(round.ends_at).getTime();
    const fullWorkMinutes = Math.max(
      1,
      Math.ceil(computeWorkMs(round, roundStartMs, roundEndMs) / MINUTE_MS),
    );

    const { data: participants, error: pErr } = await admin
      .from("round_participants")
      .select("user_id, joined_at")
      .eq("round_id", roundId);
    if (pErr) throw pErr;

    let creditedMinutes = 0;
    if (participants && participants.length > 0) {
      const rows = participants
        .map((p) => {
          const joinedMs = Math.max(new Date(p.joined_at).getTime(), roundStartMs);
          const duration = Math.min(
            fullWorkMinutes,
            Math.ceil(computeWorkMs(round, joinedMs, roundEndMs) / MINUTE_MS),
          );
          if (duration <= 0) return null;
          creditedMinutes += duration;
          return {
            user_id: p.user_id,
            title: `جولة: ${round.title}`,
            category: "daily" as const,
            duration,
            daily_unit: "minutes",
            started_at: new Date(joinedMs).toISOString(),
            ends_at: new Date(roundEndMs).toISOString(),
            completed: true,
            is_success: true,
          };
        })
        .filter(Boolean);

      if (rows.length > 0) {
        const { error: insErr } = await admin.from("tasks").insert(rows);
        if (insErr) throw insErr;
      }
    }

    const { error: upErr } = await admin
      .from("rounds")
      .update({ status: "ended", credited: true })
      .eq("id", roundId);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ success: true, credited: creditedMinutes, count: participants?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
