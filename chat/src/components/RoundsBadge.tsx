import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cachedRead } from "@/lib/dataLayer";
import { Flame } from "lucide-react";

// عدّاد مشاركات المستخدم في الجولات — كاش موحّد (5 دقائق) بدل كاش الجلسة
// الذي لا ينتهي أبداً (كان لا يعكس انضمامات جديدة أثناء الجلسة نفسها).
async function fetchCount(userId: string): Promise<number> {
  return cachedRead<number>({
    key: `stats:rounds:${userId}`,
    ttlMs: 5 * 60 * 1000,
    persist: true,
    fetcher: async () => {
      const { count } = await (supabase as any)
        .from("round_participants")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      return count || 0;
    },
  });
}

interface Props { userId: string; className?: string }

const RoundsBadge = ({ userId, className = "" }: Props) => {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let mounted = true;
    fetchCount(userId).then(c => { if (mounted) setCount(c); });
    return () => { mounted = false; };
  }, [userId]);
  if (!count) return null;
  return (
    <span
      title={`شارك في ${count} جولة دراسية`}
      className={`inline-flex items-center gap-0.5 text-[10px] text-orange-500 font-semibold ${className}`}
    >
      <Flame className="w-3 h-3 fill-orange-500" />
      {count}
    </span>
  );
};

export default RoundsBadge;
