import { useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { CreateTaskForm } from "./CreateTaskForm";
import { UpcomingTasks } from "./UpcomingTasks";
import { TaskCard } from "./TaskCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Trophy, Loader2, ListTodo, CheckCircle, BarChart3, Sparkles, Flame, Zap } from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";
import { LeaderboardUserDialog } from "./LeaderboardUserDialog";
import { UserAnalyticsDialog } from "./UserAnalyticsDialog";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type TaskCategory = Database["public"]["Enums"]["task_category"];

interface CategorySectionProps {
  category: TaskCategory;
}

const toMinutes = (category: string, duration: number): number => {
  if (category === "daily") return duration;
  if (category === "weekly") return duration * 24 * 60;
  return duration * 7 * 24 * 60;
};

const medals = ["🥇", "🥈", "🥉"];
const PAGE_SIZE = 10;

const EmptyState = ({ icon: Icon, title, hint }: { icon: React.ComponentType<{ className?: string }>; title: string; hint?: string }) => (
  <div className="rounded-2xl border border-dashed border-border py-12 text-center">
    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground/60">
      <Icon className="h-6 w-6" />
    </div>
    <p className="text-sm font-medium text-muted-foreground">{title}</p>
    {hint && <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>}
  </div>
);

export const CategorySection = ({ category }: CategorySectionProps) => {
  const { inProgressTasks, myCompletedTasks, allSuccessfulTasks, loadingAll } = useTasks();
  const { isAdmin } = useAdmin();
  const { user } = useAuth();
  const [selectedUser, setSelectedUser] = useState<{ userId: string; name: string } | null>(null);
  const [analyticsUser, setAnalyticsUser] = useState<{ userId: string; name: string } | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [dailyMode, setDailyMode] = useState<"today" | "longterm">("today");

  const catInProgress = inProgressTasks.filter((t) => t.category === category);
  const catCompleted = myCompletedTasks.filter((t) => t.category === category);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const catAllSuccessful = allSuccessfulTasks.filter((t) => {
    if (t.category !== category) return false;
    if (category === "daily" && dailyMode === "today") {
      // Use updated_at (set when task was completed) so tasks completed today count
      const completedAt = new Date((t as any).updated_at ?? t.created_at);
      return completedAt >= startOfToday;
    }
    return true;
  });

  const userStats = catAllSuccessful.reduce<
    Record<string, { name: string; totalMinutes: number; taskCount: number }>
  >((acc, task) => {
    const userId = task.user_id;
    const name = task.profiles?.display_name?.trim() || "مستخدم";
    if (!acc[userId]) acc[userId] = { name, totalMinutes: 0, taskCount: 0 };
    acc[userId].totalMinutes += toMinutes(task.category, task.duration);
    acc[userId].taskCount += 1;
    return acc;
  }, {});

  const sortedAll = Object.entries(userStats).sort(
    ([, a], [, b]) => b.totalMinutes - a.totalMinutes,
  );
  const visible = sortedAll.slice(0, visibleCount);
  const hasMore = visibleCount < sortedAll.length;

  return (
    <div className="space-y-5">
      <div data-tour="create-task">
        <CreateTaskForm fixedCategory={category} />
      </div>

      {/* المهام القادمة (الجدولة) */}
      <UpcomingTasks category={category} />

      {/* Personal analytics CTA */}
      <button
        type="button"
        onClick={() => setAnalyticsOpen(true)}
        data-tour="analytics"
        className="surface surface-hover group flex w-full items-center gap-3 p-3.5 text-start"
      >
        <span className="icon-tile h-10 w-10">
          <BarChart3 className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-foreground">تحليلاتي وإنجازاتي</span>
          <span className="block text-xs text-muted-foreground">ساعاتك، توزيع مهامك، وتقدمك مع الوقت</span>
        </span>
        <Sparkles className="h-4 w-4 text-primary transition-transform group-hover:scale-110" />
      </button>

      <Tabs defaultValue="in-progress">
        <TabsList className="w-full" data-tour="task-tabs">
          <TabsTrigger value="in-progress" className="flex-1 gap-1.5">
            <ListTodo className="h-4 w-4" />
            قيد الإنجاز
            <span className="rounded-full bg-primary/10 px-1.5 text-xs font-bold text-primary tabular-nums">
              {catInProgress.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="my-completed" className="flex-1 gap-1.5">
            <CheckCircle className="h-4 w-4" />
            منجزاتي
            <span className="rounded-full bg-primary/10 px-1.5 text-xs font-bold text-primary tabular-nums">
              {catCompleted.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in-progress" className="mt-4 space-y-3">
          {catInProgress.length === 0 ? (
            <EmptyState icon={ListTodo} title="لا توجد مهام قيد الإنجاز" hint="أضف مهمة جديدة لتبدأ!" />
          ) : (
            catInProgress.map((task) => <TaskCard key={task.id} task={task} showActions />)
          )}
        </TabsContent>

        <TabsContent value="my-completed" className="mt-4 space-y-3">
          {catCompleted.length === 0 ? (
            <EmptyState icon={CheckCircle} title="لم تنجز أي مهام بعد" hint="أكمل أول مهمة لتظهر هنا 🎉" />
          ) : (
            catCompleted.map((task) => <TaskCard key={task.id} task={task} />)
          )}
        </TabsContent>
      </Tabs>

      <div className="surface overflow-hidden p-5 sm:p-6" data-tour="leaderboard">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="icon-tile h-10 w-10">
              <Trophy className="h-5 w-5" />
            </span>
            <h3 className="text-base font-semibold text-foreground sm:text-lg">
              {category === "daily"
                ? dailyMode === "today"
                  ? "متصدرو اليوم"
                  : "المتصدرون (المدى الطويل)"
                : "قائمة المتصدرين"}
            </h3>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {sortedAll.length} مشارك
          </Badge>
        </div>

        {category === "daily" && (
          <div className="mb-4 inline-flex rounded-xl border border-border/70 bg-muted/50 p-1">
            <button
              type="button"
              onClick={() => {
                setDailyMode("today");
                setVisibleCount(PAGE_SIZE);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                dailyMode === "today"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Zap className="h-3.5 w-3.5" />
              اليوم
            </button>
            <button
              type="button"
              onClick={() => {
                setDailyMode("longterm");
                setVisibleCount(PAGE_SIZE);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                dailyMode === "longterm"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Flame className="h-3.5 w-3.5" />
              المدى الطويل
            </button>
          </div>
        )}

        {loadingAll ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : sortedAll.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">لا توجد إنجازات بعد</p>
        ) : (
          <>
            <div className="space-y-2.5">
              {visible.map(([userId, stats], index) => {
                const hours = Math.floor(stats.totalMinutes / 60);
                const mins = Math.round(stats.totalMinutes % 60);
                const isMe = userId === user?.id;
                const isTop3 = index < 3;
                const initial = stats.name.trim().charAt(0) || "؟";
                const value =
                  category === "daily"
                    ? { main: `${hours}:${String(mins).padStart(2, "0")}`, unit: "ساعة : دقيقة" }
                    : category === "weekly"
                      ? { main: String(Math.round((stats.totalMinutes / (24 * 60)) * 10) / 10), unit: "يوم" }
                      : { main: String(Math.round((stats.totalMinutes / (7 * 24 * 60)) * 10) / 10), unit: "أسبوع" };

                return (
                  <div
                    key={userId}
                    onClick={() => setSelectedUser({ userId, name: stats.name })}
                    className={cn(
                      "group flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-soft",
                      isMe
                        ? "border-primary/45 bg-primary/[0.07]"
                        : isTop3
                          ? "border-accent/40 bg-accent/[0.06]"
                          : "border-border/70 bg-background/40 hover:border-primary/25",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ring-1 ring-inset",
                        isTop3
                          ? "bg-accent/20 text-accent-foreground ring-accent/30"
                          : "bg-muted text-muted-foreground ring-border/60",
                      )}
                    >
                      {isTop3 ? medals[index] : index + 1}
                    </span>

                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        isTop3
                          ? "bg-gradient-to-br from-accent/35 to-primary/15 text-foreground ring-1 ring-inset ring-accent/30"
                          : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {initial}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {stats.name}
                        {isMe && <span className="ms-1.5 text-[11px] font-medium text-primary">(أنت)</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{stats.taskCount} مهمة منجزة</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <div className="text-end">
                        <p className="font-mono text-base font-bold leading-none tabular-nums text-primary">
                          {value.main}
                        </p>
                        <p className="mt-1 text-[10px] leading-none text-muted-foreground">{value.unit}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-lg opacity-70 transition group-hover:opacity-100"
                        title="التحليلات"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnalyticsUser({ userId, name: stats.name });
                        }}
                      >
                        <BarChart3 className="h-4 w-4 text-primary" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <Button
                variant="ghost"
                className="mt-4 w-full"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                عرض 10 إضافية ({sortedAll.length - visibleCount} متبقية)
              </Button>
            )}
          </>
        )}
      </div>

      {selectedUser && (
        <LeaderboardUserDialog
          open={!!selectedUser}
          onOpenChange={() => setSelectedUser(null)}
          userId={selectedUser.userId}
          userName={selectedUser.name}
        />
      )}

      {user && (
        <UserAnalyticsDialog
          open={analyticsOpen}
          onOpenChange={setAnalyticsOpen}
          userId={user.id}
          userName={`إنجازاتي - ${category === "daily" ? "يومي" : category === "weekly" ? "أسبوعي" : "شهري"}`}
          category={category}
        />
      )}
      {analyticsUser && (
        <UserAnalyticsDialog
          open={!!analyticsUser}
          onOpenChange={(o) => !o && setAnalyticsUser(null)}
          userId={analyticsUser.userId}
          userName={analyticsUser.name}
          category={category}
        />
      )}
    </div>
  );
};
