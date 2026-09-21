import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Database, Palette, UserRound } from "lucide-react";
import {
  addAchievement,
  addGoal,
  addHabit,
  dayScore,
  deleteAchievement,
  deleteGoal,
  deleteHabit,
  ensureUser,
  habitLogsRange,
  leaderboard,
  myAchievements,
  myGoals,
  myHabits,
  myProfile,
  saveEvaluation,
  timeline,
  toggleHabit,
  updateGoal,
  type LeaderboardMetric,
} from "./lib/api";
import { addDays, monthStart, toKey, todayKey, weekAvg, weekStart } from "./lib/weeks";
import type {
  Achievement,
  DayPoint,
  Evaluation,
  HabitLog,
  LeaderboardEntry,
  MyHabit,
  MyProfile,
  WeeklyGoal,
} from "./data";
import BottomNav, { type NavTab } from "./components/BottomNav";
import Onboarding from "./components/Onboarding";
import EvaluationModal from "./components/EvaluationModal";
import HomeTab from "./components/HomeTab";
import HabitsTab from "./components/HabitsTab";
import AchievementsTab from "./components/AchievementsTab";
import ProgressTab from "./components/ProgressTab";
import LeaderboardPanel from "./components/Leaderboard";

export default function App() {
  const [me, setMe] = useState<MyProfile | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [view, setView] = useState<NavTab>("home");
  const [notice, setNotice] = useState("");
  const [, setTick] = useState(0);

  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [habits, setHabits] = useState<MyHabit[]>([]);
  const [todayHabits, setTodayHabits] = useState<MyHabit[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [todayPoint, setTodayPoint] = useState<DayPoint | null>(null);
  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [weekPoints, setWeekPoints] = useState<DayPoint[]>([]);
  const [prevWeekPoints, setPrevWeekPoints] = useState<DayPoint[]>([]);
  const [monthPoints, setMonthPoints] = useState<DayPoint[]>([]);
  const [last30Points, setLast30Points] = useState<DayPoint[]>([]);
  const [leaderboardMetric, setLeaderboardMetric] = useState<LeaderboardMetric>("score");
  const [boardEntries, setBoardEntries] = useState<LeaderboardEntry[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);

  const [evalOpen, setEvalOpen] = useState(false);

  const [theme, setTheme] = useState<"lavender" | "default">(() =>
    typeof window !== "undefined" && localStorage.getItem("prog-theme") === "lavender" ? "lavender" : "default",
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("prog-theme", theme);
  }, [theme]);

  const flashTimer = useRef<number | null>(null);

  const now = new Date();
  const weekStartDate = useMemo(() => weekStart(now), []);
  const weekStartKey = toKey(weekStartDate);
  const weekEndKey = toKey(addDays(weekStartDate, 6));
  const prevWeekKey = toKey(addDays(weekStartDate, -7));
  const prevWeekEndKey = toKey(addDays(weekStartDate, -1));
  const monthStartKey = toKey(monthStart(now));
  const today = todayKey();
  const last30StartKey = toKey(addDays(now, -29));

  const flash = useCallback((m: string) => {
    setNotice(m);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setNotice(""), 2400);
  }, []);

  const requireUser = useCallback((): boolean => {
    if (me) return true;
    flash("حدّد اسمك أولاً من الشاشة الترحيبية");
    setOnboardingOpen(true);
    return false;
  }, [me, flash]);

  // ---------- التحميل الأول ----------
  useEffect(() => {
    (async () => {
      let prof: MyProfile | null = null;
      try {
        prof = await myProfile();
        setMe(prof);
        if (!prof) setOnboardingOpen(true);
      } catch {
        setDbError(true);
      }
      setIdentityReady(true);
      try {
        await reloadAll(prof);
      } catch {
        setDbError(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHabits = useCallback(async (day: string) => {
    try {
      return await myHabits(day);
    } catch {
      return [] as MyHabit[];
    }
  }, []);

  const reloadAll = useCallback(
    async (prof?: MyProfile | null) => {
      const [week, prevWeek, month, last30, logs, ach, g] = await Promise.all([
        timeline(weekStartKey, weekEndKey),
        timeline(prevWeekKey, prevWeekEndKey),
        timeline(monthStartKey, today),
        timeline(last30StartKey, today),
        habitLogsRange(last30StartKey, today),
        myAchievements(),
        myGoals(weekStartKey),
      ]);
      setWeekPoints(week);
      setPrevWeekPoints(prevWeek);
      setMonthPoints(month);
      setLast30Points(last30);
      setHabitLogs(logs);
      setAchievements(ach);
      setGoals(g);

      const p = prof === undefined ? me : prof;
      if (!p) {
        setHabits([]);
        setTodayHabits([]);
        setTodayPoint(null);
        return;
      }
      const [hSel, hToday, todayPt] = await Promise.all([
        myHabits(selectedDay),
        myHabits(today),
        dayScore(today),
      ]);
      setHabits(hSel);
      setTodayHabits(hToday);
      setTodayPoint(todayPt);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me, selectedDay, today]
  );

  // إعادة تحميل عند تغيّر اليوم المختار
  useEffect(() => {
    if (!identityReady || !me) return;
    void loadHabits(selectedDay).then(setHabits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, identityReady]);

  // ---------- لوحة المتصدرين ----------
  useEffect(() => {
    if (!identityReady || view !== "board") return;
    setBoardLoading(true);
    leaderboard(leaderboardMetric, weekStartKey)
      .then(setBoardEntries)
      .catch(() => setBoardEntries([]))
      .finally(() => setBoardLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, leaderboardMetric, identityReady, todayPoint, me]);

  const bump = useCallback(() => setTick((t) => t + 1), []);

  const commit = useCallback(async (fn: () => Promise<void>) => {
    if (!requireUser()) return;
    try {
      await fn();
      const p = await myProfile();
      setMe(p);
      void (async () => {
        try {
          await reloadAll(p);
        } catch {
          /* keep */
        }
      })();
    } catch (e) {
      flash(e instanceof Error ? e.message : "تعذّرت العملية");
    }
  }, [reloadAll, requireUser, flash]);

  // ---------- العمليات ----------
  const onToggleHabit = (id: string, day: string) =>
    commit(async () => {
      await toggleHabit(id, day);
    });

  const onAddHabit = async (key: string, name: string, icon: string, category: string, isCustom: boolean) => {
    if (!requireUser()) return "";
    try {
      const id = await addHabit(key, name, icon, category, isCustom);
      void (async () => {
        try {
          const p = await myProfile();
          setMe(p);
          await reloadAll(p);
        } catch {
          /* ignore */
        }
      })();
      return id;
    } catch (e) {
      flash(e instanceof Error ? e.message : "تعذّر إضافة العادة");
      return "";
    }
  };

  const onDeleteHabit = (id: string) =>
    commit(async () => {
      await deleteHabit(id);
    });

  const onAddAchievement = async (category: string, desc: string, day: string) => {
    if (!requireUser()) return "";
    try {
      const id = await addAchievement(category, desc, day);
      void (async () => {
        try {
          await reloadAll();
        } catch {
          /* ignore */
        }
      })();
      return id;
    } catch (e) {
      flash(e instanceof Error ? e.message : "تعذّر تسجيل الإنجاز");
      return "";
    }
  };

  const onDeleteAchievement = (id: string) =>
    commit(async () => {
      await deleteAchievement(id);
    });

  const onSaveEvaluation = async (e: Evaluation) => {
    if (!requireUser()) return;
    try {
      await saveEvaluation(e.energy, e.mood, e.satisfaction, e.note, today);
      setEvalOpen(false);
      await reloadAll();
    } catch (err) {
      flash(err instanceof Error ? err.message : "تعذّر حفظ التقييم");
    }
  };

  const onAddGoal = async (desc: string, target: number, unit: string) => {
    if (!requireUser()) return;
    try {
      await addGoal(desc, target, unit, weekStartKey);
      await reloadAll();
    } catch (err) {
      flash(err instanceof Error ? err.message : "تعذّر إضافة الهدف");
    }
  };

  const onUpdateGoal = async (id: string, progress: number | null, done: boolean | null) => {
    if (!requireUser()) return;
    try {
      await updateGoal(id, progress, done);
      await reloadAll();
    } catch (err) {
      flash(err instanceof Error ? err.message : "تعذّر تحديث الهدف");
    }
  };

  const onDeleteGoal = async (id: string) => {
    if (!requireUser()) return;
    try {
      await deleteGoal(id);
      await reloadAll();
    } catch (err) {
      flash(err instanceof Error ? err.message : "تعذّر حذف الهدف");
    }
  };

  const onboardingDone = async (username: string) => {
    try {
      const id = await ensureUser(username);
      setDbError(false);
      setMe({ id, username, streak: 0, habits_count: 0, total_achievements: 0 });
      setOnboardingOpen(false);
      setIdentityReady(true);
      bump();
      await reloadAll({ id, username, streak: 0, habits_count: 0, total_achievements: 0 });
    } catch (e) {
      setDbError(true);
      flash(e instanceof Error ? e.message : "تعذّر حفظ اسمك — نفّذ الـ Migration");
    }
  };

  // ---------- مشتقات ----------
  const weekScore = weekAvg(weekPoints);
  const prevScore = weekAvg(prevWeekPoints);

  const evalInfo: Evaluation | null =
    todayPoint && (todayPoint.energy > 0 || todayPoint.mood > 0 || todayPoint.satisfaction > 0)
      ? {
          energy: todayPoint.energy,
          mood: todayPoint.mood,
          satisfaction: todayPoint.satisfaction,
          note: todayPoint.note,
        }
      : null;

  if (!identityReady) {
    return (
      <div className="bg-arena mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-3xl font-black">
          <span className="grad-text">تطوري</span>
        </p>
        <p className="mt-2 text-sm text-ink-soft">جارٍ فتح منصة التطوّر...</p>
      </div>
    );
  }

  return (
    <div className="bg-arena app-shell mx-auto min-h-screen w-full max-w-2xl px-4">
      <header className="flex items-center justify-between pt-5 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-lg font-black">
            <span className="grad-text">تطوري</span>
          </span>
          <span className="rounded-full border border-line px-2 py-0.5 text-[9px] font-black text-ink-soft">
            مدارك جو
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme((t) => (t === "lavender" ? "default" : "lavender"))}
            className="chip"
            title={theme === "lavender" ? "التبديل للثيم الافتراضي" : "التبديل لثيم اللافندر"}
          >
            <Palette size={13} /> {theme === "lavender" ? "افتراضي" : "لافندر"}
          </button>
          <a
            href="/"
            className="chip"
            title="العودة للمنصة"
          >
            <ArrowRight size={13} /> الرئيسية
          </a>
        </div>
      </header>

      {dbError && (
        <div className="pop-in mb-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-[11px] font-bold leading-5 text-amber-200">
          <Database size={16} className="mt-0.5 shrink-0" />
          <span>
            القسم منتظر ربط قاعدة البيانات: افتح <b>Supabase → SQL Editor</b> ونفّذ ملف{" "}
            <b>20260917_tatawwuri.sql</b> كاملاً، ثم أعد فتح الصفحة.
          </span>
        </div>
      )}

      {me && (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-line bg-card/60 px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-xs font-bold text-ink">
            <UserRound size={14} className="text-growth" /> {me.username}
            <span className="text-ink-soft">· {me.streak} يوم متتالٍ</span>
          </span>
          <span className="chip on" style={{ padding: "3px 10px" }}>
            {habits?.length ?? 0} عادات
          </span>
        </div>
      )}

      {notice && (
        <div className="fixed bottom-24 left-1/2 z-[85] -translate-x-1/2 rounded-full border border-line bg-[var(--notice-bg)] px-5 py-2.5 text-sm font-bold text-ink shadow-xl">
          {notice}
        </div>
      )}

      {view === "home" && (
        <HomeTab
          me={me ?? { id: "", username: "زائر", streak: 0 }}
          today={todayPoint}
          habits={todayHabits}
          goals={goals}
          weekPoints={weekPoints}
          weekScore={weekScore}
          prevScore={prevScore}
          onToggleHabit={(id) => void onToggleHabit(id, today)}
          onOpenEvaluation={() => (!me ? setOnboardingOpen(true) : setEvalOpen(true))}
          onAddGoal={onAddGoal}
          onUpdateGoal={onUpdateGoal}
          onDeleteGoal={onDeleteGoal}
          onGoTab={setView}
        />
      )}

      {view === "habits" && (
        <HabitsTab
          habits={habits}
          day={selectedDay}
          setDay={setSelectedDay}
          onToggle={(id) => void onToggleHabit(id, selectedDay)}
          onAdd={onAddHabit}
          onDelete={(id) => void onDeleteHabit(id)}
        />
      )}

      {view === "achievements" && (
        <AchievementsTab
          achievements={achievements}
          day={selectedDay}
          setDay={setSelectedDay}
          onAdd={onAddAchievement}
          onDelete={(id) => void onDeleteAchievement(id)}
        />
      )}

      {view === "progress" && me && (
        <ProgressTab
          weekPoints={weekPoints}
          prevWeekPoints={prevWeekPoints}
          monthPoints={monthPoints}
          last30Points={last30Points}
          achievements={achievements}
          habitLogs={habitLogs}
          me={me}
        />
      )}
      {view === "progress" && !me && (
        <div className="glass-soft rounded-xl px-5 py-10 text-center text-sm font-bold text-ink-soft">
          سجّل اسمك أولاً لتظهر تقارير تقدّمك
        </div>
      )}

      {view === "board" && (
        <LeaderboardPanel
          metric={leaderboardMetric}
          setMetric={(m) => setLeaderboardMetric(m as LeaderboardMetric)}
          entries={boardEntries}
          meId={me?.id ?? null}
          loading={boardLoading}
          weekLabel={`${weekStartDate.toLocaleDateString("ar-EG", { day: "numeric", month: "long" })} — ${addDays(weekStartDate, 6).toLocaleDateString("ar-EG", { day: "numeric", month: "long" })}`}
        />
      )}

      <footer className="mt-10 pb-4 text-center text-[11px] leading-5 text-ink-soft">
        <p>
          تطوري — نبني الانضباط يوماً بعد يوم · مدارك جو
        </p>
      </footer>

      <BottomNav active={view} onChange={setView} />

      <EvaluationModal
        open={evalOpen}
        existing={evalInfo}
        dayLabel={today}
        onSave={(e) => void onSaveEvaluation(e)}
        onClose={() => setEvalOpen(false)}
      />

      {onboardingOpen && (
        <Onboarding
          onDone={(n) => void onboardingDone(n)}
          onSkip={() => setOnboardingOpen(false)}
        />
      )}
    </div>
  );
}