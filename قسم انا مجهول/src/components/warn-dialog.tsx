import { useEffect, useState, type ChangeEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, TriangleAlert, Trash2 } from "lucide-react";
import {
  adminClearUserWarning,
  adminUserWarning,
  adminWarnUser,
  adminWarnUserEmail,
} from "@/lib/warnings";

type Current = { message: string; at: string | null; seen_at: string | null };

type Props = {
  /** معرّف الحساب (أفضل خيار) */
  userId?: string | null;
  /** إيميل الحساب — يُستخدم إذا ما توفر userId */
  email?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSent?: () => void;
};

export function WarnDialog({ userId, email, open, onOpenChange, onSent }: Props) {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<Current | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage("");
    setCurrent(null);
    if (!userId) return;
    let alive = true;
    setLoading(true);
    void adminUserWarning(userId)
      .then((w) => { if (alive) setCurrent(w); })
      .catch(() => { /* تجاهل */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, userId]);

  async function submit() {
    const trimmed = message.trim();
    if (!trimmed) { toast.error("اكتب نص التحذير"); return; }
    if (!userId && !email) { toast.error("لا يوجد حساب لهذا المستخدم"); return; }
    setSaving(true);
    try {
      if (userId) await adminWarnUser(userId, trimmed);
      else await adminWarnUserEmail(email!, trimmed);
      toast.success("تم إرسال التحذير — ستظهر له شاشة حمراء بصوت إنذار");
      setMessage("");
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      toast.error("فشل الإرسال: " + ((e as Error)?.message || ""));
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    if (!userId) return;
    if (!confirm("إلغاء التحذير الحالي عن هذا الحساب؟")) return;
    try {
      await adminClearUserWarning(userId);
      toast.success("أُلغي التحذير");
      setCurrent(null);
      onSent?.();
    } catch (e) {
      toast.error("فشل الإزالة: " + ((e as Error)?.message || ""));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-500">
            <TriangleAlert className="h-4 w-4" /> تحذير الحساب
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted/50 p-2 font-mono text-[11px] break-all" dir="ltr">
            {email || userId || "—"}
          </div>

          {loading && (
            <div className="flex justify-center p-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
          )}

          {current && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs">
              <div className="font-bold text-red-600 dark:text-red-500">التحذير الحالي</div>
              <p className="mt-1 whitespace-pre-wrap">{current.message}</p>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {current.seen_at ? "قرأه المستخدم" : "لم يقرأه بعد"}
                {current.at ? ` · ${new Date(current.at).toLocaleString("ar")}` : ""}
              </div>
              {userId && (
                <Button size="sm" variant="ghost" className="mt-1 h-7 gap-1 text-xs" onClick={clear}>
                  <Trash2 className="h-3 w-3" /> إلغاء التحذير
                </Button>
              )}
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
