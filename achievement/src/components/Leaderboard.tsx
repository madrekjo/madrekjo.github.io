import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTasks } from "@/hooks/useTasks";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Trophy, Loader2, Flame } from "lucide-react";

const useCompletedRoundCounts = () => {
  return useQuery({
    queryKey: ["completed-round-counts"],
    queryFn: async () => {
      const { data, error } = await (achievementSupabase.rpc as any)("get_completed_round_counts");
      if (error) throw error;
      const map = new Map<string, number>();
      ((data ?? []) as { user_id: string; completed_rounds: number }[]).forEach((r) =>
        map.set(r.user_id, Number(r.completed_rounds))
      );
      return map;
    },
    refetchInterval: 30000,
    staleTime: 60_000,
  });
};

type CategoryKey = "daily" | "weekly" | "monthly";

const toMinutes = (category: string, duration: number, dailyUnit?: string): number => {
  if (category === "daily") {
    return dailyUnit === "minutes" ? duration : duration * 60;
  }
  if (category === "weekly") return duration * 24 * 60;
  return duration * 7 * 24 * 60;
};

const formatForCategory = (totalMinutes: number, category: CategoryKey): string => {
  if (category === "daily") {
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    if (hours > 0 && mins > 0) return `${hours} ساعة و ${mins} دقيقة`;
    if (hours > 0) return `${hours} ساعة`;
    return `${mins} دقيقة`;
  }
  if (category === "weekly") {
    const days = Math.round((totalMinutes / (24 * 60)) * 10) / 10;
    return `${days} يوم`;
  }
  const weeks = Math.round((totalMinutes / (7 * 24 * 60)) * 10) / 10;
  return `${weeks} أسبوع`;
};

const medals = ["🥇", "🥈", "🥉"];

const categoryLabels: Record<CategoryKey, string> = {
  daily: "🔥 المتصدرون اليومي (المدى الطويل)",
  weekly: "📅 المتصدرون أسبوعياً",
  monthly: "🏆 المتصدرون شهرياً",
};

const TODAY_LABEL = "⚡ متصدرو اليوم (يتصفر يومياً)";

const CategoryLeaderboard = ({
  category,
  tasks,
  loading,
  titleOverride,
  todayOnly = false,
  flameMap,
}: {
  category: CategoryKey;
  tasks: any[];
  loading: boolean;
  titleOverride?: string;
  todayOnly?: boolean;
  flameMap?: Map<string, number>;
}) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const filtered = tasks.filter((t) => {
    if (t.category !== category) return false;
    if (todayOnly) {
      const created = new Date(t.created_at);
      if (created < startOfToday) return false;
    }
    return true;
  });

  const userStats = filtered.reduce<
    Record<string, { name: string; totalMinutes: number; taskCount: number }>
  >((acc, task) => {
    const userId = task.user_id;
    const name = task.profiles?.display_name?.trim() || "مستخدم";
    if (!acc[userId]) {
      acc[userId] = { name, totalMinutes: 0, taskCount: 0 };
    }
    acc[userId].totalMinutes += toMinutes(task.category, task.duration, (task as any).daily_unit);
    acc[userId].taskCount += 1;
    return acc;
  }, {});

  const sorted = Object.entries(userStats)
    .sort(([, a], [, b]) => b.totalMinutes - a.totalMinutes)
    .slice(0, 10);

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h4 className="mb-3 text-base font-semibold text-foreground">
        {titleOverride ?? categoryLabels[category]}
      </h4>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          لا توجد إنجازات بعد
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map(([userId, stats], index) => (
            <div
              key={userId}
              className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-lg font-bold text-secondary-foreground">
                  {index < 3 ? medals[index] : index + 1}
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">{stats.name}</span>
                    {flameMap && (flameMap.get(userId) ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[11px] font-bold text-orange-600 dark:text-orange-400"
                        title={`أنجز ${flameMap.get(userId)} جولة`}
                      >
                        <Flame className="h-3 w-3 fill-orange-500 text-orange-500" />
                        {flameMap.get(userId)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats.taskCount} مهمة منجزة
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="text-sm font-semibold">
                {formatForCategory(stats.totalMinutes, category)}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const Leaderboard = () => {
  const { allSuccessfulTasks, loadingAll } = useTasks();
  const { data: flameMap } = useCompletedRoundCounts();
  const [dailyMode, setDailyMode] = useState<"today" | "longterm">("today");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6 text-gold" />
        <h3 className="text-xl font-bold text-foreground">قائمة المتصدرين</h3>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={dailyMode === "today" ? "default" : "outline"}
              onClick={() => setDailyMode("today")}
            >
              ⚡ متصدرو اليوم
            </Button>
            <Button
              size="sm"
              variant={dailyMode === "longterm" ? "default" : "outline"}
              onClick={() => setDailyMode("longterm")}
            >
              🔥 المدى الطويل
            </Button>
          </div>
          {dailyMode === "today" ? (
            <CategoryLeaderboard
              key="today"
              category="daily"
              tasks={allSuccessfulTasks}
              loading={loadingAll}
              titleOverride={TODAY_LABEL}
              todayOnly
              flameMap={flameMap}
            />
          ) : (
            <CategoryLeaderboard
              key="longterm"
              category="daily"
              tasks={allSuccessfulTasks}
              loading={loadingAll}
              flameMap={flameMap}
            />
          )}
        </div>
        <CategoryLeaderboard category="weekly" tasks={allSuccessfulTasks} loading={loadingAll} flameMap={flameMap} />
        <CategoryLeaderboard category="monthly" tasks={allSuccessfulTasks} loading={loadingAll} flameMap={flameMap} />
      </div>
    </div>
  );
};