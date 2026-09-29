import { supabase } from "@/integrations/supabase/client";
import { BASE_BALANCE, MAX_BALANCE, SECONDS_PER_POINT, SECONDS_PER_BATCH, POINTS_PER_BATCH } from "@/lib/roundSchedule";

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
export async function fetchUserPoints(): Promise<PointsInfo> {
  const { data, error } = await supabase.rpc("get_user_points" as any).single();

  if (error || !data) {
    return { balance: BASE_BALANCE, dailyResetAt: null, lastRewardedRoundAt: null };
  }

  return {
    balance: (data as any).balance ?? BASE_BALANCE,
    dailyResetAt: (data as any).daily_reset_at ?? null,
    lastRewardedRoundAt: (data as any).last_rewarded_round_at ?? null,
  };
}

/**
 * خصم نقاط عند تنفيذ عملية مدفوعة
 * RPC: spend_points (Atomic — server-side only)
 */
export async function spendPoints(
  amount: number,
  type: string,
  source?: string,
  metadata?: Record<string, unknown>
): Promise<SpendResult> {
  const { data, error } = await supabase.rpc("spend_points" as any, {
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
 *
 * ملاحظة: الدالة تتجاهل طابعَي p_started_at / p_ended_at اللذين
 * يرسلهما العميل تماماً. النقاط تُحسب من سجل الحضور الحقيقي
 * (round_presence) عبر نبضة round_heartbeat، فبإرسال أي تاريخ
 * مستقبلي لم يعد هناك ما يُمنح. هذه الدالة صارت للتوافق فقط
 * وتُبلّغ بالرقم الذي نالوه فعلياً.
 */
export async function rewardRoundTime(
  roundId: string,
  startedAt: string,
  endedAt: string
): Promise<SpendResult & { pointsEarned: number }> {
  const { data, error } = await supabase.rpc("reward_round_time" as any, {
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

/** ما يرسله الخادم في كل نبضة حضور */
export interface RoundHeartbeat {
  ok: boolean;
  error_message: string | null;
  is_active: boolean;
  in_break: boolean;
  work_remaining_seconds: number;
  break_remaining_seconds: number;
  total_work_seconds: number;
  focus_seconds: number;
  round_points: number;
  new_balance: number;
  next_point_in_seconds: number | null;
  scheduled_end_at: string | null;
}

/**
 * نبضة الحضور — تُستدعى كل 30 ثانية والتبويب مرئي فقط.
 * الخادم يحسب كل شيء من now(): لا ساعة العميل ولا توقيتاته.
 */
export async function roundHeartbeat(roundId: string): Promise<RoundHeartbeat | null> {
  const { data, error } = await supabase.rpc("round_heartbeat" as any, {
    p_round_id: roundId,
  }).single();

  if (error || !data) {
    console.error("[Points] roundHeartbeat error:", error);
    return null;
  }
  return data as RoundHeartbeat;
}

/** بدء الجولة — الخادم هو من يحسب جدول البريكات وتاريخ الانتهاء */
export async function startRound(
  roundId: string
): Promise<{ success: boolean; startedAt: string | null; scheduledEndAt: string | null; errorMessage?: string }> {
  const { data, error } = await supabase.rpc("start_round" as any, {
    p_round_id: roundId,
  }).single();

  if (error || !data) {
    console.error("[Points] startRound error:", error);
    return { success: false, startedAt: null, scheduledEndAt: null, errorMessage: "خطأ في الخادم" };
  }
  const row = data as any;
  return {
    success: row?.ok ?? false,
    startedAt: row?.started_at ?? null,
    scheduledEndAt: row?.scheduled_end_at ?? null,
    errorMessage: row?.error_message ?? undefined,
  };
}

/** إنهاء الجولة يدوياً (المالك أو الأدمن) مع تجميد سجل الحضور */
export async function settleRound(
  roundId: string
): Promise<{ success: boolean; participants: number; errorMessage?: string }> {
  const { data, error } = await supabase.rpc("settle_round" as any, {
    p_round_id: roundId,
  }).single();

  if (error || !data) {
    console.error("[Points] settleRound error:", error);
    return { success: false, participants: 0, errorMessage: "خطأ في الخادم" };
  }
  const row = data as any;
  return {
    success: row?.ok ?? false,
    participants: row?.participants ?? 0,
    errorMessage: row?.error_message ?? undefined,
  };
}

export interface RoundLeaderboardRow {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  focus_seconds: number;
  focus_minutes: number;
  points_awarded: number;
}

/** لوحة الحضور — إثبات مرئي أن النقاق محسوبة على وقت حقيقي */
export async function roundLeaderboard(roundId: string): Promise<RoundLeaderboardRow[]> {
  const { data, error } = await supabase.rpc("round_leaderboard" as any, {
    p_round_id: roundId,
  });
  if (error) {
    console.error("[Points] roundLeaderboard error:", error);
    return [];
  }
  return (data as RoundLeaderboardRow[]) || [];
}


/**
 * منح نقاط من Admin
 * RPC: grant_points (Atomic — server-side only)
 */
export async function grantPoints(
  targetUserId: string,
  amount: number,
  reason?: string
): Promise<SpendResult> {
  const { data, error } = await supabase.rpc("grant_points" as any, {
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
 * النقاط تُحسب من زمن التواجد داخل الجولة: 20 نقطة كل ساعتين.
 * الزمن يشمل الاستراحات، ويُحتسب من ساعة الخادم لا ساعة المتصفح.
 */
export const ROUND_POINT_LABEL = `${POINTS_PER_BATCH} نقاط كل ${SECONDS_PER_BATCH / 3600} ساعة حضور في الجولة`;

export { MAX_BALANCE, BASE_BALANCE, SECONDS_PER_POINT, SECONDS_PER_BATCH, POINTS_PER_BATCH };
