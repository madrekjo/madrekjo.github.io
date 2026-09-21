import type { ReactNode } from "react";
import type { DayPoint } from "@/data";
import { fromKey, scoreColor, scoreRGB, todayKey } from "./weeks";

export function ProgressRing({
  score,
  active,
  size = 148,
  stroke = 13,
}: {
  score: number;
  active: boolean;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: "var(--score-best)" }} />
            <stop offset="55%" style={{ stopColor: "var(--score-good)" }} />
            <stop offset="100%" style={{ stopColor: "var(--color-vib)" }} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{
            stroke: active ? "url(#ringGrad)" : "var(--color-line)",
            transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display" style={{ fontSize: size * 0.26, fontWeight: 900 }}>
          {active ? score : "—"}
        </span>
        <span className="text-[10px] font-bold text-ink-soft">من 100</span>
      </div>
    </div>
  );
}

export function WeekBars({
  points,
  weekStart,
  height = 132,
}: {
  points: DayPoint[];
  weekStart: string;
  height?: number;
}) {
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = fromKey(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const byDay = new Map(points.map((p) => [p.day, p]));
  const today = todayKey();

  return (
    <div className="flex h-full items-end justify-between gap-1.5">
      {weekDays.map((d) => {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const pt = byDay.get(key);
        const isToday = key === today;
        const score = pt?.active ? pt.score : 0;
        const color = pt?.active ? scoreColor(score) : "var(--color-line)";
        const h = Math.max(6, (score / 100) * height);
        return (
          <div key={key} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-[132px] w-full items-end justify-center">
              <div
                className="grow-bar w-full max-w-[30px] rounded-t-lg"
                style={{
                  height: h,
                  background: color,
                  opacity: pt?.active ? 1 : 0.5,
                  boxShadow: pt?.active ? `0 6px 18px -6px ${color}` : "none",
                }}
              />
            </div>
            <span
              className={"text-[10px] font-bold " + (isToday ? "text-growth" : "text-ink-soft")}
            >
              {["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][d.getDay()].slice(0, 3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MonthHeatMap({ points, monthStart }: { points: DayPoint[]; monthStart: string }) {
  const start = fromKey(monthStart);
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const byDay = new Map(points.map((p) => [p.day, p]));
  const today = todayKey();

  const cells: { key: string; day: number; score: number; active: boolean }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = new Date(start.getFullYear(), start.getMonth(), d);
    const key = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const pt = byDay.get(key);
    cells.push({ key, day: d, score: pt?.active ? pt.score : 0, active: Boolean(pt?.active) });
  }

  const firstWeekday = (start.getDay() + 1) % 7; // الأحد=0 في JS، نريد البدء من اليمين

  const alpha = (score: number) => {
    if (score >= 85) return 1;
    if (score >= 60) return 0.8;
    if (score >= 40) return 0.6;
    if (score >= 20) return 0.45;
    return 0.3;
  };
const colorFor = (c: (typeof cells)[number]) => {
    if (!c.active) return "rgba(var(--line-rgb),0.5)";
    return `rgb(${scoreRGB(c.score)} / ${alpha(c.score)})`;
  };

  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) }, (_, row) => (
        <div key={row} className="flex gap-1.5" dir="rtl">
          {Array.from({ length: 7 }, (_, col) => {
            const idx = row * 7 + col;
            const cell = cells[idx - firstWeekday];
            if (!cell) return <div key={col} className="aspect-square min-w-0 flex-1 rounded-[7px]" style={{ background: "rgba(var(--line-rgb),0.25)" }} />;
            const isToday = cell.key === today;
            return (
              <div
                key={col}
                title={`${cell.key} — ${cell.active ? cell.score : "لا نشاط"}`}
                className="relative aspect-square min-w-0 flex-1 rounded-[7px]"
                style={{ background: colorFor(cell) }}
              >
                {isToday && <span className="absolute inset-0 rounded-[7px] ring-2 ring-growth" />}
              </div>
            );
          })}
        </div>
      ))}
      <div className="mt-1 flex items-center justify-end gap-1 text-[9px] font-bold text-ink-soft">
        <span>أقل</span>
        {[0.3, 0.45, 0.6, 0.8, 1].map((a) => (
          <span key={a} className="h-3 w-3 rounded-[4px]" style={{ background: `rgb(var(--score-best) / ${a})` }} />
        ))}
        <span>أعلى</span>
      </div>
    </div>
  );
}

export function TrendLine({ points, height = 180 }: { points: DayPoint[]; height?: number }) {
  const width = 340;
  const padX = 8;
  const padTop = 16;
  const padBottom = 22;
  const maxScore = 100;
  const n = points.length;
  if (n < 2) {
    return (
      <div className="flex h-[180px] items-center justify-center text-xs font-bold text-ink-soft">
        سجّل أياماً أكثر لتظهر المنحنى
      </div>
    );
  }
  const stepX = (width - padX * 2) / (n - 1);
  const y = (s: number) => padTop + (1 - s / maxScore) * (height - padTop - padBottom);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(padX + i * stepX).toFixed(1)},${y(p.active ? p.score : 0).toFixed(1)}`).join(" ");
  const area = `${line} L${(padX + (n - 1) * stepX).toFixed(1)},${height - padBottom} L${padX},${height - padBottom} Z`;

  const labels: ReactNode[] = [];
  const step = Math.max(1, Math.round(n / 6));
  points.forEach((p, i) => {
    if (i % step === 0 || i === n - 1) {
      const d = fromKey(p.day);
      labels.push(
        <text key={p.day} x={padX + i * stepX} y={height - 6} textAnchor="middle" fontSize="8.5" fontWeight="700" style={{ fill: "var(--color-ink-soft)" }}>
          {`${d.getMonth() + 1}/${d.getDate()}`}
        </text>
      );
    }
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxWidth: 460 }}>
      <defs>
        <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--score-best)", stopOpacity: 0.5 }} />
          <stop offset="100%" style={{ stopColor: "var(--score-best)", stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: "var(--score-best)" }} />
          <stop offset="100%" style={{ stopColor: "var(--score-good)" }} />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={padX} x2={width - padX} y1={y(g)} y2={y(g)} strokeWidth="1" strokeDasharray="3 4" style={{ stroke: "var(--color-line)" }} />
          <text x={2} y={y(g) + 3} fontSize="8" style={{ fill: "var(--color-ink-soft)" }}>{g}</text>
        </g>
      ))}
      <path d={area} fill="url(#trendArea)" />
      <path d={line} fill="none" stroke="url(#trendLine)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) =>
        p.active ? (
          <circle
            key={p.day}
            cx={padX + i * stepX}
            cy={y(p.score)}
            r={2.6}
            strokeWidth="1.4"
            style={{ fill: scoreColor(p.score), stroke: "var(--color-night)" }}
          />
        ) : null
      )}
      {labels}
    </svg>
  );
}

export function StatTile({
  icon,
  label,
  value,
  sub,
  color = "var(--score-best)",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="glass-soft flex items-center gap-3 px-3 py-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-bold text-ink-soft">{label}</div>
        <div className="font-display text-base font-extrabold leading-tight">{value}</div>
        {sub ? <div className="text-[10px] font-semibold text-ink-soft">{sub}</div> : null}
      </div>
    </div>
  );
}