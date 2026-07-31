import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Check, X, Clock, Calendar, CalendarDays, Pencil, Trash2, Divide, Flag, Pause, Play } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type TaskCategory = Database["public"]["Enums"]["task_category"];

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    category: TaskCategory;
    duration: number;
    daily_unit?: string;
    started_at: string;
    ends_at: string;
    completed: boolean;
    is_success: boolean | null;
    updated_at?: string;
    paused_at?: string | null;
    paused_total_ms?: number | null;
    is_stopwatch?: boolean | null;
    heartbeat_at?: string | null;
  };
  showActions?: boolean;
  showUser?: boolean;
  userName?: string;
  userAvatar?: string;
}


const categoryConfig = {
  daily: { label: "يومي", icon: Clock },
  weekly: { label: "أسبوعي", icon: Calendar },
  monthly: { label: "شهري", icon: CalendarDays },
};

/** Format minutes as H:MM for daily tasks */
const formatDailyDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
};

const getDurationDisplay = (task: { category: TaskCategory; duration: number }) => {
  if (task.category === "daily") return formatDailyDuration(task.duration);
  if (task.category === "weekly") return `${task.duration} يوم`;
  return `${task.duration} أسبوع`;
};

const formatCountdown = (totalSeconds: number) => {
  if (totalSeconds <= 0) return null;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");

  if (days > 0) {
    return { labels: ["يوم", "ساعة", "دقيقة", "ثانية"], parts: [String(days), pad(hours), pad(minutes), pad(seconds)] };
  }
  return { labels: ["ساعة", "دقيقة", "ثانية"], parts: [pad(hours), pad(minutes), pad(seconds)] };
};

/** Format elapsed time as readable string */
const formatElapsed = (startedAt: string, category: TaskCategory) => {
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  if (category === "daily") {
    const mins = Math.round(elapsed / 60);
    return formatDailyDuration(mins);
  }
  if (category === "weekly") {
    const days = Math.round((elapsed / 86400) * 10) / 10;
    return `${days} يوم`;
  }
  const weeks = Math.round((elapsed / (7 * 86400)) * 10) / 10;
  return `${weeks} أسبوع`;
};

