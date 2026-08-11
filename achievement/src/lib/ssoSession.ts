import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
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
 * مزامنة صامتة: حساب موجود في الدردشة يُستعاد/يُتواصل في الإنجاز
 * بنفس البريد دون طلب تسجيل دخول Google جديد. تستخدم Edge Function
 * sync-achievement-user التي تتحقق من جلسة الدردشة وتُنشئ/تستعيد
 * مستخدم الإنجاز ثم تعيد كلمة مرور مؤقتة للدخول الصامت.
 */
export async function syncAchievementUserFromChat(): Promise<SsoResult> {
  try {
    const { data: chatSession } = await supabase.auth.getSession();
    const chatUser = chatSession.session?.user;
    const chatAccessToken = chatSession.session?.access_token;

    if (!chatUser?.email || !chatAccessToken) {
      return { ok: false, error: "لا توجد جلسة دردشة صالحة للمزامنة" };
    }

    const { data: syncRes, error: syncErr } =
      await achievementSupabase.functions.invoke("sync-achievement-user", {
        body: {
          email: chatUser.email,
          chat_access_token: chatAccessToken,
          chat_user_id: chatUser.id,
          name:
            chatUser.user_metadata?.full_name ??
            chatUser.user_metadata?.name ??
            "",
          avatar_url: chatUser.user_metadata?.avatar_url ?? "",
        },
      });

    if (syncErr) {
      return {
        ok: false,
        error: `تعذرت مزامنة حساب الإنجاز: ${syncErr.message ?? "خطأ غير معروف"}`,
      };
    }

    if (syncRes?.password) {
      const { error: pErr } = await achievementSupabase.auth.signInWithPassword({
        email: syncRes.email ?? chatUser.email,
        password: syncRes.password,
      });
      if (pErr) {
        return { ok: false, error: `تعذر فتح جلسة الإنجاز: ${pErr.message}` };
      }
    }

    const achUser = await getAchievementUser();
    if (!achUser) {
      return { ok: false, error: "تعذر تأكيد جلسة الإنجاز بعد المزامنة" };
    }

    return { ok: true, user: achUser };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "خطأ غير معروف",
    };
  }
}

/**
 * يستبدل الـticket الصادر من Worker SSO بجلستي الدردشة والإنجاز
 * ويضمن وجود مستخدم الإنجاز النهائي. لا يُمرَّر أي توكن عبر postMessage.
 */
export async function exchangeTicket(ticket: string): Promise<SsoResult> {
  try {
    const res = await fetch(
      `${SSO_AUTH_BASE_URL}/session?ticket=${encodeURIComponent(ticket)}`
    );
    if (!res.ok) return { ok: false, error: `ticket غير صالح (${res.status})` };

    const data = await res.json();
    const achievementSession = data?.achievement;
    const chatSession = data?.chat;

    if (!achievementSession?.access_token || !achievementSession?.refresh_token) {
      return { ok: false, error: "بيانات جلسة الإنجاز ناقصة" };
    }
    if (!chatSession?.access_token || !chatSession?.refresh_token) {
      return { ok: false, error: "بيانات جلسة الدردشة ناقصة" };
    }

    const { error: chatErr } = await supabase.auth.setSession({
      access_token: chatSession.access_token,
      refresh_token: chatSession.refresh_token,
    });
    if (chatErr) {
      return { ok: false, error: `فشل إنشاء جلسة الدردشة: ${chatErr.message}` };
    }

    const { error: achErr } = await achievementSupabase.auth.setSession({
      access_token: achievementSession.access_token,
      refresh_token: achievementSession.refresh_token,
    });
    if (achErr) {
      return { ok: false, error: `فشل إنشاء جلسة الإنجاز: ${achErr.message}` };
    }

    // التأكد من أن المستخدم موجود فعلًا في مشروع الإنجاز؛
    // إذا لم تكن الجلسة صالحة نزامن الحساب تلقائياً عبر Edge Function.
    let achUser = await getAchievementUser();
    if (!achUser) {
      const syncRes = await syncAchievementUserFromChat();
      if (!syncRes.ok) return syncRes;
      achUser = await getAchievementUser();
      if (!achUser) {
        return { ok: false, error: "تعذر تأكيد جلسة الإنجاز بعد المزامنة" };
      }
    }

    return { ok: true, user: achUser };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "خطأ غير معروف",
    };
  }
}
