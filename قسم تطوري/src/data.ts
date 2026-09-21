export type HabitCategory = "ديني" | "دراسة" | "صحة" | "تطوير ذاتي";

export type AchievementCategory =
  | "دراسة"
  | "رياضة"
  | "قرآن"
  | "قراءة"
  | "صحة"
  | "مشروع شخصي"
  | "تعلم مهارة"
  | "أخرى";

export interface HabitLibraryItem {
  key: string;
  name: string;
  icon: string;
  category: HabitCategory;
}

export interface MyHabit {
  id: string;
  key: string;
  name: string;
  icon: string;
  category: HabitCategory;
  is_custom: boolean;
  done: boolean;
}

export interface DayPoint {
  day: string;
  score: number;
  habits_done: number;
  habits_total: number;
  achievement_count: number;
  energy: number;
  mood: number;
  satisfaction: number;
  note: string;
  active: boolean;
}

export interface Evaluation {
  energy: number;
  mood: number;
  satisfaction: number;
  note: string;
}

export interface Achievement {
  id: string;
  category: AchievementCategory;
  description: string;
  day: string;
  created_at: string;
}

export interface WeeklyGoal {
  id: string;
  description: string;
  target: number;
  unit: string;
  progress: number;
  done: boolean;
}

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  value: number;
  active_days: number;
}

export interface MyProfile {
  id: string;
  username: string;
  streak: number;
  habits_count: number;
  total_achievements: number;
}

export interface HabitLog {
  habit_id: string;
  name: string;
  icon: string;
  category: HabitCategory;
  day: string;
  done: boolean;
}

export const ACHIEVEMENT_CATEGORIES: {
  key: AchievementCategory;
  icon: string;
  color: string;
}[] = [
  { key: "دراسة", icon: "GraduationCap", color: "#22d3ee" },
  { key: "رياضة", icon: "Dumbbell", color: "#fb923c" },
  { key: "قرآن", icon: "BookOpen", color: "#a78bfa" },
  { key: "قراءة", icon: "BookMarked", color: "#38bdf8" },
  { key: "صحة", icon: "HeartPulse", color: "#fb7185" },
  { key: "مشروع شخصي", icon: "Rocket", color: "#f472b6" },
  { key: "تعلم مهارة", icon: "Lightbulb", color: "#fbbf24" },
  { key: "أخرى", icon: "Star", color: "#93a5b8" },
];

export const HABIT_LIBRARY: HabitLibraryItem[] = [
  { key: "fajr", name: "صلاة الفجر", icon: "Sunrise", category: "ديني" },
  { key: "salah", name: "الصلوات الخمس", icon: "Moon", category: "ديني" },
  { key: "quran", name: "ورد قرآني", icon: "BookOpen", category: "ديني" },
  { key: "adhkar", name: "الأذكار", icon: "Sparkles", category: "ديني" },
  { key: "study", name: "جلسة دراسة مركزة", icon: "GraduationCap", category: "دراسة" },
  { key: "review", name: "مراجعة الدروس", icon: "Repeat", category: "دراسة" },
  { key: "homework", name: "حل الواجبات", icon: "Pencil", category: "دراسة" },
  { key: "water", name: "شرب الماء", icon: "Droplets", category: "صحة" },
  { key: "sleep", name: "النوم المبكر", icon: "BedDouble", category: "صحة" },
  { key: "sport", name: "الرياضة", icon: "Dumbbell", category: "صحة" },
  { key: "walk", name: "المشي", icon: "Footprints", category: "صحة" },
  { key: "healthy", name: "أكل صحي", icon: "Apple", category: "صحة" },
  { key: "screens", name: "تقليل الشاشات", icon: "MonitorOff", category: "صحة" },
  { key: "reading", name: "قراءة", icon: "BookMarked", category: "تطوير ذاتي" },
  { key: "journal", name: "كتابة اليوميات", icon: "PenLine", category: "تطوير ذاتي" },
  { key: "learning", name: "تعلم ذاتي", icon: "Lightbulb", category: "تطوير ذاتي" },
  { key: "meditation", name: "تأمل وهدوء", icon: "Brain", category: "تطوير ذاتي" },
];

export const HABIT_CATEGORIES: HabitCategory[] = [
  "ديني",
  "دراسة",
  "صحة",
  "تطوير ذاتي",
];

export const CUSTOM_ICON_CHOICES: string[] = [
  "Sunrise",
  "Moon",
  "BookOpen",
  "Sparkles",
  "BedDouble",
  "Droplets",
  "Dumbbell",
  "BookMarked",
  "GraduationCap",
  "PenLine",
  "Lightbulb",
  "Footprints",
  "Brain",
  "Apple",
  "MonitorOff",
  "Repeat",
  "Target",
  "Flame",
  "HeartPulse",
  "Rocket",
  "Timer",
  "Award",
  "Leaf",
  "Coffee",
  "Bike",
  "ScrollText",
  "Music",
  "Palette",
  "Calculator",
  "Puzzle",
];