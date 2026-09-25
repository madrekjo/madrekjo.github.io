import { useState, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, TriangleAlert, Trash2 } from "lucide-react";

type Props = {
  deviceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSent?: () => void;
  currentWarning?: string | null;
  currentSeenAt?: string | null;
};

export function WarnDialog({ deviceId, open, onOpenChange, onSent, currentWarning, currentSeenAt }: Props) {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmed = message.trim();
    if (!trimmed) { toast.error("اكتب نص التحذير"); return; }
    setSaving(true);
    const { error } = await (supabase.rpc as any)("admin_warn_device", {
      p_device_id: deviceId,
      p_message: trimmed,
    });
    setSaving(false);
    if (error) { toast.error("فشل الإرسال: " + error.message); return; }
    toast.success("تم إرسال التحذير — ستتحول شاشته إلى الأحمر");
    setMessage("");
    onSent?.();
    onOpenChange(false);
  }

  async function clear() {
    const { error } = await (supabase.rpc as any)("admin_clear_warning", { p_device_id: deviceId });
    if (error) toast.error("فشل الإزالة"); else { toast.success("أُلغي التحذير"); onSent?.(); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-500">
            <TriangleAlert className="h-4 w-4" /> تحذير جهاز
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted/50 p-2 font-mono text-[10px] break-all">{deviceId}</div>

          {currentWarning && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs">
              <div className="font-bold text-red-600 dark:text-red-500">التحذير الحالي</div>
              <p className="mt-1 whitespace-pre-wrap">{currentWarning}</p>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {currentSeenAt ? "قرأه المستخدم" : "لم يقرأه بعد"}
              </div>
              <Button size="sm" variant="ghost" className="mt-1 h-7 gap-1 text-xs" onClick={clear}>
                <Trash2 className="h-3 w-3" /> إلغاء التحذير
              </Button>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">نص التحذير (يظهر أبيض على شاشة حمراء)</Label>
            <Textarea
              value={message}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
              placeholder="اكتب ما تريد أن يراه المستخدم…"
              maxLength={500}
              className="min-h-[90px]"
            />
            <div className="text-[10px] text-muted-foreground">
              {message.length}/500 — الشاشة تومض أحمر مع صوت إنذار حتى الضغط على «قرأت التحذير».
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} إرسال التحذير
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
