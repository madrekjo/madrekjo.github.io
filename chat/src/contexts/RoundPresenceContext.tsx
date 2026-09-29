import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePoints } from "@/contexts/PointsContext";

/** كل 30 ثانية — يطابق نافذة السقف في الخادم */
export const BEAT_INTERVAL_MS = 30_000;

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

interface RoundPresenceType {
  /** الجولة التي ضغط المستخدم "دخول" فيها (تبقى محفوظة بين الصفحات) */
  joinedRoundId: string | null;
  joined: boolean;
  join: (roundId: string) => void;
  leave: () => void;
  live: LiveRound;
  beat: () => void;
  beating: boolean;
}

const RoundPresenceContext = createContext<RoundPresenceType | undefined>(undefined);

/**
 * حضور الجولة — يعمل طوال فترة فتح التطبيق، لا داخل صفحة الجولات فقط.
 *
 * القاعدة الجديدة: ما دام التطبيق مفتوح تُحتسب الجولة، حتى لو غيّر المستخدم
 * التبويب أو تنقّل بالموقع. الإيقاف يكون بضغط زر "خروج" أو بإغلاق المتصفح
 * (بعد نافذة السماح في الخادم).
 */
export function RoundPresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { heartbeat } = usePoints();
  const [joinedRoundId, setJoinedRoundId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveRound>(EMPTY);
  const [beating, setBeating] = useState(false);

  const lastBeatAt = useRef<number>(0);
  const joinedRef = useRef<string | null>(null);
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
          // انتهت الجولة: ننظّف الجلسة المحفوظة حتى لا ننبض على جولة مغلقة
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
            settled: res.ok && !res.is_active,
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

  const join = useCallback((roundId: string) => {
    setJoinedRoundId(roundId);
    try {
      localStorage.setItem(JOINED_KEY, roundId);
    } catch {
      /* التخزين معطّل — نكتفي بالذاكرة */
    }
  }, []);

  const leave = useCallback(() => {
    const current = joinedRef.current;
    if (current) void beat(current); // نبضة أخيرة حتى لا يضيع المحتسب
    setJoinedRoundId(null);
    setLive(EMPTY);
    lastBeatAt.current = 0;
    try {
      localStorage.removeItem(JOINED_KEY);
    } catch {
      /* تجاهل */
    }
  }, [beat]);

  // استعادة الجلسة بعد تحديث الصفحة أو إعادة الفتح
  useEffect(() => {
    if (!user) {
      setJoinedRoundId(null);
      setLive(EMPTY);
      return;
    }
    try {
      const saved = localStorage.getItem(JOINED_KEY);
      if (saved) setJoinedRoundId(saved);
    } catch {
      /* تجاهل */
    }
  }, [user?.id]);

  // تصفير كامل عند تبديل الجولة فقط
  useEffect(() => {
    lastBeatAt.current = 0;
    setLive(EMPTY);
  }, [joinedRoundId]);

  // نبضة فورية عند الدخول، ثم إيقاع ثابت **بدون** شرط مرئية التبويب
  useEffect(() => {
    if (!user || !joinedRoundId) return;
    const id = joinedRoundId;
    void beat(id);

    let lastBeat = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - lastBeat < BEAT_INTERVAL_MS) return;
      lastBeat = Date.now();
      void beat(id);
    }, 5_000);

    // العودة للتبويب: نبضة فورية تُعوّض الفاصل
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        lastBeat = Date.now();
        void beat(id);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    // إغلاق/إخفاء الصفحة: نبضة أخيرة (best-effort)
    const onPageHide = () => {
      if (document.visibilityState === "hidden") void beat(id);
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onPageHide);
      clearInterval(timer);
      void beat(id);
    };
  }, [user, joinedRoundId, beat]);

  // عدّاد حيّ بين النبضات
  useEffect(() => {
    if (!joinedRoundId) return;
    const t = setInterval(() => {
      setLive(prev => {
        if (!prev.isActive || !lastBeatAt.current) return prev;
        const since = Math.min((Date.now() - lastBeatAt.current) / 1000, 600);
        const liveFocus = prev.serverFocus + since;
        if (Math.abs(liveFocus - prev.liveFocus) < 0.5) return prev;
        return { ...prev, liveFocus };
      });
    }, 1_000);
    return () => clearInterval(t);
  }, [joinedRoundId]);

  const value = useMemo<RoundPresenceType>(
    () => ({
      joinedRoundId,
      joined: !!joinedRoundId,
      join,
      leave,
      live,
      beat: () => void beat(),
      beating,
    }),
    [joinedRoundId, join, leave, live, beat, beating]
  );

  return (
    <RoundPresenceContext.Provider value={value}>{children}</RoundPresenceContext.Provider>
  );
}

export function useRoundPresence(): RoundPresenceType {
  const ctx = useContext(RoundPresenceContext);
  if (!ctx) throw new Error("useRoundPresence must be used within RoundPresenceProvider");
  return ctx;
}

