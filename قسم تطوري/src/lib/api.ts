import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "./device";
import type {
  Achievement,
  DayPoint,
  Evaluation,
  HabitLog,
  LeaderboardEntry,
  MyHabit,
  MyProfile,
  WeeklyGoal,
} from "@/data";

function errorMessage(
  err: { message?: string; details?: string } | null,
  fallback: string
): string {
  if (err?.message) {
    const m = err.message;
    if (m.includes("does not exist") || (m.includes("function") && m.includes("not found")))
      return "القاعدة تنتظر تنفيذ Migration — افتح Supabase → SQL Editor ونفّذ ملف 20260917_tatawwuri.sql";
    if (err.details) return m + " — " + err.details;
    return m;
  }
  return fallback;
}

function mapDayPoint(r: Record<string, any>): DayPoint {
  return {
    day: r.day,
    score: Number(r.score ?? 0),
    habits_done: Number(r.habits_done ?? 0),
    habits_total: Number(r.habits_total ?? 0),
    achievement_count: Number(r.achievement_count ?? 0),
    energy: Number(r.energy ?? 0),
    mood: Number(r.mood ?? 0),
    satisfaction: Number(r.satisfaction ?? 0),
    note: String(r.note ?? ""),
    active: Boolean(r.active),
  };
}

// ---------- المستخدم والبروفايل ----------
export async function ensureUser(username: string): Promise<string> {
  const device = getDeviceId();
  const { data, error } = await supabase.rpc("prog_ensure_user", {
    p_username: username.trim().slice(0, 25),
    p_device: device,
  });
  if (error) throw new Error(errorMessage(error, "تعذّر حفظ اسمك"));
  return data as string;
}

export async function myProfile(): Promise<MyProfile | null> {
  const { data, error } = await supabase.rpc("prog_my_profile", {
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تحميل بياناتك"));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    streak: Number(row.streak ?? 0),
    habits_count: Number(row.habits_count ?? 0),
    total_achievements: Number(row.total_achievements ?? 0),
  };
}

// ---------- العادات ----------
export async function myHabits(day: string): Promise<MyHabit[]> {
  const { data, error } = await supabase.rpc("prog_my_habits", {
    p_day: day,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تحميل العادات"));
  return (data ?? []) as MyHabit[];
}

export async function toggleHabit(habitId: string, day: string): Promise<void> {
  const { error } = await supabase.rpc("prog_toggle_habit", {
    p_habit: habitId,
    p_day: day,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تسجيل العادة"));
}

export async function addHabit(
  key: string,
  name: string,
  icon: string,
  category: string,
  isCustom: boolean
): Promise<string> {
  const { data, error } = await supabase.rpc("prog_add_habit", {
    p_key: key,
    p_name: name,
    p_icon: icon,
    p_category: category,
    p_is_custom: isCustom,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر إضافة العادة"));
  return data as string;
}

export async function deleteHabit(habitId: string): Promise<void> {
  const { error } = await supabase.rpc("prog_delete_habit", {
    p_habit: habitId,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر حذف العادة"));
}

export async function habitLogsRange(
  from: string,
  to: string
): Promise<HabitLog[]> {
  const { data, error } = await supabase.rpc("prog_habit_logs_range", {
    p_from: from,
    p_to: to,
    p_device: getDeviceId(),
  });
  if (error) return [];
  return (data ?? []) as HabitLog[];
}

// ---------- الإنجازات ----------
export async function myAchievements(): Promise<Achievement[]> {
  const { data, error } = await supabase.rpc("prog_my_achievements", {
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تحميل الإنجازات"));
  const rows = (data ?? []) as Record<string, any>[];
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    description: r.description,
    day: r.day,
    created_at: r.created_at,
  }));
}

export async function addAchievement(
  category: string,
  description: string,
  day: string
): Promise<string> {
  const { data, error } = await supabase.rpc("prog_add_achievement", {
    p_category: category,
    p_description: description,
    p_day: day,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تسجيل الإنجاز"));
  return data as string;
}

export async function deleteAchievement(id: string): Promise<void> {
  const { error } = await supabase.rpc("prog_delete_achievement", {
    p_achievement: id,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر حذف الإنجاز"));
}

// ---------- تقييم نهاية اليوم ----------
export async function saveEvaluation(
  energy: number,
  mood: number,
  satisfaction: number,
  note: string,
  day: string
): Promise<void> {
  const { error } = await supabase.rpc("prog_save_evaluation", {
    p_energy: energy,
    p_mood: mood,
    p_satisfaction: satisfaction,
    p_note: note,
    p_day: day,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر حفظ التقييم"));
}

export async function getEvaluation(day: string): Promise<Evaluation | null> {
  const { data, error } = await supabase.rpc("prog_get_evaluation", {
    p_day: day,
    p_device: getDeviceId(),
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    energy: Number(row.energy),
    mood: Number(row.mood),
    satisfaction: Number(row.satisfaction),
    note: String(row.note ?? ""),
  };
}

// ---------- المؤشرات ----------
export async function dayScore(day: string): Promise<DayPoint | null> {
  const { data, error } = await supabase.rpc("prog_day_score", {
    p_day: day,
    p_device: getDeviceId(),
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapDayPoint(row) : null;
}

export async function timeline(
  from: string,
  to: string
): Promise<DayPoint[]> {
  const { data, error } = await supabase.rpc("prog_timeline", {
    p_from: from,
    p_to: to,
    p_device: getDeviceId(),
  });
  if (error) {
    throw new Error(errorMessage(error, "تعذّر تحميل سلاسل التقدّم"));
  }
  return ((data ?? []) as Record<string, any>[]).map(mapDayPoint);
}

// ---------- الأهداف الأسبوعية ----------
export async function myGoals(weekStart: string): Promise<WeeklyGoal[]> {
  const { data, error } = await supabase.rpc("prog_my_goals", {
    p_week_start: weekStart,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تحميل الأهداف"));
  return (data ?? []) as WeeklyGoal[];
}

export async function addGoal(
  description: string,
  target: number,
  unit: string,
  weekStart: string
): Promise<string> {
  const { data, error } = await supabase.rpc("prog_add_goal", {
    p_description: description,
    p_target: target,
    p_unit: unit,
    p_week_start: weekStart,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر إضافة الهدف"));
  return data as string;
}

export async function updateGoal(
  goalId: string,
  progress: number | null,
  done: boolean | null
): Promise<void> {
  const { error } = await supabase.rpc("prog_update_goal", {
    p_goal: goalId,
    p_progress: progress,
    p_done: done,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تحديث الهدف"));
}

export async function deleteGoal(goalId: string): Promise<void> {
  const { error } = await supabase.rpc("prog_delete_goal", {
    p_goal: goalId,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر حذف الهدف"));
}

// ---------- المتصدرون ----------
export type LeaderboardMetric = "score" | "streak" | "achievements" | "commitment";

export async function leaderboard(
  metric: LeaderboardMetric,
  weekStart: string
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("prog_leaderboard", {
    p_metric: metric,
    p_week_start: weekStart,
  });
  if (error) {
    throw new Error(errorMessage(error, "تعذّر تحميل المتصدرين"));
  }
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    user_id: r.user_id,
    username: r.username,
    value: Number(r.value ?? 0),
    active_days: Number(r.active_days ?? 0),
  }));
}