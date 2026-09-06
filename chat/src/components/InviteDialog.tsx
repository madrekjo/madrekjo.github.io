import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Gift, Copy, UserPlus, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

const CLAIM_REASONS: Record<string, string> = {
  already_claimed: "لقد فعّلت دعوة سابقة بالفعل.",
  not_found: "الكود غير صحيح.",
  expired: "انتهت صلاحية هذا الكود.",
  used_up: "تم استخدام هذا الكود بالكامل.",
  self_claim: "لا يمكنك تفعيل كودك الخاص.",
};

const InviteDialog = () => {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<{ code: string; expires_at: string; max_uses: number; used_count: number } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [claimCode, setClaimCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const alreadyInvited = !!profile?.via_invite;

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

  const handleClaim = async () => {
    if (!user) return;
    if (!/^\d{6}$/.test(claimCode)) {
      setClaimMsg({ ok: false, text: "أدخل الكود المكوّن من 6 أرقام" });
      return;
    }
    setClaiming(true);
    try {
      const { data, error } = await (supabase.rpc as any)("claim_invite_code", { p_code: claimCode });
      if (error) {
        setClaimMsg({ ok: false, text: "فشل التفعيل: " + (error.message || "") });
        return;
      }
      if (data?.ok) {
        setClaimMsg({ ok: true, text: "تم تفعيل الدعوة! صديقك استلم +25 نقطة." });
        setClaimCode("");
      } else {
        setClaimMsg({ ok: false, text: CLAIM_REASONS[data?.reason] || "تعذر تفعيل الكود" });
      }
    } finally {
      setClaiming(false);
    }
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
              ادعُ أصدقاءك واربح <b>+25 نقطة</b> عن كل شخص يسجّل ويدخل بكودك.
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

          {alreadyInvited ? (
            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-500/10 rounded-lg px-3 py-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              حساباتك مرتطبة بدعوة سابقة.
            </div>
          ) : (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-primary" />
                معك كود من صديق؟ سجّل دخولك ثم فعّله من هنا:
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-lg tracking-[0.3em] font-mono"
                  dir="ltr"
                />
                <Button size="sm" onClick={handleClaim} disabled={claiming || claimCode.length !== 6}>
                  {claiming ? "..." : "تفعيل"}
                </Button>
              </div>
              {claimMsg && (
                <p className={`text-xs rounded-lg px-3 py-2 ${
                  claimMsg.ok ? "text-green-600 bg-green-500/10" : "text-destructive bg-destructive/10"
                }`}>
                  {claimMsg.text}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InviteDialog;