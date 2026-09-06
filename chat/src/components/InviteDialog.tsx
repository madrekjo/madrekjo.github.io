import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Gift, Copy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

const InviteDialog = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<{ code: string; expires_at: string; max_uses: number; used_count: number } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data, error } = await (supabase.rpc as any)("create_my_invite_code");
      if (!error && data) setInviteCode(data as any);
    })();
  }, [open, user?.id]);

  const handleGetInviteCode = async () => {
    setInviteLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("create_my_invite_code");
      if (error) {
        toast.error("فشل إنشاء كود الدعوة: " + (error.message || ""));
        return;
      }
      setInviteCode(data as any);
      toast.success("تم إنشاء كود الدعوة");
    } finally {
      setInviteLoading(false);
    }
  };

  const copyInviteCode = () => {
    if (!inviteCode) return;
    navigator.clipboard?.writeText(inviteCode.code);
    toast.success("تم نسخ كود الدعوة");
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 shrink-0 text-amber-500 hover:text-amber-600"
        onClick={() => setOpen(true)}
        title="دعوة الأصدقاء"
      >
        <Gift className="w-5 h-5" />
        <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-500" /> دعوة الأصدقاء
            </DialogTitle>
            <DialogDescription>
              ادعُ أصدقاءك واربح <b>+25 نقطة</b> عن كل شخص يسجّل بكودك، وهو يبدأ برصيد 50 نقطة.
            </DialogDescription>
          </DialogHeader>

          {inviteCode ? (
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-1 bg-primary/5 rounded-lg px-4 py-4 border border-primary/20">
                <span className="text-[11px] text-muted-foreground">كود دعوتك</span>
                <span className="text-4xl font-bold tracking-[0.3em] text-primary">
                  {inviteCode.code}
                </span>
              </div>
              <Button onClick={copyInviteCode} size="sm" variant="outline" className="w-full gap-1">
                <Copy className="w-4 h-4" /> نسخ الكود
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                يستخدم {inviteCode.used_count}/{inviteCode.max_uses} مرة · ينتهي{" "}
                {formatDistanceToNow(new Date(inviteCode.expires_at), { addSuffix: true, locale: ar })}
              </p>
            </div>
          ) : (
            <Button onClick={handleGetInviteCode} disabled={inviteLoading} className="w-full gap-1">
              <Gift className="w-4 h-4" />
              {inviteLoading ? "جاري الإنشاء..." : "ولّد كود الدعوة"}
            </Button>
          )}

          <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2.5 leading-relaxed">
            من صفحة تسجيل الدخول اضغط "رمز الدعوة" وأدخل الكود، وبعد ما يُفعَّل حسابك تصلك المكافأة.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InviteDialog;