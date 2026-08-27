import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getDeviceId } from "@/lib/device";
import { submitReport } from "@/lib/visitor.functions";

const REASONS: { code: string; label: string }[] = [
  { code: "spam", label: "سبام / إعلان" },
  { code: "harassment", label: "تنمر / إساءة شخصية" },
  { code: "hate", label: "كراهية أو تحريض" },
  { code: "sexual", label: "محتوى جنسي غير لائق" },
  { code: "violence", label: "عنف أو تهديد" },
  { code: "misinformation", label: "معلومات مضللة" },
  { code: "other", label: "سبب آخر" },
];

type Props = {
  contentType: "post" | "comment" | "chat_post" | "chat_comment";
  contentId: string;
  compact?: boolean;
};

export function ReportButton({ contentType, contentId, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("spam");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const res = await submitReport({
        data: {
          device_id: getDeviceId(),
          content_type: contentType,
          content_id: contentId,
          reason_code: code,
          reason_text: text.trim() || undefined,
        },
      });
      if (!res.ok) {
        if (res.reason === "banned") toast.error("لا يمكنك إرسال بلاغ لأنك محظور");
        else toast.error("تعذر إرسال البلاغ");
        return;
      }
      toast.success("تم إرسال البلاغ. شكراً لك.");
      setOpen(false);
      setText("");
      setCode("spam");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={`flex items-center gap-1 text-muted-foreground hover:text-destructive ${compact ? "text-xs" : "text-sm"}`}
          title="إبلاغ"
        >
          <Flag className={compact ? "h-3 w-3" : "h-4 w-4"} /> إبلاغ
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>الإبلاغ عن المحتوى</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label className="text-sm">سبب الإبلاغ</Label>
          <RadioGroup value={code} onValueChange={setCode} className="space-y-1.5">
            {REASONS.map((r) => (
              <label key={r.code} className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-accent">
                <RadioGroupItem value={r.code} id={`r-${r.code}`} />
                <span>{r.label}</span>
              </label>
            ))}
          </RadioGroup>
          <div>
            <Label className="text-sm">تفاصيل إضافية (اختياري)</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="اكتب سبب البلاغ بالتفصيل..."
              className="mt-1 min-h-[80px]"
            />
            <div className="mt-1 text-left text-[10px] text-muted-foreground">{text.length}/500</div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>إلغاء</Button>
            <Button onClick={send} disabled={busy} variant="destructive">
              {busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />} إرسال البلاغ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
