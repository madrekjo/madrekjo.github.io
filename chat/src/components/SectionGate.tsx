import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSmartPoll } from "@/lib/dataLayer";
import { getSectionLockData } from "@/lib/appCache";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";

interface Props {
  section: string;
  title: string;
  children: React.ReactNode;
}

interface LockData {
  locked: boolean;
  message: string | null;
  locked_until: string | null;
}

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(until).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (diff === 0) return <p className="text-sm text-muted-foreground mt-2">انتهى الوقت — سيُفتح القسم قريباً</p>;
  return (
    <div className="flex justify-center gap-2 mt-3 text-center" dir="ltr">
      {[
        { v: d, l: "يوم" },
        { v: h, l: "ساعة" },
        { v: m, l: "دقيقة" },
        { v: s, l: "ثانية" },
      ].map((x, i) => (
        <div key={i} className="bg-primary/10 rounded-lg px-3 py-2 min-w-[60px]">
          <p className="text-2xl font-bold text-primary tabular-nums">{x.v}</p>
          <p className="text-[10px] text-muted-foreground">{x.l}</p>
        </div>
      ))}
    </div>
  );
}

const SectionGate = ({ section, title, children }: Props) => {
  const { isAdmin } = useAuth();
  const [lock, setLock] = useState<LockData | null>(null);

  const refresh = useCallback(async () => {
    // يقرأ من كاش section_locks المشترك — لا يضرب القاعدة إلا عند انتهاء TTL.
    const data = await getSectionLockData(section);
    setLock(data || null);
  }, [section]);

  // استطلاع ذكي: يتوقف عندما يكون التبويب مخفياً، ويُحدّث فوراً عند العودة.
  useSmartPoll(() => void refresh(), 120000, [refresh]);

  const isLocked = lock?.locked && (!lock.locked_until || new Date(lock.locked_until) > new Date());

  if (isLocked && !isAdmin) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-lg">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Lock className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">{title} مغلق مؤقتاً</h2>
            {lock?.message && <p className="text-muted-foreground whitespace-pre-wrap">{lock.message}</p>}
            {lock?.locked_until && <Countdown until={lock.locked_until} />}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default SectionGate;
