import { describe, it, expect } from "vitest";
import {
  roundTotalSeconds,
  roundStateAt,
  breakSecondsLeft,
  pointsForFocusSeconds,
  secondsToNextPoint,
  formatDuration,
  BASE_BALANCE,
  MAX_BALANCE,
  SECONDS_PER_POINT,
  SECONDS_PER_BATCH,
  POINTS_PER_BATCH,
  type RoundScheduleInput,
} from "@/lib/roundSchedule";

/**
 * هذه الأرقام مأخوذة مباشرة من نفس المعادلات في
 * supabase/migrations/20260929000001_rounds_real_scoring.sql
 * (round_total_seconds / round_focus_seconds / round_state_at).
 *
 * هدف الملف: لو اختلف أي حساب في الواجهة عن الخادم، يفشل الاختبار.
 * لأن المؤقّت الكاذب هو أصل معظم أخطاء "النقاط العشوائية".
 */

const min = (m: number) => m * 60;

const BASE = "2026-01-01T08:00:00.000Z";
const at = (secondsFromStart: number) =>
  new Date(new Date(BASE).getTime() + secondsFromStart * 1000);

/** 60 دقيقة عمل، بريك 5 دقائق كل 25 دقيقة عمل */
const WITH_BREAKS: RoundScheduleInput = {
  started_at: BASE,
  duration_minutes: 60,
  break_enabled: true,
  break_interval_minutes: 25,
  break_duration_minutes: 5,
};

/** 60 دقيقة عمل بلا بريك */
const NO_BREAKS: RoundScheduleInput = {
  started_at: BASE,
  duration_minutes: 60,
  break_enabled: false,
  break_interval_minutes: null,
  break_duration_minutes: null,
};

describe("ثوابت النظام (يطابق SQL)", () => {
  it("نقطة كل 6 دقائق، أساس 100، سقف 200", () => {
    expect(SECONDS_PER_POINT).toBe(360);
    expect(BASE_BALANCE).toBe(100);
    expect(MAX_BALANCE).toBe(200);
  });
});

describe("roundTotalSeconds — إجمالي زمن الجولة", () => {
  it("بلا بريك = صافي العمل", () => {
    expect(roundTotalSeconds(NO_BREAKS)).toBe(min(60));
  });

  it("60د + بريك 5د كل 25د = 70د (بريكان: بعد 25 و بعد 50)", () => {
    expect(roundTotalSeconds(WITH_BREAKS)).toBe(min(70));
  });

  it("لا بريك إذا كان العمل أقصر من الفترة", () => {
    expect(roundTotalSeconds({ ...NO_BREAKS, duration_minutes: 20 })).toBe(min(20));
  });

  it("بريك واحد فقط إذا انتهى العمل عند نهاية الفترة", () => {
    // 30 دقيقة عمل، بريك 5 كل 25 ⇒ بريك واحد فقط ⇒ 35 دقيقة
    expect(
      roundTotalSeconds({
        ...NO_BREAKS,
        duration_minutes: 30,
        break_enabled: true,
        break_interval_minutes: 25,
        break_duration_minutes: 5,
      })
    ).toBe(min(35));
  });

  it("مدة صفرية أو مدخلات ناقصة لا تنهار", () => {
    expect(
      roundTotalSeconds({
        started_at: null,
        duration_minutes: 0,
        break_enabled: true,
        break_interval_minutes: 0,
        break_duration_minutes: 0,
      })
    ).toBe(0);
  });
});

