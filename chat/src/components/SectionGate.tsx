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
  /** حاجز مؤقت مدمج في الكود (مو من القاعدة) — يفتح تلقائياً صامتاً عند هذا الميعاد. */
  barrierUntil?: string;
  /** رسالة الحاجز المدمج (تغني عن رسالة القفل القادمة من القاعدة). */
  barrierMessage?: string;
}

interface LockData {
  locked: boolean;
  message: string | null;
  locked_until: string | null;
}

const SectionGate = ({ section, title, children, barrierUntil, barrierMessage }: Props) => {
  // المالك (owner) يمرّ دائماً — الإغلاق للمستخدمين العاديين فقط.
  const { isAdmin, isOwner } = useAuth();
  const [lock, setLock] = useState<LockData | null>(null);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    // يقرأ من كاش section_locks المشترك — لا يضرب القاعدة إلا عند انتهاء TTL.
    // الحاجز المدمج في الكود لا يحتاج قاعدة أصلاً، فنتخطى الجلب حين يكون سارياً.
    if (barrierUntil && new Date(barrierUntil).getTime() > Date.now()) return;
    const data = await getSectionLockData(section);
    setLock(data || null);
  }, [section, barrierUntil]);

  // بدون استطلاع دوري (كان كل دقيقتين). الجلب عند الفتح + عند عودة التبويب
  // + زر "تحقق الآن" على شاشة القفل لقراءة فورية من القاعدة.
  useEffect(() => {
    void refresh();
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  /**
   * فتح تلقائي «صامت»: مؤقت واحد يعيد الحساب عند ميعاد الفتح بالضبط (من الحاجز
   * المدمج أو من locked_until في القاعدة — أيهما أقرب)، فتختفي الرسالة ويفتح
   * القسم من نفسه — بدون أي عدّاد يراه المستخدم.
   */
  useEffect(() => {
    const times = [
      barrierUntil ? new Date(barrierUntil).getTime() : 0,
      lock?.locked_until ? new Date(lock.locked_until).getTime() : 0,
    ].filter((t) => t > Date.now());
    if (times.length === 0) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(...times, 2147483647));
    return () => clearTimeout(t);
  }, [barrierUntil, lock?.locked_until]);

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

  // الحاجز المدمج في الكود (يفضّل على قفل القاعدة إن تعارضا).
  const barrierActive = !!barrierUntil && new Date(barrierUntil).getTime() > now;
  const dbLocked = !!lock?.locked && (!lock.locked_until || new Date(lock.locked_until).getTime() > now);
  const isLocked = barrierActive || dbLocked;
  const shownMessage = barrierActive ? barrierMessage : lock?.message;

  if (isLocked && !isAdmin && !isOwner) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-lg">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Lock className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">{title} مغلق مؤقتاً</h2>
            {shownMessage && <p className="text-muted-foreground whitespace-pre-wrap">{shownMessage}</p>}
            {!barrierActive && (
              <Button variant="outline" size="sm" className="gap-1 mt-2" disabled={checking} onClick={() => void forceCheck()}>
                {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} تحقق الآن
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default SectionGate;
