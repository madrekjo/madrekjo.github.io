import { useCallback, useEffect, useState } from "react";
import { chatClient, anonClient, achievementClient } from "@/lib/supabase-clients";

export interface PlatformStats {
  chatUsers: number;
  chatPosts: number;
  chatActiveToday: number;
  anonPosts: number;
  anonBlocked: number;
  anonReportsOpen: number;
  achievementUsers: number;
  achievementActiveRounds: number;
  achievementTasks: number;
}

const emptyStats: PlatformStats = {
  chatUsers: 0,
  chatPosts: 0,
  chatActiveToday: 0,
  anonPosts: 0,
  anonBlocked: 0,
  anonReportsOpen: 0,
  achievementUsers: 0,
  achievementActiveRounds: 0,
  achievementTasks: 0,
};

export function usePlatformStats(authed: boolean) {
  const [stats, setStats] = useState<PlatformStats>(emptyStats);
  const [loading, setLoading] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<"checking" | "online" | "offline">("checking");

  const load = useCallback(async () => {
    if (!authed) return;
    try {
      const start = Date.now();
      const [
        chatUsers,
        chatPosts,
        anonPosts,
        anonBlocked,
        anonReportsOpen,
        achievementUsers,
        achievementActiveRounds,
        achievementTasks,
      ] = await Promise.allSettled([
        chatClient.from("profiles").select("id", { count: "exact", head: true }),
        chatClient.from("posts").select("id", { count: "exact", head: true }),
        anonClient.from("posts").select("id", { count: "exact", head: true }),
        anonClient.from("blocked_devices").select("device_id", { count: "exact", head: true }),
        anonClient.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
        achievementClient.from("profiles").select("id", { count: "exact", head: true }),
        achievementClient.from("rounds").select("id", { count: "exact", head: true }).eq("status", "active"),
        achievementClient.from("tasks").select("id", { count: "exact", head: true }),
      ]);

      const today = new Date().toISOString().slice(0, 10);
      const chatActiveToday = await chatClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("last_seen_at", today);

      setStats({
        chatUsers: chatUsers.status === "fulfilled" ? chatUsers.value.count ?? 0 : 0,
        chatPosts: chatPosts.status === "fulfilled" ? chatPosts.value.count ?? 0 : 0,
        chatActiveToday: chatActiveToday.count ?? 0,
        anonPosts: anonPosts.status === "fulfilled" ? anonPosts.value.count ?? 0 : 0,
        anonBlocked: anonBlocked.status === "fulfilled" ? anonBlocked.value.count ?? 0 : 0,
        anonReportsOpen: anonReportsOpen.status === "fulfilled" ? anonReportsOpen.value.count ?? 0 : 0,
        achievementUsers: achievementUsers.status === "fulfilled" ? achievementUsers.value.count ?? 0 : 0,
        achievementActiveRounds: achievementActiveRounds.status === "fulfilled" ? achievementActiveRounds.value.count ?? 0 : 0,
        achievementTasks: achievementTasks.status === "fulfilled" ? achievementTasks.value.count ?? 0 : 0,
      });

      const elapsed = Date.now() - start;
      setWorkerStatus(elapsed < 6000 ? "online" : "offline");
    } catch {
      setWorkerStatus("offline");
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    load();

    // تلميح: خفّض الاستهلاك — يُحدَّث كل 5 دقائق وفقط عندما تكون اللوحة ظاهرة أمامك.
    const iv = setInterval(load, 5 * 60 * 1000);
    const onVis = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  return { stats, loading, workerStatus, refresh: load };
}