describe("roundStateAt — حالة الجولة", () => {
  it("قبل البدء: لا عمل ولا بريك", () => {
    const st = roundStateAt({ ...NO_BREAKS, started_at: null }, Date.now());
    expect(st.started).toBe(false);
    expect(st.workRemaining).toBe(0);
    expect(st.wallRemaining).toBe(0);
  });

  it("بلا بريك: العمل المتبقي = الكل ناقص المنقضي", () => {
    expect(roundStateAt(NO_BREAKS, at(0).getTime()).workRemaining).toBe(min(60));
    expect(roundStateAt(NO_BREAKS, at(min(20)).getTime()).workRemaining).toBe(min(40));
    expect(roundStateAt(NO_BREAKS, at(min(60)).getTime()).workRemaining).toBe(0);
  });

  it("البريكات لا تُحتسب عملاً: داخل أول بريك العمل ما زال 35 دقيقة", () => {
    // 25 دقيقة عمل منتهت، البريك من 25 إلى 30
    const st = roundStateAt(WITH_BREAKS, at(min(26)).getTime());
    expect(st.inBreak).toBe(true);
    expect(st.breakRemaining).toBe(min(4));
    expect(st.workRemaining).toBe(min(35)); // 60 - 25 عمل فقط
    expect(st.focusElapsed).toBe(min(25));
  });

  it("البريك الثاني يبدأ بعد 50 دقيقة عمل (55 على الأرض)", () => {
    const st = roundStateAt(WITH_BREAKS, at(min(56)).getTime());
    expect(st.inBreak).toBe(true);
    expect(st.breakRemaining).toBe(min(4));
    expect(st.workRemaining).toBe(min(10)); // 50 دقيقة عمل منجزة من أصل 60
    expect(st.focusElapsed).toBe(min(50));
  });

  it("عودة للعمل: workRemaining = كل العمل المتبقي (ليس جزء المقطع)", () => {
    // t=35: العمل المنقضي 30 دقيقة ⇒ المتبقي 30، لا 25 (طول المقطع)
    const st = roundStateAt(WITH_BREAKS, at(min(35)).getTime());
    expect(st.inBreak).toBe(false);
    expect(st.focusElapsed).toBe(min(30));
    expect(st.workRemaining).toBe(min(30));
    expect(st.wallRemaining).toBe(min(35)); // 30 عمل + 5 بريك
    expect(breakSecondsLeft(st)).toBe(min(5));
  });

  it("نهاية المقطع: العمل المتبقي = 35 دقيقة، والباقي بعد البريك", () => {
    // t=25 بالضبط: انتهى المقطع، نحن في بداية البريك
    const st = roundStateAt(WITH_BREAKS, at(min(25)).getTime());
    expect(st.inBreak).toBe(true);
    expect(st.breakRemaining).toBe(min(5));
    expect(st.workRemaining).toBe(min(35));
  });

  it("بعد آخر بريك: 10 دقائق عمل متبقية بلا بريكات", () => {
    const st = roundStateAt(WITH_BREAKS, at(min(62)).getTime());
    expect(st.inBreak).toBe(false);
    expect(st.workRemaining).toBe(min(8));
    expect(breakSecondsLeft(st)).toBe(0);
  });

  it("انتهى كل شيء عند 70 دقيقة", () => {
    const st = roundStateAt(WITH_BREAKS, at(min(70)).getTime());
    expect(st.workRemaining).toBe(0);
    expect(st.breakRemaining).toBe(0);
    expect(st.wallRemaining).toBe(0);
    expect(st.focusElapsed).toBe(min(60));
  });

  it("تجاوز النهاية لا يعطي أرقاماً سالبة", () => {
    const st = roundStateAt(WITH_BREAKS, at(min(500)).getTime());
    expect(st.workRemaining).toBe(0);
    expect(st.wallRemaining).toBe(0);
    expect(st.focusElapsed).toBe(min(60));
  });

  it("ساعة عميل متأخرة لا تُنتج عملاً سالباً", () => {
    const st = roundStateAt(WITH_BREAKS, at(-600).getTime());
    expect(st.workRemaining).toBe(min(60));
    expect(st.wallRemaining).toBe(min(70));
  });
});

describe("النقاط — دالة حتمية على الثواني", () => {
  it("نقطة واحدة كل 6 دقائق (360 ثانية) بالضبط", () => {
    expect(pointsForFocusSeconds(0)).toBe(0);
    expect(pointsForFocusSeconds(359)).toBe(0);
    expect(pointsForFocusSeconds(360)).toBe(1);
    expect(pointsForFocusSeconds(719)).toBe(1);
    expect(pointsForFocusSeconds(720)).toBe(2);
  });

  it("20 نقطة كل ساعتين بالضبط — الشرط المطلوب", () => {
    expect(SECONDS_PER_BATCH).toBe(7200);
    expect(POINTS_PER_BATCH).toBe(20);
    expect(pointsForFocusSeconds(SECONDS_PER_BATCH)).toBe(POINTS_PER_BATCH);
    expect(pointsForFocusSeconds(SECONDS_PER_BATCH - 1)).toBe(POINTS_PER_BATCH - 1);
    expect(pointsForFocusSeconds(SECONDS_PER_BATCH * 2)).toBe(POINTS_PER_BATCH * 2);
  });

  it("نفس الثانية تعطي دائماً نفس النقاط (لا عشوائية)", () => {
    const samples = [0, 61, 600, 720, 1440, 3600, 7200];
    const first = samples.map(pointsForFocusSeconds);
    samples.forEach((s, i) => expect(pointsForFocusSeconds(s)).toBe(first[i]));
  });

  it("لا نقاط من الثواني السالبة", () => {
    expect(pointsForFocusSeconds(-5000)).toBe(0);
  });

  it("الوقت المتبقي للنقطة التالية", () => {
    expect(secondsToNextPoint(0)).toBe(SECONDS_PER_POINT);
    expect(secondsToNextPoint(120)).toBe(240);
    expect(secondsToNextPoint(360)).toBe(SECONDS_PER_POINT); // وصل لنقطة بالضبط
  });

  it("الزمن الكامل يُحتسب: استراحة الجولة تحسب مع العمل", () => {
    // جولة 60د مع استراحتين = 70 دقيقة زمن فعلي ⇒ 70*60 = 4200 ثانية
    expect(roundTotalSeconds(WITH_BREAKS)).toBe(4200);
    // 4200 ÷ 360 = 11 نقطة (وليس 3600÷360 = 10 لأن الاستراحات تُحتسب أيضاً)
    expect(pointsForFocusSeconds(roundTotalSeconds(WITH_BREAKS))).toBe(11);
    expect(pointsForFocusSeconds(4200)).toBe(11);
  });

  it("نقطة كل 6 دقائق ⇒ 10 نقاط لكل ساعة", () => {
    expect(pointsForFocusSeconds(3600)).toBe(10);
  });
});

describe("formatDuration", () => {
  it("صيغة الدقائق والثواني", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(min(9) + 59)).toBe("09:59");
  });

  it("صيغة الساعات", () => {
    expect(formatDuration(min(70))).toBe("1:10:00");
  });
});
