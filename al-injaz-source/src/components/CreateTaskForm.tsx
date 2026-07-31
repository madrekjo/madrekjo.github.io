import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useTasks } from "@/hooks/useTasks";
import { toast } from "sonner";
import { Send, Timer, TimerReset } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type TaskCategory = Database["public"]["Enums"]["task_category"];

interface CreateTaskFormProps {
  fixedCategory?: TaskCategory;
}


export const CreateTaskForm = ({ fixedCategory }: CreateTaskFormProps) => {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  // Timer-style inputs for daily
  const [timerHours, setTimerHours] = useState("0");
  const [timerMinutes, setTimerMinutes] = useState("0");
  const [mode, setMode] = useState<"countdown" | "stopwatch">("countdown");
  const { createTask, inProgressTasks } = useTasks();

  const activeCategory = fixedCategory ?? "daily";
  const activeCountInCategory = inProgressTasks.filter((t) => t.category === activeCategory).length;
  const maxActive = activeCategory === "daily" ? 1 : 4;
  const limitReached = activeCountInCategory >= maxActive;

  const getDurationLabel = () => {
    if (activeCategory === "weekly") return "عدد الأيام";
    return "عدد الأسابيع";
  };

  const getTotalDailyMinutes = () => {
    return (parseInt(timerHours) || 0) * 60 + (parseInt(timerMinutes) || 0);
  };

  const handleMinutesChange = (val: string) => {
    const num = parseInt(val);
    if (val === "" || isNaN(num)) {
      setTimerMinutes("");
      return;
    }
    if (num < 0) return;
    if (num >= 60) {
      // Roll over to hours
      const extraHours = Math.floor(num / 60);
      const remainingMins = num % 60;
      const newHours = Math.min(5, (parseInt(timerHours) || 0) + extraHours);
      setTimerHours(String(newHours));
      setTimerMinutes(String(remainingMins));
    } else {
      setTimerMinutes(String(num));
    }
  };

  const handleHoursChange = (val: string) => {
    const num = parseInt(val);
    if (val === "" || isNaN(num)) {
      setTimerHours("");
      return;
    }
    if (num < 0 || num > 5) return;
    setTimerHours(String(num));
    // If 5 hours, cap minutes at 0
    if (num === 5) setTimerMinutes("0");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (limitReached) {
      toast.error(
        activeCategory === "daily"
          ? "لديك مهمة قيد الإنجاز في القسم اليومي. أنهِها أولاً قبل بدء مهمة جديدة"
          : `وصلت للحد الأقصى (${maxActive}) من المهام قيد الإنجاز في هذا القسم`
      );
      return;
    }
    let dur: number;
    const isStopwatch = activeCategory === "daily" && mode === "stopwatch";
    if (activeCategory === "daily") {
      if (isStopwatch) {
        dur = 0;
      } else {
        dur = getTotalDailyMinutes();
        if (dur < 1 || dur > 300) {
          toast.error("المدة يجب أن تكون بين 1 دقيقة و 5 ساعات");
          return;
        }
      }
    } else {
      dur = parseInt(duration);
      if (!dur || dur < 1) {
        toast.error("أدخل مدة صحيحة");
        return;
      }
    }

    try {
      await createTask.mutateAsync({
        title: title.trim(),
        category: activeCategory,
        duration: dur,
        isStopwatch,
      });
      setTitle("");
      setDuration("");
      setTimerHours("0");
      setTimerMinutes("0");
      toast.success(isStopwatch ? "بدأ عداد التوقيف! ⏱️" : "تم إنشاء المهمة بنجاح! 🏆");
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "خطأ غير معروف";
      toast.error("حدث خطأ: " + msg);
      console.error("createTask error:", e);
    }
  };


  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-foreground">أضف مهمة جديدة</h3>

      {limitReached && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          {activeCategory === "daily"
            ? "⚠️ عندك مهمة قيد الإنجاز في القسم اليومي. أنهِها أولاً قبل ما تبدأ مهمة جديدة."
            : `⚠️ وصلت للحد الأقصى (${maxActive}) من المهام قيد الإنجاز في هذا القسم. أنهِ واحدة قبل ما تبدأ غيرها.`}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <Label htmlFor="title">ماذا ستنجز؟</Label>
          <Input
            id="title"
            placeholder="مثال: دراسة مادة التاريخ"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1"
          />
        </div>

        {activeCategory === "daily" ? (
          <div className="space-y-3">
            <div>
              <Label>نوع العدّاد</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("countdown")}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-sm font-medium transition ${
                    mode === "countdown"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <TimerReset className="h-4 w-4" />
                  عدّاد تنازلي
                </button>
                <button
                  type="button"
                  onClick={() => setMode("stopwatch")}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-sm font-medium transition ${
                    mode === "stopwatch"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Timer className="h-4 w-4" />
                  عدّاد توقيف
                </button>
              </div>
            </div>

            {mode === "countdown" ? (
              <div>
                <Label>المدة</Label>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <div className="flex flex-col items-center">
                    <Input
                      type="number"
                      min="0"
                      max="5"
                      value={timerHours}
                      onChange={(e) => handleHoursChange(e.target.value)}
                      className="w-20 text-center text-2xl font-mono font-bold h-14"
                    />
                    <span className="mt-1 text-xs text-muted-foreground">ساعة</span>
                  </div>
                  <span className="text-3xl font-bold text-muted-foreground mb-4">:</span>
                  <div className="flex flex-col items-center">
                    <Input
                      type="number"
                      min="0"
                      max={parseInt(timerHours) >= 5 ? 0 : 59}
                      value={timerMinutes}
                      onChange={(e) => handleMinutesChange(e.target.value)}
                      className="w-20 text-center text-2xl font-mono font-bold h-14"
                    />
                    <span className="mt-1 text-xs text-muted-foreground">دقيقة</span>
                  </div>
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  الحد الأقصى: 5 ساعات (300 دقيقة)
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-center text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">⏱️ عدّاد توقيف</p>
                <p>ابدأ العدّاد وأنهِه متى شئت. يتوقف تلقائياً عند الخروج من الموقع ويكمل عند العودة. الحد الأقصى: 5 ساعات.</p>
              </div>
            )}
          </div>

        ) : (
          <div>
            <Label htmlFor="duration">{getDurationLabel()}</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              placeholder="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="mt-1"
            />
          </div>
        )}

        <Button type="submit" className="w-full gap-2" disabled={createTask.isPending || limitReached}>
          <Send className="h-4 w-4" />
          {createTask.isPending ? "جاري الإنشاء..." : "أنشئ المهمة"}
        </Button>
      </div>
    </form>
  );
};
