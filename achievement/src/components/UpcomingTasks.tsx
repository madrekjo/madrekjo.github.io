import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { CalendarClock, Play, Plus, Trash2, Loader2, AlarmClock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTasks } from "@/hooks/useTasks";
import { useScheduledTasks, type ScheduledTask } from "@/hooks/useScheduledTasks";
import type { Database } from "@/integrations/supabase/types";

type TaskCategory = Database["public"]["Enums"]["task_category"];

/** الشكل المبسّط الذي تعرضه البطاقة (يُستخدم أيضاً في صفحة المعاينة) */
export interface ScheduledViewItem {
  id: string;
  title: string;
  category: TaskCategory;
  duration: number;
  isStopwatch?: boolean;
  scheduledAt: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** صياغة عدد عربي صحيحة: 1 / 2 / 3-10 / 11+ */
const pluralize = (n: number, one: string, two: string, few: string, many: string) => {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** تسمية اليوم + الوقت + عدّاد نسبي لمهمة مجدولة */
export const getScheduleStatus = (iso: string, now: number) => {
  const target = new Date(iso);
  const diffMs = target.getTime() - now;
  const due = diffMs <= 0;
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dayLabel = sameDay(target, today)
    ? "اليوم"
    : sameDay(target, tomorrow)
      ? "غداً"
      : target.toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long" });

  const mins = Math.round(Math.abs(diffMs) / 60000);
  let relative: string;
  if (due) {
    relative = "الوقت حان — ابدأ الآن";
  } else if (mins < 1) {
    relative = "تبدأ الآن";
  } else if (mins < 60) {
    relative = `تبدأ بعد ${pluralize(mins, "دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة")}`;
  } else {
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hours < 24) {
      const hoursText = pluralize(hours, "ساعة واحدة", "ساعتين", "ساعات", "ساعة");
      relative = rem
        ? `تبدأ بعد ${hoursText} و${pluralize(rem, "دقيقة", "دقيقتين", "دقائق", "دقيقة")}`
        : `تبدأ بعد ${hoursText}`;
    } else {
      const days = Math.round(hours / 24);
      relative = `تبدأ بعد ${pluralize(days, "يوم واحد", "يومين", "أيام", "يوم")}`;
    }
  }

  return {
    due,
    dayLabel,
    relative,
    time: target.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }),
  };
};

const durationLabelFor = (category: TaskCategory) => {
  if (category === "weekly") return "المدة (أيام)";
  if (category === "monthly") return "المدة (أسابيع)";
  return "المدة";
};

const durationText = (item: ScheduledViewItem) => {
  if (item.isStopwatch) return "عدّاد توقيف";
  if (item.category === "daily") {
    const h = Math.floor(item.duration / 60);
    const m = item.duration % 60;
    if (h === 0) return pluralize(m, "دقيقة", "دقيقتين", "دقائق", "دقيقة");
    if (m === 0) return pluralize(h, "ساعة", "ساعتين", "ساعات", "ساعة");
    return `${h}:${pad(m)} ساعة`;
  }
  if (item.category === "weekly") return pluralize(item.duration, "يوم", "يومين", "أيام", "يوم");
  return pluralize(item.duration, "أسبوع", "أسبوعين", "أسابيع", "أسبوع");
};

/* ======================= عنصر مهمة مجدولة ======================= */

interface ScheduledTaskItemProps {
  item: ScheduledViewItem;
  now: number;
  starting?: boolean;
  onStart?: (item: ScheduledViewItem) => void;
  onRemove?: (item: ScheduledViewItem) => void;
}

