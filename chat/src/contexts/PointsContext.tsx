import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchUserPoints,
  spendPoints,
  rewardRoundTime,
  POINT_COSTS,
  type PointCostType,
  type PointsInfo,
  type SpendResult,
} from "@/lib/points";

interface PointsContextType {
  balance: number;
  dailyResetAt: string | null;
  lastRewardedRoundAt: string | null;
  loading: boolean;
  spend: (amount: number, type: PointCostType, source?: string, metadata?: Record<string, unknown>) => Promise<SpendResult>;
  rewardRound: (roundId: string, startedAt: string, endedAt: string) => Promise<SpendResult & { pointsEarned: number }>;
  refreshPoints: () => Promise<void>;
  getCost: (type: PointCostType) => number;
}

const PointsContext = createContext<PointsContextType | undefined>(undefined);

export function PointsProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, isStaff } = useAuth();
  const [points, setPoints] = useState<PointsInfo>({
    balance: 30,
    dailyResetAt: null,
    lastRewardedRoundAt: null,
  });
  const [loading, setLoading] = useState(true);

  const refreshPoints = useCallback(async () => {
    if (!user) return;
    try {
      const info = await fetchUserPoints(user.id);
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

      const result = await spendPoints(user.id, amount, type, source, metadata);
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

      const result = await rewardRoundTime(user.id, roundId, startedAt, endedAt);
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

  return (
    <PointsContext.Provider
      value={{
        balance: points.balance,
        dailyResetAt: points.dailyResetAt,
        lastRewardedRoundAt: points.lastRewardedRoundAt,
        loading,
        spend,
        rewardRound,
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
