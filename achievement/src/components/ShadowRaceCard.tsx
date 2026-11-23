import { Ghost, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TaskLike = {
  duration: number;
  updated_at: string | null;
  created_at: string;
};

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function fmtMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h <= 0) return `${m} د`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function ShadowRaceCard({ tasks }: { tasks: TaskLike[] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { todayMinutes, bestDayMinutes, shadowMinutes, broke } = useMemo(() => {
    const nowDate = new Date(now);
    const startOfToday = new Date(nowDate);
    startOfToday.setHours(0, 0, 0, 0);
    const startToday = startOfToday.getTime();
    const startWindow = startToday - 30 * 24 * 60 * 60 * 1000;

    const byDay = new Map<string, number>();
    let todayTotal = 0;

    for (const t of tasks) {
      const ts = new Date(t.updated_at ?? t.created_at).getTime();
      if (ts < startWindow) continue;
      const mins = Number(t.duration) || 0;
      if (ts >= startToday) {
        todayTotal += mins;
      } else {
        const k = dayKey(ts);
        byDay.set(k, (byDay.get(k) || 0) + mins);
      }
    }

    let best = 0;
    for (const v of byDay.values()) if (v > best) best = v;

    // Shadow moves from 08:00 to 24:00 (16 hours)
    const shadowStart = new Date(startOfToday);
    shadowStart.setHours(8, 0, 0, 0);
    const shadowEnd = new Date(startOfToday);
    shadowEnd.setHours(24, 0, 0, 0);
    const totalWindow = shadowEnd.getTime() - shadowStart.getTime();
    const elapsed = Math.min(Math.max(now - shadowStart.getTime(), 0), totalWindow);
    const shadow = best > 0 ? Math.round((best * elapsed) / totalWindow) : 0;

    return {
      todayMinutes: Math.round(todayTotal),
      bestDayMinutes: Math.round(best),
      shadowMinutes: shadow,
      broke: best > 0 && todayTotal >= best,
    };
  }, [now, tasks]);

  if (bestDayMinutes <= 0) {
    return (
      <div className="mb-6 rounded-2xl border border-border/60 bg-card/40 px-4 py-3 animate-fade-up">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Ghost className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-semibold text-foreground">ظلّك الدراسي</p>
            <p className="text-[11px] text-muted-foreground">سجّل يوم قوي، وراح يظهر ظلك تتسابق معه هون.</p>
          </div>
        </div>
      </div>
    );
  }

  const maxBar = Math.max(bestDayMinutes, todayMinutes, 1);
  const youPct = Math.min(100, (todayMinutes / maxBar) * 100);
  const shadowPct = Math.min(100, (shadowMinutes / maxBar) * 100);
  const diff = shadowMinutes - todayMinutes;

  let status = "نفس الوتيرة تقريباً";
  if (broke) status = "عدّيت أفضل نسخة منك اليوم.";
  else if (diff > 0) status = diff <= 10 ? "عم تلحق بظلّك… كمّل!" : `ظلّك سابقك بـ ${diff} دقيقة… اللحاق ممكن`;
  else if (diff < 0) status = "أنت قدّام ظلك، حافظ على الوتيرة!";

  return (
    <div className="mb-6 rounded-2xl border border-border/60 bg-card/40 px-4 py-3 animate-fade-up">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${broke ? "bg-amber-500/15 text-amber-500" : "bg-primary/10 text-primary"}`}>
            {broke ? <Zap className="h-4 w-4" /> : <Ghost className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">{broke ? "كسرت ظلك اليوم" : "ظلّك الدراسي"}</p>
            <p className="text-[11px] text-muted-foreground truncate">{status}</p>
          </div>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">أفضل يوم: {fmtMinutes(bestDayMinutes)}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[11px] text-muted-foreground">أنت</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/50">
            <div className={`h-full rounded-full transition-all duration-700 ${broke ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${youPct}%` }} />
          </div>
          <span className="w-12 shrink-0 text-left font-mono text-[11px] tabular-nums text-foreground">{fmtMinutes(todayMinutes)}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[11px] text-muted-foreground">الظل</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/50">
            <div className="h-full rounded-full bg-muted-foreground/40 transition-all duration-700" style={{ width: `${shadowPct}%` }} />
          </div>
          <span className="w-12 shrink-0 text-left font-mono text-[11px] tabular-nums text-muted-foreground">{fmtMinutes(shadowMinutes)}</span>
        </div>
      </div>
    </div>
  );
}
