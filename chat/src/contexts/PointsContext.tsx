import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchUserPoints,
  spendPoints,
  rewardRoundTime,
  roundHeartbeat,
  startRound,
  settleRound,
  roundLeaderboard,
  POINT_COSTS,
  type PointCostType,
  type PointsInfo,
  type RoundHeartbeat,
  type RoundLeaderboardRow,
  type SpendResult,
} from "@/lib/points";

interface PointsContextType {
  balance: number;
  dailyResetAt: string | null;
  lastRewardedRoundAt: string | null;
  loading: boolean;
  spend: (amount: number, type: PointCostType, source?: string, metadata?: Record<string, unknown>) => Promise<SpendResult>;
  rewardRound: (roundId: string, startedAt: string, endedAt: string) => Promise<SpendResult & { pointsEarned: number }>;
  heartbeat: (roundId: string) => Promise<RoundHeartbeat | null>;
  startRound: (roundId: string) => Promise<{ success: boolean; startedAt: string | null; scheduledEndAt: string | null; errorMessage?: string }>;
  settleRound: (roundId: string) => Promise<{ success: boolean; participants: number; errorMessage?: string }>;
  leaderboard: (roundId: string) => Promise<RoundLeaderboardRow[]>;
  refreshPoints: () => Promise<void>;
  getCost: (type: PointCostType) => number;
}

const PointsContext = createContext<PointsContextType | undefined>(undefined);

export function PointsProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, isStaff } = useAuth();
  const [points, setPoints] = useState<PointsInfo>({
    balance: 50,
    dailyResetAt: null,
    lastRewardedRoundAt: null,
  });
  const [loading, setLoading] = useState(true);

  const refreshPoints = useCallback(async () => {
    if (!user) return;
    try {
      const info = await fetchUserPoints();
      setPoints(info);
    } catch (err) {
      console.error("[PointsContext] Failed to fetch points:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void refreshPoints();
  }, [user, refreshPoints]);

  const spend = useCallback(
    async (
      amount: number,
      type: PointCostType,
      source?: string,
      metadata?: Record<string, unknown>
    ): Promise<SpendResult> => {
      if (!user) return { success: false, newBalance: 0, errorMessage: "غير مسجل الدخول" };

      // Admin/Staff: لا خصم
      if (isAdmin || isStaff) {
        return { success: true, newBalance: points.balance };
      }

      const result = await spendPoints(amount, type, source, metadata);
      if (result.success) {
        setPoints(prev => ({ ...prev, balance: result.newBalance }));
      }
      return result;
    },
    [user, isAdmin, isStaff, points.balance]
  );

  const rewardRound = useCallback(
    async (
      roundId: string,
      startedAt: string,
      endedAt: string
    ): Promise<SpendResult & { pointsEarned: number }> => {
      if (!user) return { success: false, newBalance: 0, errorMessage: "غير مسجل الدخول", pointsEarned: 0 };

      const result = await rewardRoundTime(roundId, startedAt, endedAt);
      if (result.success) {
        setPoints(prev => ({ ...prev, balance: result.newBalance }));
      }
      return result;
    },
    [user]
  );

  const getCost = useCallback((type: PointCostType): number => {
    return POINT_COSTS[type];
  }, []);

  // نبضة الحضور: الرصيد يُحدَّث من رقم الخادم دائماً (لا رقم مُقدَّر)
  const heartbeat = useCallback(async (roundId: string): Promise<RoundHeartbeat | null> => {
    const res = await roundHeartbeat(roundId);
    if (res?.ok && typeof res.new_balance === "number") {
      setPoints(prev => ({ ...prev, balance: res.new_balance }));
    }
    return res;
  }, []);

  const start = useCallback(async (roundId: string) => {
    const res = await startRound(roundId);
    if (res.success) await refreshPoints();
    return res;
  }, [refreshPoints]);

  const settle = useCallback(async (roundId: string) => {
    const res = await settleRound(roundId);
    if (res.success) await refreshPoints();
    return res;
  }, [refreshPoints]);

  const leaderboard = useCallback((roundId: string) => roundLeaderboard(roundId), []);

  return (
    <PointsContext.Provider
      value={{
        balance: points.balance,
        dailyResetAt: points.dailyResetAt,
        lastRewardedRoundAt: points.lastRewardedRoundAt,
        loading,
        spend,
        rewardRound,
        heartbeat,
        startRound: start,
        settleRound: settle,
        leaderboard,
        refreshPoints,
        getCost,
      }}
    >
      {children}
    </PointsContext.Provider>
  );
}

export function usePoints() {
  const context = useContext(PointsContext);
  if (!context) {
    throw new Error("usePoints must be used within PointsProvider");
  }
  return context;
}
