/**
 * جدولة الجولة — نسخة مطابقة حرفياً لـ round_total_seconds / round_focus_seconds
 * / round_state_at في Supabase (migration 20260929000001).
 *
 * القاعدة:
 *   duration_minutes = صافي وقت العمل.
 *   البريكات تُقذف فوقه ولا تُحتسب عملاً.
 *   مثال: 60د / بريك 5د كل 25د  ->  عمل 60د + بريكان (بعد 25د و 50د) = 70d.
 *
 * أي اختلاف بين هذه الدوال وقاعدة البيانات = مؤقّت يكذب. لذا تُختبَر
 * في src/test/roundSchedule.test.ts بنفس أرقام الـ SQL.
 */

/**
 * 10 نقاط كل ساعتين من زمن التواجد داخل الجولة (يطابق round_seconds_per_point).
 *   7200 ثانية ÷ 10 نقاط = 720 ثانية لكل نقطة.
 * الزمن المحتسب هو زمن التواجد كاملاً (حتى الاستراحات).
 */
export const SECONDS_PER_POINT = 720;

/** 10 نقاط كل ساعتين — الرقم الظاهر للمستخدم بجوار العداد */
export const POINTS_PER_BATCH = 10;

/** ثوانٍ كل دفعة نقاط = مدّة الساعتين */
export const SECONDS_PER_BATCH = 7200;

/** الرصيد الأساسي اليومي — لا يتجاوزه أي حد أقصى (يطابق round_base_balance) */
export const BASE_BALANCE = 50;

/** سقف الرصيد — بعده لا يُضاف شيء (يطابق round_max_balance) */
export const MAX_BALANCE = 100;

export interface RoundScheduleInput {
  started_at: string | null;
  duration_minutes: number;
  break_enabled: boolean;
  break_interval_minutes: number | null;
  break_duration_minutes: number | null;
}

export interface RoundState {
  /** الجولة بدأت فعلاً وتعمل الآن */
  started: boolean;
  inBreak: boolean;
  /** ثواني العمل المتبقية في الجولة كلها (بما فيها ما بعد أي بريك قادم) */
  workRemaining: number;
  /** ثواني البريك المتبقية (0 خارج البريك) */
  breakRemaining: number;
  /** إجمالي ثواني العمل في الجولة */
  totalWorkSeconds: number;
  /** إجمالي زمن الجولة بالثواني (عمل + بريكات) */
  totalWallSeconds: number;
  /** ثواني العمل المنقضية فعلياً (البريكات مستثناة) */
  focusElapsed: number;
  /** ثواني المتبقي حتى نهاية الجولة كلها (حتى لو كانت في بريك) */
  wallRemaining: number;
}

const hasBreaks = (i: RoundScheduleInput) =>
  !!i.break_enabled &&
  (i.break_interval_minutes ?? 0) > 0 &&
  (i.break_duration_minutes ?? 0) > 0;

/**
 * إجمالي زمن الجولة بالثواني = العمل + البريكات.
 * يطابق public.round_total_seconds في SQL.
 */
export function roundTotalSeconds(i: RoundScheduleInput): number {
  const work = Math.max(i.duration_minutes || 0, 0) * 60;
  if (!hasBreaks(i)) return work;

  const interval = (i.break_interval_minutes as number) * 60;
  const brk = (i.break_duration_minutes as number) * 60;

  const breaks = work > interval ? Math.floor((work - interval) / (interval + brk)) + 1 : 0;
  return work + breaks * brk;
}

/**
 * ثواني العمل المتبقية + هل نحن في بريك + البريك المتبقي.
 * يطابق public.round_state_at في SQL تماماً.
 */
export function roundStateAt(i: RoundScheduleInput, atMs: number): RoundState {
  const totalWork = Math.max(i.duration_minutes || 0, 0) * 60;
  const breaksOn = hasBreaks(i);
  const interval = breaksOn ? (i.break_interval_minutes as number) * 60 : totalWork;
  const brk = (i.break_duration_minutes ?? 0) * 60;

  const startMs = i.started_at ? new Date(i.started_at).getTime() : NaN;
  const started = Number.isFinite(startMs);
  const totalWall = roundTotalSeconds(i);

  const base: RoundState = {
    started,
    inBreak: false,
    workRemaining: totalWork,
    breakRemaining: 0,
    totalWorkSeconds: totalWork,
    totalWallSeconds: totalWall,
    focusElapsed: 0,
    wallRemaining: totalWall,
  };

  if (!started || totalWork <= 0) {
    return { ...base, workRemaining: 0, wallRemaining: 0 };
  }

  const wallRemaining = Math.max(0, totalWall - Math.max(0, (atMs - startMs) / 1000));
  if (atMs <= startMs) return { ...base, wallRemaining };

  let cursor = startMs;
  let workLeft = totalWork;
  let focusElapsed = 0;

  // نمرّ على مقاطع الجدولة بالترتيب
  while (workLeft > 0) {
    const chunk = Math.min(workLeft, interval);
    const segEnd = cursor + chunk * 1000;

    if (atMs < segEnd) {
      // داخل مقطع العمل.
      // workRemaining = كل العمل المتبقي في الجولة (لا جزء المقطع الحالي فقط)
      // ⇒ نفس المعنى في كل الحالات، ومطابق تماماً لـ round_state_at.
      const consumed = Math.max(0, (atMs - cursor) / 1000);
      return {
        ...base,
        inBreak: false,
        workRemaining: Math.max(0, Math.round(workLeft - consumed)),
        breakRemaining: 0,
        focusElapsed: Math.min(totalWork, Math.round(focusElapsed + consumed)),
        wallRemaining: Math.round(wallRemaining),
      };
    }

    focusElapsed += chunk;
    cursor = segEnd;
    workLeft -= chunk;

    if (breaksOn && workLeft > 0) {
      const breakEnd = cursor + brk * 1000;
      if (atMs < breakEnd) {
        // نحن داخل البريك
        return {
          ...base,
          inBreak: true,
          workRemaining: workLeft,
          breakRemaining: Math.round((breakEnd - atMs) / 1000),
          focusElapsed: Math.min(totalWork, Math.round(focusElapsed)),
          wallRemaining: Math.round(wallRemaining),
        };
      }
      cursor = breakEnd;
    }
  }

  // انتهى العمل
  return {
    ...base,
    inBreak: false,
    workRemaining: 0,
    breakRemaining: 0,
    focusElapsed: totalWork,
    wallRemaining: Math.round(wallRemaining),
  };
}

/** النقاط المستحقة من ثوانٍ عمل متحقَّقة — دالة حتمية بلا عشوائية */
export function pointsForFocusSeconds(focusSeconds: number): number {
  return Math.floor(Math.max(0, focusSeconds) / SECONDS_PER_POINT);
}

/**
 * إجمالي ثواني الراحة المتبقية في الجولة كلها = wallRemaining - workRemaining.
 * يُستعمل في العرض فقط: "كم بريكاً بقي؟" بدل تتبع مقطع كل بريك على حدة.
 */
export function breakSecondsLeft(st: RoundState): number {
  return Math.max(0, st.wallRemaining - st.workRemaining);
}

/** ثواني العمل المتبقية حتى النقطة التالية */
export function secondsToNextPoint(focusSeconds: number): number {
  return SECONDS_PER_POINT - (Math.max(0, focusSeconds) % SECONDS_PER_POINT);
}

/** "12:34" أو "1:02:03" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "1س 20د" — للعرض المختصر */
export function formatMinutes(totalSeconds: number): string {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  if (m < 60) return `${m} دقيقة`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}س ${rem}د` : `${h} ساعة`;
}
