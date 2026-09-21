export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function todayKey(): string {
  return toKey(new Date());
}

/** بداية الأسبوع: الأحد */
export function weekStart(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - c.getDay());
  return c;
}

export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export const ARABIC_DAY = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

export const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export function arabicDayName(d: Date): string {
  return ARABIC_DAY[d.getDay()];
}

export function monthLabel(d: Date): string {
  return `${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function relativeLabel(key: string): string {
  const today = fromKey(todayKey());
  const day = fromKey(key);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "أمس";
  if (diff === 2) return "أول أمس";
  return "";
}

export function diffDays(from: Date, to: Date): number {
  return Math.round(
    (new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() -
      new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) /
      86400000
  );
}

/** لون مؤشر حسب الدرجة */
export function scoreColor(score: number): string {
  if (score >= 85) return "rgb(var(--score-best))";
  if (score >= 60) return "rgb(var(--score-good))";
  if (score >= 40) return "rgb(var(--score-low))";
  return "rgb(var(--score-min))";
}

/** قنوات RGB للدرجة (لتركيب rgba مع شفافية) */
export function scoreRGB(score: number): string {
  if (score >= 85) return "var(--score-best)";
  if (score >= 60) return "var(--score-good)";
  if (score >= 40) return "var(--score-low)";
  return "var(--score-min)";
}

export function scoreLabel(score: number, active: boolean): string {
  if (!active) return "يوم بلا رصيد";
  if (score >= 85) return "يوم استثنائي";
  if (score >= 70) return "يوم قوي";
  if (score >= 50) return "يوم جيد";
  if (score >= 30) return "بداية تحتاج دفع";
  return "خطوة صغيرة — سجّلها";
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "وقت الاستغفار";
  if (h < 12) return "صباح الخير";
  if (h < 18) return "مساء الخير";
  return "مساء النشاط";
}

/** متوسط نقاط الأيام النشطة */
export function weekAvg(points: DayPointLite[]): number {
  const active = points.filter((p) => p.active);
  if (!active.length) return 0;
  return Math.round(active.reduce((s, p) => s + p.score, 0) / active.length);
}

/** التزام العادات في أسبوع أو فترة */
export function commitmentAvg(points: DayPointLite[]): number {
  const daysWithHabits = points.filter((p) => p.habits_total > 0);
  if (!daysWithHabits.length) return 0;
  const sum = daysWithHabits.reduce(
    (s, p) => s + Math.round((p.habits_done / p.habits_total) * 100),
    0
  );
  return Math.round(sum / daysWithHabits.length);
}

interface DayPointLite {
  day: string;
  score: number;
  habits_done: number;
  habits_total: number;
  achievement_count: number;
  active: boolean;
}