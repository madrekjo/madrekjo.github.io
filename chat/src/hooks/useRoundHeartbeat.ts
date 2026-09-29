import { useCallback, useEffect, useRef, useState } from "react";
import { usePoints } from "@/contexts/PointsContext";
import type { RoundHeartbeat } from "@/lib/points";

/** كل 30 ثانية — مطابق لسقف الإدماج في الخادم (120 ث لكل نبضة) */
export const BEAT_INTERVAL_MS = 30_000;

export interface LiveRound {
  /** ثواني العمل المُثبتة من الخادم */
  serverFocus: number;
  /** العرض اللحظي = الخادم + ما انقضى منذ آخر نبضة (داخل نافذة الإدماج) */
  liveFocus: number;
  /** النقاط التي نالها المستخدم فعلياً في هذه الجولة */
  points: number;
  inBreak: boolean;
  isActive: boolean;
  workRemaining: number;
  breakRemaining: number;
  totalWork: number;
  /** null = ما زال باقياً للم\fi والنقطة التالية متاحة، 0 = عند السقف */
  nextPointIn: number | null;
  balance: number;
  error: string | null;
  settled: boolean;
}

const EMPTY: LiveRound = {
  serverFocus: 0,
  liveFocus: 0,
  points: 0,
  inBreak: false,
  isActive: false,
  workRemaining: 0,
  breakRemaining: 0,
  totalWork: 0,
  nextPointIn: null,
  balance: 0,
  error: null,
  settled: false,
};

/**
 * نبضة حضور الجولة.
 *
 * القواعد (مطابقة لـ round_heartbeat في الخادم):
 *  - لا نبضة والتبويب مخفي (الانصراف = لا احتساب).
 *  - الخادم هو من يحسب الثواني، لا ساعة الجهاز.
 *  - نبضة أخيرة عند الخروج حتى لا يضيع ما تم احتسابه.
 */
export function useRoundHeartbeat(enabled: boolean, roundId: string | null) {
  const { heartbeat } = usePoints();
  const [live, setLive] = useState<LiveRound>(EMPTY);
  const [beating, setBeating] = useState(false);

  const lastBeatAt = useRef<number>(0);
  const roundIdRef = useRef<string | null>(roundId);
  roundIdRef.current = roundId;

  const beat = useCallback(
    async (opts: { final?: boolean } = {}) => {
      const id = roundIdRef.current;
      if (!id) return;
      setBeating(true);
      try {
        const res = await heartbeat(id);
        if (res) {
          lastBeatAt.current = Date.now();
          setLive({
            serverFocus: res.focus_seconds ?? 0,
            liveFocus: res.focus_seconds ?? 0,
            points: res.round_points ?? 0,
            inBreak: !!res.in_break,
            isActive: !!res.is_active,
            workRemaining: res.work_remaining_seconds ?? 0,
            breakRemaining: res.break_remaining_seconds ?? 0,
            totalWork: res.total_work_seconds ?? 0,
            nextPointIn: res.next_point_in_seconds ?? null,
            balance: res.new_balance ?? 0,
            error: res.error_message ?? null,
            settled: res.ok && !res.is_active,
          });
        }
      } catch (err) {
        console.error("[round-heartbeat]", err);
      } finally {
        setBeating(false);
        void opts.final;
      }
    },
    [heartbeat]
  );

  // نبضة فورية عند الدخول + نبضة أخيرة عند الخروج
  useEffect(() => {
    if (!enabled || !roundId) {
      // لا نبضة بلا جلسة ⇒ لا تُعرض أرقام جولة سابقة على جولة جديدة
      lastBeatAt.current = 0;
      setLive(EMPTY);
      return;
    }
    void beat();
    return () => {
      void beat({ final: true });
    };
  }, [enabled, roundId, beat]);

  // إيقاع ثابت، ويتوقف فوراً عند إخفاء التبويب
  useEffect(() => {
    if (!enabled || !roundId) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let lastVisibleBeat = 0;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastVisibleBeat < BEAT_INTERVAL_MS) return;
      lastVisibleBeat = Date.now();
      void beat();
    };

    const start = () => {
      if (timer) return;
      lastVisibleBeat = Date.now() - BEAT_INTERVAL_MS; // نبضة أولى فورية
      timer = setInterval(tick, 5_000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void beat();
        lastVisibleBeat = Date.now();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [enabled, roundId, beat]);

  // عدّاد حيّ بين النبضات: يعرض ما سيحتسبه الخادم فعلاً
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      setLive(prev => {
        if (prev.inBreak || !prev.isActive || !lastBeatAt.current) return prev;
        // الخادم يقصّ الإدماج عند 120 ثانية لكل نبضة
        const since = Math.min((Date.now() - lastBeatAt.current) / 1000, 120);
        const liveFocus = Math.min(
          prev.serverFocus + since,
          prev.totalWork || Number.POSITIVE_INFINITY
        );
        if (Math.abs(liveFocus - prev.liveFocus) < 0.5) return prev;
        return { ...prev, liveFocus };
      });
    }, 1_000);
    return () => clearInterval(t);
  }, [enabled]);

  return { live, beat, beating };
}
