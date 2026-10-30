// نظام التحذير بالحساب: شاشة حمراء + صوت إنذار تظهر للمستخدم
// حتى يضغط «قرأت التحذير». كل الوصول عبر RPCs آمنة (لا قراءة مباشرة للجدول).
import { supabase } from "@/integrations/supabase/client";

export type ActiveWarning = { message: string; at: string | null };

/** التحذير النشط (غير المقروء) للحساب الحالي، أو null. */
export async function myActiveWarning(): Promise<ActiveWarning | null> {
  const { data, error } = await (supabase.rpc as any)("my_active_warning");
  if (error || !data) return null;
  const w = data as { message?: string; at?: string | null };
  if (!w?.message) return null;
  return { message: w.message, at: w.at ?? null };
}

/** تأكيد قراءة التحذير (يخفيه نهائياً حتى يرسل الأدمن تحذيراً جديداً). */
export async function ackMyWarning(): Promise<void> {
  try {
    await (supabase.rpc as any)("ack_my_warning");
  } catch {
    /* لا نعطّل الإغلاق بسبب الشبكة */
  }
}

/** إرسال تحذير لحساب (بالـuser_id). */
export async function adminWarnUser(userId: string, message: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("admin_warn_user", {
    p_user_id: userId,
    p_message: message,
  });
  if (error) throw new Error(error.message);
}

/** إرسال تحذير بالإيميل (عندما لا يتوفر user_id). */
export async function adminWarnUserEmail(email: string, message: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("admin_warn_user_email", {
    p_email: email,
    p_message: message,
  });
  if (error) throw new Error(error.message);
}

/** إلغاء تحذير حساب. */
export async function adminClearUserWarning(userId: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("admin_clear_user_warning", {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

/** التحذير الحالي لحساب كما يراه الأدمن (لغرض ملف الحساب). */
export async function adminUserWarning(
  userId: string,
): Promise<{ message: string; at: string | null; seen_at: string | null } | null> {
  const { data, error } = await (supabase.rpc as any)("admin_user_warning", {
    p_user_id: userId,
  });
  if (error || !data) return null;
  const w = data as { message?: string; at?: string | null; seen_at?: string | null };
  if (!w?.message) return null;
  return { message: w.message, at: w.at ?? null, seen_at: w.seen_at ?? null };
}
