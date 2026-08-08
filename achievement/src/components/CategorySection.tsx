import { useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { CreateTaskForm } from "./CreateTaskForm";
import { TaskCard } from "./TaskCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Trophy, Loader2, ListTodo, CheckCircle, BarChart3 } from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";
import { LeaderboardUserDialog } from "./LeaderboardUserDialog";
import { UserAnalyticsDialog } from "./UserAnalyticsDialog";
import { useAuth } from "@/hooks/useAuth";
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
    <div className="space-y-6">
      <div data-tour="create-task">
        <CreateTaskForm fixedCategory={category} />
      </div>

      {/* Personal analytics CTA */}
      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => setAnalyticsOpen(true)}
        data-tour="analytics"
      >
        <BarChart3 className="h-4 w-4" />
        تحليلاتي وإنجازاتي
      </Button>

      <Tabs defaultValue="in-progress">
        <TabsList className="w-full" data-tour="task-tabs">
          <TabsTrigger value="in-progress" className="flex-1 gap-1">
            <ListTodo className="h-4 w-4" />
            قيد الإنجاز ({catInProgress.length})
          </TabsTrigger>
          <TabsTrigger value="my-completed" className="flex-1 gap-1">
            <CheckCircle className="h-4 w-4" />
            منجزاتي ({catCompleted.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in-progress" className="mt-4 space-y-3">
          {catInProgress.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <ListTodo className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-2 text-muted-foreground">لا توجد مهام قيد الإنجاز</p>
              <p className="text-sm text-muted-foreground">أضف مهمة جديدة لتبدأ!</p>
            </div>
          ) : (
            catInProgress.map((task) => <TaskCard key={task.id} task={task} showActions />)
          )}
        </TabsContent>

        <TabsContent value="my-completed" className="mt-4 space-y-3">
          {catCompleted.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <CheckCircle className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-2 text-muted-foreground">لم تنجز أي مهام بعد</p>
            </div>
          ) : (
            catCompleted.map((task) => <TaskCard key={task.id} task={task} />)
          )}
        </TabsContent>
      </Tabs>

      <div className="rounded-xl border bg-card p-5 shadow-sm" data-tour="leaderboard">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              {category === "daily"
                ? dailyMode === "today"
                  ? "⚡ متصدرو اليوم"
                  : "🔥 المتصدرون (المدى الطويل)"
                : "قائمة المتصدرين"}
            </h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {sortedAll.length} مشارك
          </Badge>
        </div>

        {category === "daily" && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={dailyMode === "today" ? "default" : "outline"}
              onClick={() => {
                setDailyMode("today");
                setVisibleCount(PAGE_SIZE);
              }}
            >
              ⚡ اليوم
            </Button>
            <Button
              size="sm"
              variant={dailyMode === "longterm" ? "default" : "outline"}
              onClick={() => {
                setDailyMode("longterm");
                setVisibleCount(PAGE_SIZE);
              }}
            >
              🔥 المدى الطويل
            </Button>
          </div>
        )}

        {loadingAll ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : sortedAll.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد إنجازات بعد</p>
        ) : (
          <>
            <div className="space-y-2">
              {visible.map(([userId, stats], index) => {
                const hours = Math.floor(stats.totalMinutes / 60);
                const mins = Math.round(stats.totalMinutes % 60);
                const isMe = userId === user?.id;

                return (
                  <div
                    key={userId}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer ${isMe ? "border-primary/40 bg-primary/5" : ""}`}
                    onClick={() => setSelectedUser({ userId, name: stats.name })}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-lg font-bold text-secondary-foreground">
                        {index < 3 ? medals[index] : index + 1}
                      </span>
                      <div>
                        <span className="font-medium text-foreground">
                          {stats.name}
                          {isMe && <span className="ms-1 text-xs text-primary">(أنت)</span>}
                        </span>
                        <p className="text-xs text-muted-foreground">{stats.taskCount} مهمة منجزة</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {category === "daily" ? (
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-center">
                            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-lg font-bold text-primary tabular-nums">
                              {hours}
                            </span>
                            <span className="text-[10px] text-muted-foreground">ساعة</span>
                          </div>
                          <span className="text-lg font-bold text-muted-foreground mb-3">:</span>
                          <div className="flex flex-col items-center">
                            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-lg font-bold text-primary tabular-nums">
                              {String(mins).padStart(2, "0")}
                            </span>
                            <span className="text-[10px] text-muted-foreground">دقيقة</span>
                          </div>
                        </div>
                      ) : (
                        <Badge variant="secondary" className="text-sm font-semibold">
                          {category === "weekly"
                            ? `${Math.round((stats.totalMinutes / (24 * 60)) * 10) / 10} يوم`
                            : `${Math.round((stats.totalMinutes / (7 * 24 * 60)) * 10) / 10} أسبوع`}
                        </Badge>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
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