export const ScheduledTaskItem = ({ item, now, starting, onStart, onRemove }: ScheduledTaskItemProps) => {
  const status = getScheduleStatus(item.scheduledAt, now);

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-2xl border px-3 py-4 transition-all sm:gap-4",
        status.due
          ? "border-primary/50 bg-primary/[0.07] shadow-soft"
          : "border-border/70 bg-background/50 hover:border-primary/25 hover:shadow-soft",
      )}
    >
      {/* الوقت */}
      <div className="flex w-16 shrink-0 flex-col items-center gap-1">
        <span
          className={cn(
            "rounded-xl px-2 py-1 font-mono text-sm font-bold tabular-nums ring-1 ring-inset",
            status.due
              ? "bg-primary text-primary-foreground ring-primary/30"
              : "bg-primary/10 text-primary ring-primary/15",
          )}
        >
          {status.time}
        </span>
        <span className="text-[10px] font-medium text-muted-foreground">{status.dayLabel}</span>
      </div>

      <span className={cn("h-10 w-px shrink-0", status.due ? "bg-primary/30" : "bg-border")} />

      {/* التفاصيل */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className={cn("font-medium", status.due && "text-primary")}>{status.relative}</span>
          <span className="text-border">•</span>
          <span>{durationText(item)}</span>
        </div>
      </div>

      {/* الإجراءات */}
      <div className="flex shrink-0 items-center gap-1.5">
        {onStart && (
          <Button
            size="sm"
            variant={status.due ? "default" : "outline"}
            className={cn("gap-1.5", status.due && "shadow-soft")}
            onClick={() => onStart(item)}
            disabled={starting}
          >
            {starting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : status.due ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <AlarmClock className="h-3.5 w-3.5" />
            )}
            ابدأ الآن
          </Button>
        )}
        {onRemove && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            title="حذف من الجدول"
            onClick={() => onRemove(item)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

/* ======================= بطاقة المهام القادمة ======================= */

interface UpcomingTasksCardProps {
  items: ScheduledViewItem[];
  now: number;
  loading?: boolean;
  needsSetup?: boolean;
  startingId?: string | null;
  onStart?: (item: ScheduledViewItem) => void;
  onRemove?: (item: ScheduledViewItem) => void;
  onScheduleClick?: () => void;
}

export const UpcomingTasksCard = ({
  items,
  now,
  loading,
  needsSetup,
  startingId,
  onStart,
  onRemove,
  onScheduleClick,
}: UpcomingTasksCardProps) => (
  <section className="surface overflow-hidden p-5 sm:p-6" data-tour="upcoming">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="icon-tile">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-foreground sm:text-lg">المهام القادمة</h3>
          <p className="text-xs text-muted-foreground">جدول مهمة وحدّد ساعة بدايتها — ولن تبدأ إلا بضغطتك</p>
        </div>
      </div>
      {onScheduleClick && (
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={onScheduleClick}>
          <Plus className="h-4 w-4" />
          جدولة مهمة
        </Button>
      )}
    </div>

    {needsSetup ? (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
        لتفعيل هذه الميزة نفّذ ملف SQL مرة واحدة:{" "}
        <span dir="ltr" className="font-mono">
          achievement/supabase/migrations/20261015120000_scheduled_tasks.sql
        </span>{" "}
        من Supabase → SQL Editor.
      </div>
    ) : loading ? (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    ) : items.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-border py-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground/60">
          <Sparkles className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">لا مهام قادمة بعد</p>
        <p className="mt-1 text-xs text-muted-foreground/80">حدّد مهمتك القادمة وساعة بدايتها لتبقى منظّماً</p>
      </div>
    ) : (
      <div className="space-y-2.5">
        {items.map((item) => (
          <ScheduledTaskItem
            key={item.id}
            item={item}
            now={now}
            starting={startingId === item.id}
            onStart={onStart}
            onRemove={onRemove}
          />
        ))}
      </div>
    )}
  </section>
);

/* ======================= نافذة الجدولة ======================= */

interface ScheduleTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: TaskCategory;
  onSubmit: (payload: { title: string; duration: number; scheduledAt: string }) => Promise<void> | void;
  pending?: boolean;
}

