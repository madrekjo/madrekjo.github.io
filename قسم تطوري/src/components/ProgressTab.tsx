import { useMemo } from "react";
import {
  Sun,
  CloudSun,
  Flame,
  Award,
  Crown,
  HeartPulse,
  BatteryCharging,
  Trophy,
  CircleAlert,
  Sparkles,
  BookOpen,
} from "lucide-react";
import type { Achievement, DayPoint, HabitLog } from "@/data";
import { TrendLine, MonthHeatMap, StatTile } from "@/lib/charts";
import {
  ARABIC_DAY,
  commitmentAvg,
  fromKey,
  monthLabel,
  monthStart,
  toKey,
  weekAvg,
  todayKey,
} from "@/lib/weeks";

function HorizontalBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[10px] font-bold text-ink-soft">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-night-soft">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="w-8 shrink-0 text-end text-[10px] font-black text-ink">{Math.round(value)}</span>
    </div>
  );
}

export default function ProgressTab({
  weekPoints,
  prevWeekPoints,
  monthPoints,
  last30Points,
  achievements,
  habitLogs,
}: {
  weekPoints: DayPoint[];
  prevWeekPoints: DayPoint[];
  monthPoints: DayPoint[];
  last30Points: DayPoint[];
  achievements: Achievement[];
  habitLogs: HabitLog[];
  me: { streak: number };
}) {
  const today = todayKey();
  const monthStartKey = toKey(monthStart(new Date()));

  const weekScore = weekAvg(weekPoints);
  const prevScore = weekAvg(prevWeekPoints);
  const delta = weekScore - prevScore;
  const weekCommit = commitmentAvg(weekPoints);
  const activeDays = weekPoints.filter((p) => p.active).length;

  const best = useMemo(() => {
    const active = weekPoints.filter((p) => p.active);
    if (!active.length) return null;
    const sorted = [...active].sort((a, b) => b.score - a.score);
    return { best: sorted[0], worst: sorted[sorted.length - 1] };
  }, [weekPoints]);

  const weekAchievements = useMemo(() => {
    const first = weekPoints.length ? weekPoints[0].day : "";
    if (!first) return [];
    const last = weekPoints[weekPoints.length - 1].day;
    return achievements.filter((a) => a.day >= first && a.day <= last);
  }, [achievements, weekPoints]);

  const weekCategories = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of weekAchievements) m.set(a.category, (m.get(a.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [weekAchievements]);

  // ---------- التحليل الذكي (آخر 30 يوم) ----------
  const weekdayProductivity = useMemo(() => {
    const byDay = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
    for (const p of last30Points) {
      if (!p.active) continue;
      const wd = fromKey(p.day).getDay();
      byDay[wd].sum += p.score;
      byDay[wd].count += 1;
    }
    return byDay.map((b) => (b.count ? Math.round(b.sum / b.count) : 0));
  }, [last30Points]);

  const topWeekday = useMemo(() => {
    let idx = -1;
    let val = -1;
    weekdayProductivity.forEach((v, i) => {
      if (v > val) {
        val = v;
        idx = i;
      }
    });
    return { idx, val };
  }, [weekdayProductivity]);

  const habitCommit = useMemo(() => {
    const m = new Map<string, { done: number; total: number; name: string; icon: string }>();
    for (const l of habitLogs) {
      const cur = m.get(l.habit_id) ?? { done: 0, total: 0, name: l.name, icon: l.icon };
      cur.total += 1;
      if (l.done) cur.done += 1;
      m.set(l.habit_id, cur);
    }
    return [...m.entries()]
      .map(([id, v]) => ({ id, name: v.name, icon: v.icon, pct: Math.round((v.done / v.total) * 100) }))
      .sort((a, b) => b.pct - a.pct);
  }, [habitLogs]);

  const energyRelation = useMemo(() => {
    let highSum = 0,
      highCount = 0,
      lowSum = 0,
      lowCount = 0;
    for (const p of last30Points) {
      if (!p.active || p.energy === 0) continue;
      if (p.energy >= 7) {
        highSum += p.achievement_count;
        highCount += 1;
      } else if (p.energy <= 4) {
        lowSum += p.achievement_count;
        lowCount += 1;
      }
    }
    return {
      high: highCount ? highSum / highCount : 0,
      low: lowCount ? lowSum / lowCount : 0,
    };
  }, [last30Points]);

  const moodRelation = useMemo(() => {
    let goodSum = 0,
      goodCount = 0,
      lowSum = 0,
      lowCount = 0;
    for (const p of last30Points) {
      if (!p.active || p.mood === 0) continue;
      if (p.mood >= 7) {
        goodSum += p.achievement_count;
        goodCount += 1;
      } else if (p.mood <= 4) {
        lowSum += p.achievement_count;
        lowCount += 1;
      }
    }
    return {
      good: goodCount ? goodSum / goodCount : 0,
      low: lowCount ? lowSum / lowCount : 0,
    };
  }, [last30Points]);

  const monthAvg = weekAvg(monthPoints);
  const monthAchievements = useMemo(
    () => achievements.filter((a) => a.day >= monthStartKey && a.day <= today).length,
    [achievements, monthStartKey, today]
  );
  const monthCommit = commitmentAvg(monthPoints);

  const bestDayName = best ? `${ARABIC_DAY[fromKey(best.best.day).getDay()]} (${best.best.score})` : "—";
  const worstDayName = best ? `${ARABIC_DAY[fromKey(best.worst.day).getDay()]} (${best.worst.score})` : "—";

  return (
    <div className="fade-up space-y-4">
      <h1 className="font-display text-xl font-black">تقدمك بالأرقام</h1>

      {/* التقرير الأسبوعي */}
      <section className="glass p-4">
        <div className="mb-2 flex items-center gap-2">
          <Crown size={16} className="text-sun" />
          <span className="text-xs font-extrabold text-ink-soft">تقرير هذا الأسبوع</span>
        </div>
        <div className="mb-3 flex items-center gap-3">
          <div className="flex-1 text-center">
            <div className="font-display text-4xl font-black grad-text">{weekScore}</div>
            <div className="text-[10px] font-bold text-ink-soft">مؤشر الأسبوع</div>
          </div>
          <div
            className={"flex flex-col items-center rounded-xl border px-4 py-2 " + (delta >= 0 ? "border-growth/30" : "border-rose/30")}
          >
            <span className={"font-display text-2xl font-black " + (delta >= 0 ? "text-growth" : "text-rose")}>
              {delta >= 0 ? "+" : ""}{delta}
            </span>
            <span className="text-[10px] font-bold text-ink-soft">قبل السابق ({prevScore})</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StatTile icon={<Award size={16} />} label="أفضل يوم" value={bestDayName} color="var(--color-growth)" />
          <StatTile icon={<CircleAlert size={16} />} label="أضعف يوم" value={worstDayName} color="var(--color-rose)" />
          <StatTile icon={<Flame size={16} />} label="أيام نشطة" value={`${activeDays} من 7`} color="var(--color-sun)" />
          <StatTile icon={<Trophy size={16} />} label="إنجازات مكتملة" value={String(weekAchievements.length)} color="var(--color-vib)" />
        </div>

        {weekCategories.length >= 1 && (
          <div className="mt-3">
            <div className="mb-2 text-[11px] font-extrabold text-ink-soft">توزيع إنجازاتك</div>
            <div className="space-y-1.5">
              {weekCategories.map(([cat, n]) => (
                <HorizontalBar key={cat} label={cat} value={(n / weekAchievements.length) * 100} color="var(--color-glow)" />
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-night-soft/50 px-3 py-2 text-[11px] font-bold text-ink-soft">
          <span>التزام العادات</span>
          <span className="font-display text-sm font-black text-growth">{weekCommit}%</span>
        </div>
      </section>

      {/* التقرير الشهري */}
      <section className="glass p-4">
        <div className="mb-2 flex items-center gap-2">
          <BookOpen size={16} className="text-glow" />
          <span className="text-xs font-extrabold text-ink-soft">تقرير {monthLabel(new Date())}</span>
        </div>
        <TrendLine points={monthPoints} />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatTile icon={<Sparkles size={16} />} label="متوسط اليوم" value={String(monthAvg)} color="var(--color-growth)" />
          <StatTile icon={<Trophy size={16} />} label="إنجازات" value={String(monthAchievements)} color="var(--color-vib)" />
          <StatTile icon={<HeartPulse size={16} />} label="التزام" value={`${monthCommit}%`} color="var(--color-rose)" />
        </div>
        <div className="mt-3">
          <div className="mb-2 text-[11px] font-extrabold text-ink-soft">خريطة الشهر حرارية</div>
          <MonthHeatMap points={monthPoints} monthStart={monthStartKey} />
        </div>
      </section>

      {/* التحليل الذكي */}
      <section className="glass p-4">
        <div className="mb-2 flex items-center gap-2">
          <BatteryCharging size={16} className="text-vib" />
          <span className="text-xs font-extrabold text-ink-soft">تحليلك الذكي (آخر 30 يوم)</span>
        </div>

        <div className="mb-3 rounded-xl border border-line bg-night-soft/50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11px] font-bold text-ink-soft">
            <Sun size={14} className="text-sun" />
            {topWeekday.idx >= 0 ? (
              <span>
                يومك الأكثر إنتاجية في الأسبوع: <span className="text-ink">{ARABIC_DAY[topWeekday.idx]}</span>
                (متوسط {topWeekday.val})
              </span>
            ) : (
              <span>سجّل أياماً نشطة لتظهر لك أكثر أيامك إنتاجية</span>
            )}
          </div>
          <div className="mt-2.5 space-y-1.5">
            {weekdayProductivity.map((v, i) => (
              <HorizontalBar key={i} label={ARABIC_DAY[i].slice(0, 3) + "."} value={v} color="var(--color-glow)" />
            ))}
          </div>
        </div>

        {habitCommit.length > 0 && (
          <div className="mb-3 rounded-xl border border-line bg-night-soft/50 px-3 py-2.5">
            <div className="mb-2 text-[11px] font-bold text-ink-soft">التزامك بكل عادة</div>
            <div className="space-y-1.5">
              {habitCommit.slice(0, 4).map((h) => (
                <HorizontalBar key={h.id} label={h.name} value={h.pct} color="var(--color-growth)" />
              ))}
            </div>
            <div className="mt-2.5 space-y-1.5">
              {[habitCommit[habitCommit.length - 2], habitCommit[habitCommit.length - 1]]
                .filter(Boolean)
                .map((h) => (
                  <HorizontalBar key={h.id} label={h.name} value={h.pct} color="var(--color-rose)" />
                ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="glass-soft px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-ink-soft">
              <BatteryCharging size={12} className="text-growth" /> عملية عامة
            </div>
            <div className="mt-1 font-display text-lg font-black">
              {energyRelation.high > energyRelation.low ? (
                <span className="text-growth">طاقة عالية = إنجاز ×{energyRelation.low ? (energyRelation.high / energyRelation.low).toFixed(1) : "∞"}</span>
              ) : (
                <span className="text-ink">الطاقة والإنجاز {energyRelation.high.toFixed(1)} / {energyRelation.low.toFixed(1)}</span>
              )}
            </div>
          </div>
          <div className="glass-soft px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-ink-soft">
              <CloudSun size={12} className="text-sun" /> مزاج عام
            </div>
            <div className="mt-1 font-display text-lg font-black">
              {moodRelation.good > moodRelation.low ? (
                <span className="text-sun">مزاج أعلى = إنجاز أكثر ✓</span>
              ) : (
                <span className="text-ink">{moodRelation.good.toFixed(1)} / {moodRelation.low.toFixed(1)}</span>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}