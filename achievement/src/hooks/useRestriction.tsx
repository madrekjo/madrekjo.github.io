import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { useAuth } from "./useAuth";

// جدول المنع يُضاف في ملف SQL: 20261031120000_round_limits_blocks_meetings.sql
const db = achievementSupabase as unknown as {
  from: (table: string) => ReturnType<typeof achievementSupabase.from>;
};

export interface BlockInfo {
  user_id: string;
  blocked_until: string;
  reason: string | null;
}

/** إعادة الحساب كل ٣٠ ثانية حتى يختفي التنبيه تلقائيًا عند انتهاء مدة المنع. */
const useNow = (intervalMs = 30_000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
};

export const useRestriction = () => {
  const { user } = useAuth();
  const now = useNow();

  const { data, isLoading } = useQuery<BlockInfo | null>({
    queryKey: ["my-block", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await db
        .from("achievement_blocks")
        .select("user_id, blocked_until, reason")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) return null; // الجدول غير منفّذ بعد — لا منع.
      return (data as unknown as BlockInfo | null) ?? null;
    },
    enabled: !!user,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });

  const blockedUntil =
    data?.blocked_until && new Date(data.blocked_until).getTime() > now
      ? data.blocked_until
      : null;

  return {
    blocked: !!blockedUntil,
    blockedUntil,
    reason: blockedUntil ? data?.reason ?? null : null,
    isLoading,
  };
};

/** نص عربي مختصر للمدة المتبقية. */
export const formatRemaining = (until: string | null | undefined) => {
  if (!until) return "";
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return "";
  const totalMinutes = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} يوم${hours ? ` و${hours} ساعة` : ""}`;
  if (hours > 0) return `${hours} ساعة${minutes ? ` و${minutes} دقيقة` : ""}`;
  return `${minutes} دقيقة`;
};