export const ScheduleTaskDialog = ({
  open,
  onOpenChange,
  category,
  onSubmit,
  pending,
}: ScheduleTaskDialogProps) => {
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState("1");
  const [minutes, setMinutes] = useState("0");
  const [amount, setAmount] = useState("1");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const resetToDefaultTime = () => {
    const next = new Date(Date.now() + 60 * 60 * 1000);
    next.setMinutes(next.getMinutes() < 30 ? 30 : 0);
    if (next.getMinutes() === 0) next.setHours(next.getHours() + 1);
    setDate(toDateInput(next));
    setTime(toTimeInput(next));
  };

  useEffect(() => {
    if (open) resetToDefaultTime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const applyQuick = (preset: "halfHour" | "oneHour" | "tomorrowMorning") => {
    const target = new Date();
    if (preset === "halfHour") target.setMinutes(target.getMinutes() + 30);
    if (preset === "oneHour") target.setHours(target.getHours() + 1);
    if (preset === "tomorrowMorning") {
      target.setDate(target.getDate() + 1);
      target.setHours(8, 0, 0, 0);
    }
    setDate(toDateInput(target));
    setTime(toTimeInput(target));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("اكتب اسم المهمة");
      return;
    }
    if (!date || !time) {
      toast.error("حدّد وقت البداية");
      return;
    }
    const scheduledAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(scheduledAt.getTime())) {
      toast.error("وقت غير صالح");
      return;
    }
    if (scheduledAt.getTime() < Date.now() - 60_000) {
      toast.error("اختر وقتاً في المستقبل");
      return;
    }

    let duration: number;
    if (category === "daily") {
      duration = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
      if (duration < 1 || duration > 300) {
        toast.error("المدة يجب أن تكون بين دقيقة و5 ساعات");
        return;
      }
    } else {
      duration = parseInt(amount) || 0;
      if (duration < 1) {
        toast.error("أدخل مدة صحيحة");
        return;
      }
    }

    try {
      await onSubmit({ title: title.trim(), duration, scheduledAt: scheduledAt.toISOString() });
    } catch {
      toast.error("تعذّر حفظ الجدولة، حاول مرة أخرى");
      return;
    }
    setTitle("");
    setHours("1");
    setMinutes("0");
    setAmount("1");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>جدولة مهمة قادمة</DialogTitle>
          <DialogDescription>
            حدّد المهمة ووقت بدايتها. لا يبدأ العدّاد تلقائياً — ستصلك ملاحظة عند وصول الوقت وأنت تبدأها.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="schedule-title">اسم المهمة</Label>
            <Input
              id="schedule-title"
              placeholder="مثال: مراجعة الفصل الثاني"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {category === "daily" ? (
            <div>
              <Label>{durationLabelFor(category)}</Label>
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <div className="flex flex-col items-center">
                  <Input
                    type="number"
                    min="0"
                    max="5"
                    value={hours}
                    onChange={(e) => {
                      const num = parseInt(e.target.value);
                      if (e.target.value === "" || Number.isNaN(num)) return setHours("");
                      if (num < 0 || num > 5) return;
                      setHours(String(num));
                      if (num === 5) setMinutes("0");
                    }}
                    className="h-14 w-20 text-center font-mono text-xl font-bold"
                  />
                  <span className="mt-1 text-xs text-muted-foreground">ساعة</span>
                </div>
                <span className="mb-4 text-2xl font-bold text-muted-foreground">:</span>
                <div className="flex flex-col items-center">
                  <Input
                    type="number"
                    min="0"
                    max={parseInt(hours) >= 5 ? 0 : 59}
                    value={minutes}
                    onChange={(e) => {
                      const num = parseInt(e.target.value);
                      if (e.target.value === "" || Number.isNaN(num)) return setMinutes("");
                      if (num < 0) return;
                      if (num >= 60) {
                        const extra = Math.floor(num / 60);
                        setHours(String(Math.min(5, (parseInt(hours) || 0) + extra)));
                        setMinutes(String(num % 60));
                      } else {
                        setMinutes(String(num));
                      }
                    }}
                    className="h-14 w-20 text-center font-mono text-xl font-bold"
                  />
                  <span className="mt-1 text-xs text-muted-foreground">دقيقة</span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="schedule-amount">{durationLabelFor(category)}</Label>
              <Input
                id="schedule-amount"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1.5"
              />
            </div>
          )}

          <div>
            <Label>وقت البداية</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="chip transition hover:border-primary/40 hover:text-foreground" onClick={() => applyQuick("halfHour")}>
                بعد ٣٠ دقيقة
              </button>
              <button type="button" className="chip transition hover:border-primary/40 hover:text-foreground" onClick={() => applyQuick("oneHour")}>
                بعد ساعة
              </button>
              <button type="button" className="chip transition hover:border-primary/40 hover:text-foreground" onClick={() => applyQuick("tomorrowMorning")}>
                غداً ٨ صباحاً
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            جدولة المهمة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ======================= الحاوية المتصلة بالبيانات ======================= */

interface UpcomingTasksProps {
  category: TaskCategory;
}

export const UpcomingTasks = ({ category }: UpcomingTasksProps) => {
  const { pending, isLoading, needsSetup, scheduleTask, removeScheduled, markScheduledStarted } = useScheduledTasks();
  const { createTask, inProgressTasks } = useTasks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(interval);
  }, []);

  const items: ScheduledViewItem[] = pending
    .filter((task: ScheduledTask) => task.category === category)
    .map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      duration: task.duration,
      isStopwatch: task.is_stopwatch,
      scheduledAt: task.scheduled_at,
    }));

  // تذكير لطيف عند وصول وقت مهمة (مرة واحدة لكل مهمة)
  useEffect(() => {
    items.forEach((item) => {
      const due = new Date(item.scheduledAt).getTime() <= Date.now();
      if (due && !notified.current.has(item.id)) {
        notified.current.add(item.id);
        toast.info(`حان وقت: ${item.title}`, {
          description: "اضغط «ابدأ الآن» لتشغيل العدّاد",
          duration: 10_000,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.id).join(",")]);

  const handleStart = async (item: ScheduledViewItem) => {
    const activeCount = inProgressTasks.filter((t) => t.category === item.category).length;
    const maxActive = item.category === "daily" ? 1 : 4;
    if (activeCount >= maxActive) {
      toast.error(
        item.category === "daily"
          ? "عندك مهمة قيد الإنجاز في القسم اليومي — أنهِها أولاً"
          : `وصلت الحد الأقصى (${maxActive}) من المهام قيد الإنجاز في هذا القسم`,
      );
      return;
    }

    try {
      setStartingId(item.id);
      await createTask.mutateAsync({
        title: item.title,
        category: item.category,
        duration: item.duration,
        isStopwatch: !!item.isStopwatch,
      });
      await markScheduledStarted.mutateAsync(item.id);
      toast.success("بدأت المهمة 🚀");
    } catch {
      toast.error("تعذّر بدء المهمة — تأكد من عدم وجود مهمة أخرى قيد الإنجاز");
    } finally {
      setStartingId(null);
    }
  };

  const handleRemove = async (item: ScheduledViewItem) => {
    try {
      await removeScheduled.mutateAsync(item.id);
      toast.success("تم حذفها من الجدول");
    } catch {
      toast.error("تعذّر الحذف");
    }
  };

  return (
    <>
      <UpcomingTasksCard
        items={items}
        now={now}
        loading={isLoading}
        needsSetup={needsSetup}
        startingId={startingId}
        onStart={handleStart}
        onRemove={handleRemove}
        onScheduleClick={() => setDialogOpen(true)}
      />

      <ScheduleTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={category}
        pending={scheduleTask.isPending}
        onSubmit={async ({ title, duration, scheduledAt }) => {
          await scheduleTask.mutateAsync({ title, category, duration, scheduledAt });
          toast.success("تمت جدولة المهمة ✅");
        }}
      />
    </>
  );
};
