import { useState, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, ImagePlus, X, Ban } from "lucide-react";
import { uploadFile } from "@/lib/upload";

type Props = {
  deviceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onBanned?: () => void;
  defaultReason?: string;
};

const DURATIONS: { label: string; hours: number | null }[] = [
  { label: "دائم", hours: null },
  { label: "ساعة", hours: 1 },
  { label: "6 ساعات", hours: 6 },
  { label: "24 ساعة", hours: 24 },
  { label: "3 أيام", hours: 72 },
  { label: "أسبوع", hours: 168 },
];

export function BanDialog({ deviceId, open, onOpenChange, onBanned, defaultReason }: Props) {
  const [reason, setReason] = useState(defaultReason ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [evidenceVisible, setEvidenceVisible] = useState(true);
  const [durationIdx, setDurationIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const r = await uploadFile("ban-evidence", f);
      setEvidenceUrl(r.url);
    } catch (err: any) {
      toast.error("فشل رفع الصورة: " + (err?.message || ""));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    const trimmed = reason.trim();
    if (!trimmed) { toast.error("السبب مطلوب"); return; }
    setSaving(true);
    const hours = DURATIONS[durationIdx]?.hours ?? null;
    const expiresAt = hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null;
    const { error } = await (supabase.rpc as any)("admin_ban_device", {
      p_device_id: deviceId,
      p_reason: trimmed,
      p_evidence_url: evidenceUrl,
      p_expires_at: expiresAt,
      p_evidence_visible: evidenceVisible,
    });
    setSaving(false);
    if (error) { toast.error("فشل الحظر: " + error.message); return; }
    toast.success(hours ? `تم الحظر لمدة ${DURATIONS[durationIdx].label}` : "تم الحظر");
    onBanned?.();
    onOpenChange(false);
    setReason(""); setEvidenceUrl(null); setDurationIdx(0); setEvidenceVisible(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive"><Ban className="h-4 w-4" /> حظر جهاز</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted/50 p-2 font-mono text-[10px] break-all">{deviceId}</div>

          <div className="space-y-1">
            <Label className="text-xs">سبب الحظر (إجباري)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اذكر السبب…" maxLength={500} className="min-h-[70px]" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">مدة الحظر</Label>
            <div className="flex flex-wrap gap-1">
              {DURATIONS.map((d, i) => (
                <button key={d.label} type="button" onClick={() => setDurationIdx(i)}
                  className={`rounded-full px-3 py-1 text-xs ${durationIdx === i ? "bg-destructive text-destructive-foreground" : "bg-muted hover:bg-accent"}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">صورة / دليل (اختياري)</Label>
            {evidenceUrl ? (
              <div className="relative inline-block">
                <img src={evidenceUrl} alt="evidence" className="h-28 rounded border border-border object-cover" />
                <button onClick={() => setEvidenceUrl(null)} className="absolute -top-2 -left-2 rounded-full bg-destructive p-1 text-destructive-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-muted px-3 py-2 text-xs hover:bg-accent">
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />} إرفاق صورة
                <input type="file" accept="image/*" className="hidden" onChange={onFile} />
              </label>
            )}
          </div>

          {evidenceUrl && (
            <div className="flex items-center justify-between rounded-md border border-border p-2">
              <div>
                <div className="text-xs font-semibold">إظهار الصورة للمحظور</div>
                <div className="text-[10px] text-muted-foreground">لو أوقفتها، فقط الإدارة ستراها.</div>
              </div>
              <Switch checked={evidenceVisible} onCheckedChange={setEvidenceVisible} />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button variant="destructive" size="sm" onClick={submit} disabled={saving || uploading}>
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} تأكيد الحظر
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