export const TaskCard = ({ task, showActions = false, showUser = false, userName }: TaskCardProps) => {
  const { completeTask, editTask, deleteTask, pauseTask, resumeTask, heartbeat, catchUpOfflineGap } = useTasks();
  const isPaused = !!task.paused_at;
  const isStopwatch = !!task.is_stopwatch;
  const STOPWATCH_MAX_SECONDS = 300 * 60; // 5 hours

  const computeRemaining = () => {
    if (isPaused && task.paused_at) {
      // Frozen at paused moment
      return Math.max(0, (new Date(task.ends_at).getTime() - new Date(task.paused_at).getTime()) / 1000);
    }
    return Math.max(0, (new Date(task.ends_at).getTime() - Date.now()) / 1000);
  };

  /** Effective elapsed seconds for stopwatch, minus paused time. */
  const computeElapsed = () => {
    const pausedAcc = task.paused_total_ms ?? 0;
    const nowMs = isPaused && task.paused_at ? new Date(task.paused_at).getTime() : Date.now();
    const elapsedMs = nowMs - new Date(task.started_at).getTime() - pausedAcc;
    return Math.min(STOPWATCH_MAX_SECONDS, Math.max(0, elapsedMs / 1000));
  };

  const getInitialElapsed = () => {
    const initial = computeElapsed();
    return isStopwatch && !isPaused && (task.paused_total_ms ?? 0) === 0 && initial < 10 ? 0 : initial;
  };

  const [remaining, setRemaining] = useState(computeRemaining);
  const [elapsed, setElapsed] = useState(getInitialElapsed);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDuration, setEditDuration] = useState(String(task.duration));
  const [editTimerHours, setEditTimerHours] = useState(String(Math.floor(task.duration / 60)));
  const [editTimerMinutes, setEditTimerMinutes] = useState(String(task.duration % 60));

  useEffect(() => {
    if (task.completed) return;
    setRemaining(computeRemaining());
    setElapsed(getInitialElapsed());
    if (isPaused) return; // freeze when paused
    const interval = setInterval(() => {
      const diff = Math.max(0, (new Date(task.ends_at).getTime() - Date.now()) / 1000);
      setRemaining(diff);
      const pausedAcc = task.paused_total_ms ?? 0;
      const elapsedMs = Date.now() - new Date(task.started_at).getTime() - pausedAcc;
      const el = Math.min(STOPWATCH_MAX_SECONDS, Math.max(0, elapsedMs / 1000));
      setElapsed(el);
      if (isStopwatch && el >= STOPWATCH_MAX_SECONDS) clearInterval(interval);
      if (!isStopwatch && diff <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.ends_at, task.completed, isPaused, task.paused_at, isStopwatch, task.started_at, task.paused_total_ms]);

  /**
   * Stopwatch offline protection:
   *  - On mount, if the last heartbeat is stale by > 20s while task is unpaused,
   *    freeze it at the last heartbeat (offline gap does NOT count as study time).
   *  - Otherwise, send a heartbeat every 10s so we can detect the next gap.
   */
  useEffect(() => {
    if (!showActions || task.completed || !isStopwatch) return;
    if (isPaused) return;

    let cancelled = false;
    (async () => {
      const last = task.heartbeat_at ? new Date(task.heartbeat_at).getTime() : null;
      if (last && Date.now() - last > 20_000) {
        await catchUpOfflineGap({
          taskId: task.id,
          lastHeartbeat: task.heartbeat_at as string,
          endsAt: task.ends_at,
          pausedTotalMs: task.paused_total_ms ?? 0,
        });
        return;
      }
      if (!cancelled) await heartbeat(task.id);
    })();

    const hb = setInterval(() => { void heartbeat(task.id); }, 10_000);
    return () => { cancelled = true; clearInterval(hb); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, isStopwatch, isPaused, task.completed, showActions]);


  const handlePauseToggle = async () => {
    try {
      if (isPaused && task.paused_at) {
        await resumeTask.mutateAsync({
          taskId: task.id,
          pausedAt: task.paused_at,
          endsAt: task.ends_at,
          pausedTotalMs: task.paused_total_ms ?? 0,
        });
        toast.success("تم استئناف المؤقت ▶️");
      } else {
        await pauseTask.mutateAsync(task.id);
        toast.success("تم إيقاف المؤقت ⏸️");
      }
    } catch {
      toast.error("حدث خطأ");
    }
  };

  const timeExpired = remaining <= 0;
  const config = categoryConfig[task.category];
  const Icon = config.icon;
  const countdown = formatCountdown(remaining);

  const handleComplete = async (isSuccess: boolean) => {
    try {
      await completeTask.mutateAsync({ taskId: task.id, isSuccess });
      toast.success(isSuccess ? "مبروك! تم إنجاز المهمة 🎉" : "لا بأس، حاول مرة أخرى!");
    } catch {
      toast.error("حدث خطأ");
    }
  };

  const handleHalfComplete = async () => {
    try {
      await completeTask.mutateAsync({
        taskId: task.id,
        isSuccess: true,
        isHalf: true,
        originalDuration: task.duration,
      });
      const halfDuration = Math.max(1, Math.round(task.duration / 2));
      toast.success(`تم تسجيل نصف المهمة (${getDurationDisplay({ ...task, duration: halfDuration })}) 👏`);
    } catch {
      toast.error("حدث خطأ");
    }
  };

  const handleEarlyFinish = async () => {
    try {
      // Subtract all paused time (accumulated + currently-paused interval) from elapsed.
      const pausedAccumulated = task.paused_total_ms ?? 0;
      const currentPause = isPaused && task.paused_at
        ? Date.now() - new Date(task.paused_at).getTime()
        : 0;
      const rawElapsedMs = Date.now() - new Date(task.started_at).getTime();
      const effectiveElapsedMs = Math.max(0, rawElapsedMs - pausedAccumulated - currentPause);

      let elapsedUnit: number;
      if (task.category === "daily") {
        // Stopwatch caps at 5h; countdown caps at scheduled duration.
        const cap = isStopwatch ? 300 : task.duration;
        elapsedUnit = Math.min(cap, Math.round(effectiveElapsedMs / 60000));
      } else if (task.category === "weekly") {
        elapsedUnit = Math.round((effectiveElapsedMs / 86400000) * 10) / 10;
      } else {
        elapsedUnit = Math.round((effectiveElapsedMs / (7 * 86400000)) * 10) / 10;
      }
      elapsedUnit = Math.max(1, Math.round(elapsedUnit));


      await completeTask.mutateAsync({
        taskId: task.id,
        isSuccess: true,
        earlyFinish: true,
        elapsedMinutes: elapsedUnit,
      });
      toast.success(`تم إنهاء المهمة مبكراً (${formatDailyDuration(elapsedUnit)}) 🎉`);
    } catch {
      toast.error("حدث خطأ");
    }
  };


  const handleEdit = async () => {
    const titleChanged = editTitle.trim() !== task.title;
    let dur: number;
    let durationChanged: boolean;

    if (task.category === "daily") {
      dur = (parseInt(editTimerHours) || 0) * 60 + (parseInt(editTimerMinutes) || 0);
      durationChanged = dur !== task.duration;
      if (durationChanged && (dur < 1 || dur > 300)) {
        toast.error("المدة يجب أن تكون بين 1 دقيقة و 5 ساعات");
        return;
      }
    } else {
      dur = parseInt(editDuration);
      durationChanged = dur !== task.duration;
    }

    try {
      await editTask.mutateAsync({
        taskId: task.id,
        title: editTitle.trim(),
        duration: durationChanged ? dur : undefined,
        resetTimer: durationChanged,
      });
      setEditOpen(false);
      toast.success("تم تعديل المهمة بنجاح ✏️");
    } catch {
      toast.error("حدث خطأ أثناء التعديل");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTask.mutateAsync(task.id);
      toast.success("تم حذف المهمة 🗑️");
    } catch {
      toast.error("حدث خطأ أثناء الحذف");
    }
  };

  const getDurationLabel = () => {
    if (task.category === "daily") return "عدد الدقائق";
    if (task.category === "weekly") return "عدد الأيام";
    return "عدد الأسابيع";
  };

  return (
    <>
      <div className="rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {showUser && userName && (
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{userName}</span>
                {task.updated_at && (
                  <span className="text-muted-foreground/70">
                    {new Date(task.updated_at).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" })}
                    {" "}
                    {new Date(task.updated_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            )}
            <h4 className="font-medium text-foreground">{task.title}</h4>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Icon className="h-3 w-3" />
                {config.label}
              </Badge>
              {isStopwatch && !task.completed ? (
                <Badge variant="outline" className="gap-1">⏱️ عدّاد توقيف</Badge>
              ) : (
                <Badge variant="outline">{getDurationDisplay(task)}</Badge>
              )}
              {task.completed && task.is_success && (
                <Badge className="bg-success text-success-foreground">منجزة ✓</Badge>
              )}
            </div>

          </div>

          {showActions && !task.completed && (
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Timer (countdown or stopwatch) */}
        {!task.completed && (
          <div className="mt-3 border-t pt-3">
            {isStopwatch ? (
              (() => {
                const capReached = elapsed >= STOPWATCH_MAX_SECONDS;
                const hh = Math.floor(elapsed / 3600);
                const mm = Math.floor((elapsed % 3600) / 60);
                const ss = Math.floor(elapsed % 60);
                const pad = (n: number) => String(n).padStart(2, "0");
                return (
                  <div className="flex flex-col items-center gap-2">
                    {isPaused && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                        ⏸ موقوف مؤقتاً
                      </span>
                    )}
                    {capReached && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                        وصلت الحد الأقصى (5 ساعات)
                      </span>
                    )}
                    <div className={`flex items-center justify-center gap-1 ${isPaused ? "opacity-60" : ""}`}>
                      {[pad(hh), pad(mm), pad(ss)].map((part, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <div className="flex flex-col items-center">
                            <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-lg font-bold text-primary tabular-nums">
                              {part}
                            </span>
                            <span className="mt-0.5 text-[10px] text-muted-foreground">
                              {["ساعة", "دقيقة", "ثانية"][i]}
                            </span>
                          </div>
                          {i < 2 && <span className="mb-3 text-lg font-bold text-muted-foreground">:</span>}
                        </div>
                      ))}
                    </div>
                    {showActions && (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {!capReached && (
                          <Button
                            size="sm"
                            variant={isPaused ? "default" : "secondary"}
                            className="gap-1.5 text-xs"
                            onClick={handlePauseToggle}
                            disabled={pauseTask.isPending || resumeTask.isPending}
                          >
                            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                            {isPaused ? "استئناف" : "إيقاف مؤقت"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={handleEarlyFinish}
                          disabled={completeTask.isPending || elapsed < 60}
                        >
                          <Flag className="h-3.5 w-3.5" />
                          إنهاء وتسجيل الوقت
                        </Button>
                      </div>
                    )}
                    {elapsed < 60 && !capReached && (
                      <p className="text-[10px] text-muted-foreground">يجب مرور دقيقة على الأقل قبل الإنهاء</p>
                    )}
                  </div>
                );
              })()
            ) : timeExpired ? (
              <p className="text-center text-sm font-semibold text-destructive">⏰ انتهى الوقت!</p>
            ) : countdown && (
              <div className="flex flex-col items-center gap-2">
                {isPaused && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    ⏸ موقوف مؤقتاً
                  </span>
                )}
                <div className={`flex items-center justify-center gap-1 ${isPaused ? "opacity-60" : ""}`}>
                  {countdown.parts.map((part, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="flex flex-col items-center">
                        <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-lg font-bold text-primary tabular-nums">
                          {part}
                        </span>
                        <span className="mt-0.5 text-[10px] text-muted-foreground">{countdown.labels[i]}</span>
                      </div>
                      {i < countdown.parts.length - 1 && (
                        <span className="mb-3 text-lg font-bold text-muted-foreground">:</span>
                      )}
                    </div>
                  ))}
                </div>
                {/* Action buttons */}
                {showActions && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant={isPaused ? "default" : "secondary"}
                      className="gap-1.5 text-xs"
                      onClick={handlePauseToggle}
                      disabled={pauseTask.isPending || resumeTask.isPending}
                    >
                      {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      {isPaused ? "استئناف" : "إيقاف مؤقت"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={handleEarlyFinish}
                      disabled={completeTask.isPending}
                    >
                      <Flag className="h-3.5 w-3.5" />
                      إنهاء المهمة الآن
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showActions && !task.completed && !isStopwatch && timeExpired && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <p className="w-full text-sm text-muted-foreground mb-1">هل أتممت المهمة؟</p>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handleComplete(true)}>
              <Check className="h-4 w-4" />
              نعم
            </Button>
            <Button size="sm" variant="secondary" className="gap-1" onClick={handleHalfComplete}>
              <Divide className="h-4 w-4" />
              نصف المهمة
            </Button>
            <Button size="sm" variant="ghost" className="gap-1" onClick={() => handleComplete(false)}>
              <X className="h-4 w-4" />
              لا
            </Button>
          </div>
        )}
      </div>



      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل المهمة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-title">اسم المهمة</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1"
              />
            </div>
            {task.category === "daily" ? (
              <div>
                <Label>المدة</Label>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <div className="flex flex-col items-center">
                    <Input
                      type="number"
                      min="0"
                      max="5"
                      value={editTimerHours}
                      onChange={(e) => {
                        const num = parseInt(e.target.value);
                        if (e.target.value === "" || isNaN(num)) { setEditTimerHours(""); return; }
                        if (num < 0 || num > 5) return;
                        setEditTimerHours(String(num));
                        if (num === 5) setEditTimerMinutes("0");
                      }}
                      className="w-20 text-center text-2xl font-mono font-bold h-14"
                    />
                    <span className="mt-1 text-xs text-muted-foreground">ساعة</span>
                  </div>
                  <span className="text-3xl font-bold text-muted-foreground mb-4">:</span>
                  <div className="flex flex-col items-center">
                    <Input
                      type="number"
                      min="0"
                      max={parseInt(editTimerHours) >= 5 ? 0 : 59}
                      value={editTimerMinutes}
                      onChange={(e) => {
                        const num = parseInt(e.target.value);
                        if (e.target.value === "" || isNaN(num)) { setEditTimerMinutes(""); return; }
                        if (num < 0) return;
                        if (num >= 60) {
                          const extraH = Math.floor(num / 60);
                          const remM = num % 60;
                          const newH = Math.min(5, (parseInt(editTimerHours) || 0) + extraH);
                          setEditTimerHours(String(newH));
                          setEditTimerMinutes(String(remM));
                        } else {
                          setEditTimerMinutes(String(num));
                        }
                      }}
                      className="w-20 text-center text-2xl font-mono font-bold h-14"
                    />
                    <span className="mt-1 text-xs text-muted-foreground">دقيقة</span>
                  </div>
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">الحد الأقصى: 5 ساعات</p>
              </div>
            ) : (
              <div>
                <Label htmlFor="edit-duration">{getDurationLabel()}</Label>
                <Input
                  id="edit-duration"
                  type="number"
                  min="1"
                  value={editDuration}
                  onChange={(e) => setEditDuration(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={editTask.isPending}>
              {editTask.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>هل أنت متأكد من حذف المهمة؟</DialogTitle>
            <DialogDescription>
              سيتم حذف المهمة "{task.title}" نهائياً ولا يمكن التراجع عن ذلك.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => { setDeleteOpen(false); handleDelete(); }}>
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
