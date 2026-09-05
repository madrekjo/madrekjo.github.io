import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock } from "lucide-react";

interface Warning { id: string; reason: string; created_at: string; }

const TimeoutBanner = () => {
  const { profile } = useAuth();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  if (!profile?.timeout_until) return null;
  const end = new Date(profile.timeout_until);
  const remain = end.getTime() - Date.now();
  if (remain <= 0) return null;
  const mins = Math.floor(remain / 60000);
  const secs = Math.floor((remain / 1000) % 60);
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground rounded-full px-4 py-2 text-sm shadow-lg flex items-center gap-2 animate-in fade-in">
      <Clock className="w-4 h-4" />
      أنت في تايم اوت • متبقي {mins}د {String(secs).padStart(2, "0")}ث
    </div>
  );
};

const WarningNotice = () => {
  const { user } = useAuth();
  const [warnings, setWarnings] = useState<Warning[]>([]);

  const fetch = async () => {
    if (!user) return;
    const { data } = await (supabase as any).from("user_warnings")
      .select("id, reason, created_at")
      .eq("user_id", user.id).eq("acknowledged", false)
      .order("created_at", { ascending: false });
    setWarnings(data || []);
  };

  // بدون Realtime (كان يفتح قناة socket لكل مستخدم). الجلب عند الدخول +
  // عند عودة التبويب (يظهر التحذير فوراً عند الرجوع للتطبيق).
  useEffect(() => {
    void fetch();
    const onVis = () => { if (document.visibilityState === "visible") void fetch(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user?.id]);

  const ack = async () => {
    const ids = warnings.map(w => w.id);
    await (supabase as any).from("user_warnings").update({ acknowledged: true }).in("id", ids);
    setWarnings([]);
  };

  if (warnings.length === 0) return <TimeoutBanner />;

  return (
    <>
      <TimeoutBanner />
      <Dialog open onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              تنبيه: تم إعطاؤك تحذير من الإدارة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {warnings.map(w => (
              <div key={w.id} className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                <p className="text-sm whitespace-pre-wrap">{w.reason}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(w.created_at).toLocaleString("ar")}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={ack}>فهمت وألتزم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WarningNotice;

