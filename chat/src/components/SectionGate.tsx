import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getSectionLockData } from "@/lib/appCache";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, RefreshCw, Loader2 } from "lucide-react";

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

const SectionGate = ({ section, title, children }: Props) => {
  // المالك (owner) يمرّ دائماً — الإغلاق للمستخدمين العاديين فقط.
  const { isAdmin, isOwner } = useAuth();
  const [lock, setLock] = useState<LockData | null>(null);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    // يقرأ من كاش section_locks المشترك — لا يضرب القاعدة إلا عند انتهاء TTL.
    const data = await getSectionLockData(section);
    setLock(data || null);
  }, [section]);

  // بدون استطلاع دوري (كان كل دقيقتين). الجلب عند الفتح + عند عودة التبويب
  // + زر "تحقق الآن" على شاشة القفل لقراءة فورية من القاعدة.
  useEffect(() => {
    void refresh();
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  /**
   * فتح تلقائي «صامت»: مؤقت واحد يعيد الحساب عند ميعاد الفتح بالضبط،
   * فتختفي الرسالة ويفتح القسم من نفسه — بدون أي عدّاد يراه المستخدم.
   */
  useEffect(() => {
    const until = lock?.locked_until ? new Date(lock.locked_until).getTime() : 0;
    const diff = until - Date.now();
    if (!until || diff <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(diff, 2147483647));
    return () => clearTimeout(t);
  }, [lock?.locked_until]);

  const forceCheck = async () => {
    setChecking(true);
    try {
      const fresh = await getSectionLockData(section, true);
      setLock(fresh || null);
      setNow(Date.now());
    } finally {
      setChecking(false);
    }
  };

  const isLocked = !!lock?.locked && (!lock.locked_until || new Date(lock.locked_until).getTime() > now);

  if (isLocked && !isAdmin && !isOwner) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-lg">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Lock className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">{title} مغلق مؤقتاً</h2>
            {lock?.message && <p className="text-muted-foreground whitespace-pre-wrap">{lock.message}</p>}
            <Button variant="outline" size="sm" className="gap-1 mt-2" disabled={checking} onClick={() => void forceCheck()}>
              {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} تحقق الآن
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default SectionGate;
