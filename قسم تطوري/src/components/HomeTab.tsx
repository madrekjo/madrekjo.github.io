import { useMemo, useState } from "react";
import {
  Flame,
  Trophy,
  Plus,
  X,
  Trash2,
  Minus,
  TrendingUp,
  TrendingDown,
  ListChecks,
  PenLine,
  CheckCircle2,
  Target,
} from "lucide-react";
import type {
  DayPoint,
  MyHabit,
  WeeklyGoal,
} from "@/data";
import { iconByName } from "@/lib/icons";
import { ProgressRing, WeekBars } from "@/lib/charts";
import {
  arabicDayName,
  greeting,
  monthLabel,
  toKey,
} from "@/lib/weeks";
import type { NavTab } from "./BottomNav";

export default function HomeTab({
  me,
  today,
  habits,
  goals,
  weekPoints,
  weekScore,
  prevScore,
  onToggleHabit,
  onOpenEvaluation,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onGoTab,
}: {
  me: { id: string; username: string; streak: number };
  today: DayPoint | null;
  habits: MyHabit[];
  goals: WeeklyGoal[];
  weekPoints: DayPoint[];
  weekScore: number;
  prevScore: number;
  onToggleHabit: (id: string) => void;
  onOpenEvaluation: () => void;
  onAddGoal: (desc: string, target: number, unit: string) => Promise<void>;
  onUpdateGoal: (id: string, progress: number | null, done: boolean | null) => Promise<void>;
  onDeleteGoal: (id: string) => Promise<void>;
  onGoTab: (t: NavTab) => void;
}) {
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [gDesc, setGDesc] = useState("");
  const [gTarget, setGTarget] = useState("1");
  const [gUnit, setGUnit] = useState("");
  const [goalBusy, setGoalBusy] = useState(false);

  const now = new Date();
  const todayR = toKey(now);

  const doneCount = habits.filter((h) => h.done).length;
  const commitPct = habits.length ? Math.round((doneCount / habits.length) * 100) : 0;
  const delta = weekScore - prevScore;

  const greetingPeriod = greeting();
  const weekday = `${arabicDayName(now)} ${now.getDate()}`;

  const addGoal = async () => {
    const t = Number(gTarget);
    if (gDesc.trim().length < 3 || !t || t <= 0) return;
    setGoalBusy(true);
    await onAddGoal(gDesc.trim(), t, gUnit.trim());
    setGoalBusy(false);
    setShowGoalForm(false);
    setGDesc("");
    setGTarget("1");
    setGUnit("");
  };

  const mayAddGoal = useMemo(() => goals.length < 8, [goals.length]);

  return (
    <div className="fade-up space-y-4">
      {/* الترحيب */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-black">{greetingPeriod}، <span className="grad-text">{me.username}</span></h1>
          <p className="text-xs font-bold text-ink-soft">{weekday} · {monthLabel(now)}</p>
        </div>
      </div>

      {/* بطاقة اليوم */}
      <section className="glass p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-ink-soft">مؤشر اليوم</span>
          {me.streak > 0 && (
            <span className="chip" style={{ borderColor: "rgba(var(--sun-rgb),0.4)", color: "var(--color-sun)" }}>
              <Flame size={13} /> {me.streak}{" "}
              {me.streak === 1 ? "يوم متتالٍ" : "أيام متتالية"}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-4">
          <ProgressRing score={today?.score ?? 0} active={today?.active ?? false} />
          <div className="flex-1 space-y-2">
            <div className="glass-soft flex items-center justify-between px-3 py-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink-soft">
                <Trophy size={13} className="text-growth" /> إنجازات اليوم
              </span>
              <span className="font-display text-base font-black">{today?.achievement_count ?? 0}</span>
            </div>
            <div className="glass-soft flex items-center justify-between px-3 py-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink-soft">
                <ListChecks size={13} className="text-glow" /> التزام العادات
              </span>
              <span className="font-display text-base font-black">{commitPct}%</span>
            </div>
            {today?.active && (
              <div className="px-1 text-[11px] font-bold text-ink-soft">
                {today.habits_total > 0
                  ? `${today.habits_done} من ${today.habits_total} عادة`
                  : today.achievement_count > 0
                    ? `${today.achievement_count} إنجاز مسجّل اليوم`
                    : "يوم مميز"}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3">
          {today?.note ? (
            <button onClick={onOpenEvaluation} className="glass-soft flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start">
              <PenLine size={14} className="shrink-0 text-growth" />
              <span className="line-clamp-2 text-xs font-bold text-ink">{today.note}</span>
              <span className="ms-auto shrink-0 text-[10px] font-bold text-growth">تعديل</span>
            </button>
          ) : (
            <button onClick={onOpenEvaluation} className="grad-btn w-full rounded-xl py-3 font-display text-sm font-extrabold text-white">
              قيّم يومك الآن
            </button>
          )}
        </div>
      </section>

      {/* عادات اليوم */}
      <section className="glass p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-extrabold text-ink-soft">عادات اليوم</span>
          <button onClick={() => onGoTab("habits")} className="text-[11px] font-bold text-growth">
            إدارة
          </button>
        </div>
        {habits.length === 0 ? (
          <button onClick={() => onGoTab("habits")} className="glass-soft w-full rounded-xl px-4 py-4 text-center text-xs font-bold text-ink-soft">
            اختر عاداتك من المكتبة — صلاة الفجر، ورد قرآني، رياضة...
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {habits.map((h) => {
              const Icon = iconByName(h.icon);
              return (
                <button
                  key={h.id}
                  onClick={() => void onToggleHabit(h.id)}
                  className={"chip py-2 pl-3" + (h.done ? " on" : "")}
                  style={h.done ? { borderColor: "rgba(var(--growth-rgb),0.5)" } : undefined}
                >
                  {Icon && <Icon size={14} />}
                  {h.name}
                  {h.done && <CheckCircle2 size={13} />}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* أهداف الأسبوع */}
      <section className="glass p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-extrabold text-ink-soft">أهداف هذا الأسبوع</span>
          {!showGoalForm && mayAddGoal && (
            <button onClick={() => setShowGoalForm(true)} className="chip" style={{ color: "var(--color-glow)", borderColor: "rgba(var(--glow-rgb),0.4)" }}>
              <Plus size={13} /> هدف جديد
            </button>
          )}
        </div>

        {goals.length === 0 && !showGoalForm && (
          <p className="glass-soft rounded-xl px-4 py-4 text-center text-xs font-bold text-ink-soft">
            أهداف مثل: إنهاء وحدتين كيمياء · قراءة 50 صفحة · ممارسة الرياضة 4 مرات
          </p>
        )}

        {showGoalForm && (
          <div className="glass-soft pop-in mb-2 space-y-2 p-3">
            <input
              autoFocus
              value={gDesc}
              onChange={(e) => setGDesc(e.target.value)}
              placeholder="مثال: قراءة 50 صفحة"
              maxLength={90}
              className="w-full rounded-lg border border-line bg-night-soft px-3 py-2 text-sm font-bold outline-none focus:border-glow/50"
            />
            <div className="flex gap-2">
              <input
                value={gTarget}
                onChange={(e) => setGTarget(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="الكمية"
                className="w-24 rounded-lg border border-line bg-night-soft px-3 py-2 text-sm font-bold outline-none focus:border-glow/50"
              />
              <input
                value={gUnit}
                onChange={(e) => setGUnit(e.target.value)}
                placeholder="وحدة (صفحة/مرة)"
                maxLength={20}
                className="flex-1 rounded-lg border border-line bg-night-soft px-3 py-2 text-sm font-bold outline-none focus:border-glow/50"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void addGoal()}
                disabled={goalBusy || gDesc.trim().length < 3}
                className="grad-btn flex-1 rounded-lg py-2 text-xs font-extrabold text-white disabled:opacity-40"
              >
                {goalBusy ? "جارٍ الإضافة..." : "أضف الهدف"}
              </button>
              <button onClick={() => setShowGoalForm(false)} className="glass-soft rounded-lg px-3 text-xs font-bold text-ink-soft">
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {goals.map((g) => {
          const pct = g.done ? 100 : Math.min(100, Math.round((g.progress / g.target) * 100));
          return (
            <div key={g.id} className={"glass-soft mb-2 p-3 " + (g.done ? "opacity-70" : "")}>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  size={18}
                  onClick={() => void onUpdateGoal(g.id, null, !g.done)}
                  className={"shrink-0 cursor-pointer " + (g.done ? "text-growth" : "text-ink-soft")}
                />
                <span className={"min-w-0 flex-1 truncate text-sm font-bold " + (g.done ? "line-through text-ink-soft" : "text-ink")}>
                  {g.description}
                </span>
                <span className="text-[11px] font-black text-ink-soft">
                  {g.done ? "100" : g.progress} / {g.target}{g.unit && <span> {g.unit}</span>}
                </span>
                <button onClick={() => void onDeleteGoal(g.id)} className="shrink-0 text-ink-soft hover:text-rose">
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {!g.done && (
                  <button onClick={() => void onUpdateGoal(g.id, Math.max(0, g.progress - 1), null)} className="glass-soft rounded-md p-1 text-ink-soft">
                    <Minus size={12} />
                  </button>
                )}
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-night-soft">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-growth to-glow transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {!g.done && (
                  <button onClick={() => void onUpdateGoal(g.id, g.progress + 1, null)} className="glass-soft rounded-md p-1 text-growth">
                    <Plus size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* مؤشر الأسبوع */}
      <section className="glass p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-extrabold text-ink-soft">مؤشر هذا الأسبوع</span>
          <span className="font-display text-xl font-black">
            {weekScore}
            <span className="ms-1 text-[10px] font-bold text-ink-soft">/100</span>
          </span>
        </div>

        <div className="mx-auto max-w-sm">
          <WeekBars points={weekPoints} weekStart={weekPoints[0]?.day ?? todayR} />
        </div>

        <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-line bg-night-soft/50 px-3 py-2 text-xs font-bold">
          {delta >= 0 ? (
            <>
              <TrendingUp size={15} className="text-growth" />
              <span className="text-growth">+{delta}</span>
              <span className="text-ink-soft">عن الأسبوع الماضي ({prevScore})</span>
            </>
          ) : (
            <>
              <TrendingDown size={15} className="text-rose" />
              <span className="text-rose">{delta}</span>
              <span className="text-ink-soft">عن الأسبوع الماضي ({prevScore})</span>
            </>
          )}
        </div>
      </section>

      {/* تذكير */}
      <section className="glass-soft flex items-center gap-3 px-4 py-3">
        <Target size={18} className="shrink-0 text-vib" />
        <p className="text-xs font-bold leading-5 text-ink-soft">
          سرّ التطور ليس التخطيط الكبير، بل الخطوات الصغيرة المكررة كل يوم. سجّل إنجازك
          مهما بدا صغيراً.
        </p>
      </section>
    </div>
  );
}