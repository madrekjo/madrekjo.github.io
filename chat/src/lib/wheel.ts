import { supabase } from "@/integrations/supabase/client";

/** أجزاء عجلة الجوائز بالنقاط (ترتيبها في العجلة: من رقم 0 جنوب وباتجاه عقارب الساعة). */
export const WHEEL_PRIZES = [5, 10, 15, 20, 25, 30, 40] as const;

export type WheelPrize = (typeof WHEEL_PRIZES)[number];

export interface SpinResult {
  success: boolean;
  prizePoints: number;
  newBalance: number;
  alreadySpun: boolean;
  errorMessage?: string;
}

/** سحب العجلة — استخدام واحد فقط (من الخادم). */
export async function spinWheel(): Promise<SpinResult> {
  const { data, error } = await supabase.rpc("spin_wheel" as any).single();

  if (error) {
    return { success: false, prizePoints: 0, newBalance: 0, alreadySpun: false, errorMessage: "خطأ في الخادم" };
  }

  const row = data as any;
  return {
    success: !!row?.success,
    prizePoints: row?.prize_points ?? 0,
    newBalance: row?.new_balance ?? 0,
    alreadySpun: !!row?.already_spun,
    errorMessage: row?.error_message ?? undefined,
  };
}

export interface WheelStatus {
  spun: boolean;
  prizePoints: number | null;
}

/** هل استخدم المستخدم العجلة مسبقاً؟ null = تعذّر الاستعلام (لا نعرض العجلة حينها). */
export async function getWheelStatus(): Promise<WheelStatus | null> {
  const { data, error } = await supabase.rpc("get_wheel_status" as any).single();

  if (error) {
    return null;
  }

  const row = data as any;
  return {
    spun: !!row?.spun,
    prizePoints: row?.prize_points ?? null,
  };
}