import { useCallback, useEffect, useRef, useState } from "react";
import { usePoints } from "@/contexts/PointsContext";

/** مهلة المزامنة التلقائية — عرض فقط، الاحتساب كله على الخادم */
const SYNC_EVERY_MS = 10 * 60_000;

const JOINED_KEY = "rounds:joined_round";

export interface LiveRound {
  serverFocus: number;
  liveFocus: number;
  points: number;
  inBreak: boolean;
  isActive: boolean;
  workRemaining: number;
  breakRemaining: number;
  totalWork: number;
  nextPointIn: number | null;
  balance: number;
  error: string | null;
  scheduledEndAt: string | null;
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
  scheduledEndAt: null,
};

/**
 * حضور الجولة — بلا نبض متكرر.
 *
 * القاعدة: دخول واحد إلى الجولة، والخادم يحسب الوقت من لحظة الدخول حتى
 * نهاية الجولة (10 نقاط كل ساعة). لا يُقطع الاحتساب بتبديل التبويب أو
 * التنقّل بالموقع، والإرسال للمخدم فقط عند: الدخول، فتح الصفحة، العودة
 * للتبويب، وكل 10 دقائق كحد أقصى — لا 120 طلباً في الساعة.
 */
export function useRoundPresence() {
  const { heartbeat } = usePoints();
  const [joinedRoundId, setJoinedRoundId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(JOINED_KEY);
    } catch {
      return null;
    }
  });
  const [live, setLive] = useState<LiveRound>(EMPTY);
  const [beating, setBeating] = useState(false);

  const lastBeatAt = useRef<number>(0);
  const joinedRef = useRef<string | null>(joinedRoundId);
  joinedRef.current = joinedRoundId;

  const beat = useCallback(
    async (id?: string) => {
      const target = id || joinedRef.current;
      if (!target) return;
      setBeating(true);
      try {
        const res = await heartbeat(target);
        if (res) {
          lastBeatAt.current = Date.now();
          // انتهت الجولة: ننظّف الحالة المحفوظة
          if (res.ok && res.scheduled_end_at) {
            const ended = new Date(res.scheduled_end_at).getTime();
            if (ended && ended <= Date.now() && joinedRef.current === target) {
              setJoinedRoundId(null);
              try {
                localStorage.removeItem(JOINED_KEY);
              } catch {
                /* تجاهل */
              }
            }
          }
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
            scheduledEndAt: res.scheduled_end_at ?? null,
          });
        }
      } catch (err) {
        console.error("[round-presence]", err);
      } finally {
        setBeating(false);
      }
    },
    [heartbeat]
  );

  const join = useCallback(
    (roundId: string) => {
      setJoinedRoundId(roundId);
      try {
        localStorage.setItem(JOINED_KEY, roundId);
      } catch {
        /* تجاهل */
      }
      setLive(EMPTY);
      void beat(roundId);
    },
    [beat]
  );

  const leave = useCallback(() => {
    const current = joinedRef.current;
    if (current) void beat(current); // طلب أخير واحد فقط ليأخذ حقه كاملاً
    setJoinedRoundId(null);
    setLive(EMPTY);
    lastBeatAt.current = 0;
    try {
      localStorage.removeItem(JOINED_KEY);
    } catch {
      /* تجاهل */
    }
  }, [beat]);

  // مزامنة عند فتح الصفحة + عند العودة للتبويب + كل 10 دقائق كحد أقصى
  useEffect(() => {
    if (!joinedRoundId) return;
    const id = joinedRoundId;
    void beat(id);

    const onVisible = () => {
      if (document.visibilityState === "visible") void beat(id);
    };
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(() => void beat(id), SYNC_EVERY_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [joinedRoundId, beat]);

  // عدّاد العرض: يتحرّك محلياً بلا أي طلب
  useEffect(() => {
    if (!joinedRoundId) return;
    const t = setInterval(() => {
      setLive(prev => {
        if (!prev.isActive || !lastBeatAt.current) return prev;
        const since = Math.min((Date.now() - lastBeatAt.current) / 1000, SYNC_EVERY_MS / 1000);
        const liveFocus = prev.serverFocus + since;
        if (Math.abs(liveFocus - prev.liveFocus) < 0.5) return prev;
        return { ...prev, liveFocus };
      });
    }, 1_000);
    return () => clearInterval(t);
  }, [joinedRoundId]);

  return {
    joinedRoundId,
    joined: !!joinedRoundId,
    join,
    leave,
    live,
    beat: () => void beat(),
    beating,
  };
}
