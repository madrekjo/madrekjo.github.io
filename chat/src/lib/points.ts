import { supabase } from "@/integrations/supabase/client";

const MAX_BALANCE = 50;

export interface PointsInfo {
  balance: number;
  dailyResetAt: string | null;
  lastRewardedRoundAt: string | null;
}

export interface SpendResult {
  success: boolean;
  newBalance: number;
  errorMessage?: string;
}

/**
 * جلب رصيد المستخدم الحالي
 */
export async function fetchUserPoints(userId: string): Promise<PointsInfo> {
  const { data, error } = await supabase.rpc("get_user_points" as any, {
    p_user_id: userId,
  }).single();

  if (error || !data) {
    return { balance: 30, dailyResetAt: null, lastRewardedRoundAt: null };
  }

  return {
    balance: (data as any).balance ?? 30,
    dailyResetAt: (data as any).daily_reset_at ?? null,
    lastRewardedRoundAt: (data as any).last_rewarded_round_at ?? null,
  };
}

/**
 * خصم نقاط عند تنفيذ عملية مدفوعة
 * RPC: spend_points (Atomic — server-side only)
 */
export async function spendPoints(
  userId: string,
  amount: number,
  type: string,
  source?: string,
  metadata?: Record<string, unknown>
): Promise<SpendResult> {
  const { data, error } = await supabase.rpc("spend_points" as any, {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_source: source ?? null,
    p_metadata: metadata ? JSON.stringify(metadata) : null,
  }).single();

  if (error) {
    console.error("[Points] spendPoints error:", error);
    return { success: false, newBalance: 0, errorMessage: "خطأ في الخادم" };
  }

  const row = data as any;
  return {
    success: row?.success ?? false,
    newBalance: row?.new_balance ?? 0,
    errorMessage: row?.error_message ?? undefined,
  };
}

/**
 * مكافأة المشاركة في الجولة
 * RPC: reward_round_time (Atomic — server-side only)
 */
export async function rewardRoundTime(
  userId: string,
  roundId: string,
  startedAt: string,
  endedAt: string
): Promise<SpendResult & { pointsEarned: number }> {
  const { data, error } = await supabase.rpc("reward_round_time" as any, {
    p_user_id: userId,
    p_round_id: roundId,
    p_started_at: startedAt,
    p_ended_at: endedAt,
  }).single();

  if (error) {
    console.error("[Points] rewardRoundTime error:", error);
    return { success: false, newBalance: 0, errorMessage: "خطأ في الخادم", pointsEarned: 0 };
  }

  const row = data as any;
  return {
    success: row?.success ?? false,
    newBalance: row?.new_balance ?? 0,
    pointsEarned: row?.points_earned ?? 0,
    errorMessage: row?.error_message ?? undefined,
  };
}

/**
 * منح نقاط من Admin
 * RPC: grant_points (Atomic — server-side only)
 */
export async function grantPoints(
  adminId: string,
  targetUserId: string,
  amount: number,
  reason?: string
): Promise<SpendResult> {
  const { data, error } = await supabase.rpc("grant_points" as any, {
    p_admin_id: adminId,
    p_target_user_id: targetUserId,
    p_amount: amount,
    p_reason: reason ?? null,
  }).single();

  if (error) {
    console.error("[Points] grantPoints error:", error);
    return { success: false, newBalance: 0, errorMessage: "خطأ في الخادم" };
  }

  const row = data as any;
  return {
    success: row?.success ?? false,
    newBalance: row?.new_balance ?? 0,
    errorMessage: row?.error_message ?? undefined,
  };
}

/**
 * تكلفة العمليات
 */
export const POINT_COSTS = {
  post: 5,
  comment: 2,
  mention: 2,
  file: 5,
  image: 2,
  everyone: 10,
  round_message: 1,
  like: 0,
} as const;

export type PointCostType = keyof typeof POINT_COSTS;

/**
 * تحقق من الرصيد الكافي
 */
export function hasEnoughPoints(balance: number, type: PointCostType): boolean {
  return balance >= POINT_COSTS[type];
}

/**
 * حساب الوقت المتبقي للمكافأة التالية
 */
export function getNextRewardTimeLeft(lastRewardedAt: string | null): string | null {
  if (!lastRewardedAt) return null;
  const lastReward = new Date(lastRewardedAt).getTime();
  const nextRewardAt = lastReward + 2 * 60 * 60 * 1000; // +2 hours
  const now = Date.now();
  if (now >= nextRewardAt) return null; // eligible now
  const remaining = nextRewardAt - now;
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  if (hours > 0) return `${hours}س ${minutes}د`;
  return `${minutes}د`;
}

export { MAX_BALANCE };
