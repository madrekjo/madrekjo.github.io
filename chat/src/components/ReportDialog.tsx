import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Flag } from "lucide-react";

const REASONS = [
  { value: "offensive", label: "محتوى مسيء أو مؤذي" },
  { value: "spam", label: "سبام / إعلان" },
  { value: "misinformation", label: "معلومات خاطئة" },
  { value: "harassment", label: "تحرش أو تنمّر" },
  { value: "other", label: "سبب آخر" },
];

interface Props {
  postId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ReportDialog = ({ postId, open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user || !postId || !reason) return;
    setSubmitting(true);
    const { error } = await (supabase as any).from("post_reports").insert({
      post_id: postId,
      reporter_id: user.id,
      reason,
      details: details.trim() || null,
    });
    if (error) {
      if (error.code === "23505") toast.error("لقد بلّغت عن هذا المنشور من قبل");
      else toast.error("فشل إرسال البلاغ");
    } else {
      toast.success("تم إرسال البلاغ، ستراجعه الإدارة");
      setReason(""); setDetails("");
      onOpenChange(false);
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-destructive" /> الإبلاغ عن المنشور
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-sm">سبب البلاغ</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {REASONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={`text-right text-sm rounded-lg border px-3 py-2 transition-colors ${reason === r.value ? "border-primary bg-primary/10 text-primary font-medium" : "border-input hover:bg-muted"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-sm">تفاصيل إضافية (اختياري)</Label>
            <Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="اشرح المشكلة..." className="min-h-[70px] text-sm" maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="destructive" onClick={submit} disabled={!reason || submitting}>إرسال البلاغ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
