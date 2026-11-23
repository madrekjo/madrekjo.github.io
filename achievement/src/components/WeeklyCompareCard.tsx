import { ArrowDownLeft, ArrowUpLeft, Minus, CalendarClock } from "lucide-react";

type TaskLike = {
  duration: number;
  updated_at: string | null;
  created_at: string;
  is_success?: boolean | null;
  completed?: boolean | null;
};

function minutesBetween(tasks: TaskLike[], from: number, to: number) {
  let minutes = 0;
  let count = 0;
  for (const t of tasks) {
    const ts = new Date(t.updated_at ?? t.created_at).getTime();
    if (ts >= from && ts < to) {
      minutes += Number(t.duration) || 0;
      count += 1;
    }
  }
  return { minutes, count };
}

function fmtMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h <= 0) return `${m} د`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function WeeklyCompareCard({ tasks }: { tasks: TaskLike[] }) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const thisFrom = now - 7 * day;
  const prevFrom = now - 14 * day;

  const curr = minutesBetween(tasks, thisFrom, now);
  const prev = minutesBetween(tasks, prevFrom, thisFrom);

  const diff = curr.minutes - prev.minutes;
  const pct = prev.minutes > 0 ? Math.round((diff / prev.minutes) * 100) : curr.minutes > 0 ? 100 : 0;

  let tone = "text-muted-foreground";
  let Icon = Minus;
  let msg = "نفس الوتيرة تقريباً";
  if (diff > 0) {
    tone = "text-emerald-600 dark:text-emerald-400";
    Icon = ArrowUpLeft;
    msg = prev.minutes > 0 ? `أفضل من الأسبوع الماضي بـ ${Math.abs(pct)}%` : "بداية قوية هذا الأسبوع";
  } else if (diff < 0) {
    tone = "text-amber-600 dark:text-amber-400";
    Icon = ArrowDownLeft;
    msg = prev.minutes > 0 ? `أقل من الأسبوع الماضي بـ ${Math.abs(pct)}%` : "هاد الأسبوع أهدى";
  }

  return (
    <div className="mb-6 rounded-2xl border border-border/60 bg-card/40 px-4 py-3 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarClock className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">أنت قبل أسبوع vs الآن</p>
            <p className={`text-[11px] ${tone} flex items-center gap-1`}>
              <Icon className="h-3.5 w-3.5" />
              <span className="truncate">{msg}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-left shrink-0">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">الأسبوع الماضي</p>
            <p className="font-mono text-sm font-bold tabular-nums text-foreground">{fmtMinutes(prev.minutes)}</p>
            <p className="text-[10px] text-muted-foreground">{prev.count} مهمة</p>
          </div>
          <div className="h-8 w-px bg-border/60" />
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">آخر 7 أيام</p>
            <p className="font-mono text-sm font-bold tabular-nums text-foreground">{fmtMinutes(curr.minutes)}</p>
            <p className="text-[10px] text-muted-foreground">{curr.count} مهمة</p>
          </div>
        </div>
      </div>
    </div>
  );
}
