import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flame } from "lucide-react";

// Simple module-level cache to avoid re-fetching for same users
const cache = new Map<string, number>();
const pending = new Map<string, Promise<number>>();

async function fetchCount(userId: string): Promise<number> {
  if (cache.has(userId)) return cache.get(userId)!;
  if (pending.has(userId)) return pending.get(userId)!;
  const p = (async () => {
    const { count } = await (supabase as any)
      .from("round_participants")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    const c = count || 0;
    cache.set(userId, c);
    pending.delete(userId);
    return c;
  })();
  pending.set(userId, p);
  return p;
}

interface Props { userId: string; className?: string }

const RoundsBadge = ({ userId, className = "" }: Props) => {
  const [count, setCount] = useState<number | null>(cache.get(userId) ?? null);
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
