import type { User } from "@supabase/supabase-js";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { SSO_AUTH_BASE_URL } from "@/config/sso-config";

export interface SsoResult {
  ok: boolean;
  error?: string;
  user?: User | null;
}

async function getAchievementUser(): Promise<User | null> {
  const { data, error } = await achievementSupabase.auth.getUser();
  return !error && data?.user ? data.user : null;
}

/**
 * يستبدل الـticket الصادر من Worker SSO بجلسة الإنجاز.
 *
 * الدردشة قسم اختياري: قد تحتوي التذكرة على جلسة دردشة أو لا تحتوي،
 * وفي كلتا الحالتين يكفي وجود جلسة الإنجاز لإتمام تسجيل الدخول.
 * (جلسة الدردشة — إن وُجدت — يحفظها المتصفح عبر صفحة /login/ المركزية.)
 */
export async function exchangeTicket(ticket: string): Promise<SsoResult> {
  try {
    const res = await fetch(
      `${SSO_AUTH_BASE_URL}/session?ticket=${encodeURIComponent(ticket)}`
    );
    if (!res.ok) return { ok: false, error: `ticket غير صالح (${res.status})` };

    const data = await res.json();
    const achievementSession = data?.achievement;

    if (!achievementSession?.access_token || !achievementSession?.refresh_token) {
      return { ok: false, error: "بيانات جلسة الإنجاز ناقصة" };
    }

    const { data: sessionData, error: achErr } =
      await achievementSupabase.auth.setSession({
        access_token: achievementSession.access_token,
        refresh_token: achievementSession.refresh_token,
      });
    if (achErr) {
      return { ok: false, error: `فشل إنشاء جلسة الإنجاز: ${achErr.message}` };
    }

    const achUser = sessionData?.user ?? (await getAchievementUser());
    if (!achUser) {
      return { ok: false, error: "تعذر تأكيد جلسة الإنجاز بعد الدخول" };
    }

    return { ok: true, user: achUser };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "خطأ غير معروف",
    };
  }
}
