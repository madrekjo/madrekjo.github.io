import { useState } from "react";
import { useRounds } from "@/hooks/useRounds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Loader2, ImagePlus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateRoundDialog = ({ open, onOpenChange }: Props) => {
  const { createRound } = useRounds();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("1");
  const [minutes, setMinutes] = useState("0");
  const [workMin, setWorkMin] = useState("25");
  const [breakMin, setBreakMin] = useState("5");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const reset = () => {
    setTitle(""); setDescription(""); setHours("1"); setMinutes("0");
    setWorkMin("25"); setBreakMin("5"); setImageFile(null); setPreview(null);
  };

  const handleSubmit = async () => {
    const total = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
    const work = parseInt(workMin) || 0;
    const brk = parseInt(breakMin) || 0;
    if (!title.trim()) { toast.error("اكتب اسم الجولة"); return; }
    if (total < 1) { toast.error("المدة الكلية يجب أن تكون دقيقة على الأقل"); return; }
    if (total > 300) { toast.error("المدة الكلية لا تتجاوز 5 ساعات"); return; }
    if (work < 1) { toast.error("مدة الدراسة يجب أن تكون دقيقة على الأقل"); return; }
    if (brk < 0) { toast.error("مدة البريك غير صحيحة"); return; }
    if (work > total) { toast.error("مدة الدراسة لا تتجاوز المدة الكلية"); return; }

    try {
      await createRound.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        totalMinutes: total,
        workMinutes: work,
        breakMinutes: brk,
        imageFile,
      });
      toast.success("تم إنشاء الجولة 🎯");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "تعذّر إنشاء الجولة");
    }
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/jpeg","image/png","image/gif","image/webp"].includes(f.type)) {
      toast.error("صيغة الصورة غير مدعومة");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يتجاوز 5 ميغابايت");
      return;
    }
    setImageFile(f);
    setPreview(URL.createObjectURL(f));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إنشاء جولة جديدة</DialogTitle>
          <DialogDescription>
            جلسة دراسة جماعية بتقنية البومودورو — يقدر أي شخص ينضم خلال الجولة.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label>صورة الجولة</Label>
            <label className="mt-1 flex h-32 w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 transition">
              {preview ? (
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-xs">اختر صورة (اختياري)</span>
                </div>
              )}
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={onPickImage} />
            </label>
          </div>

          <div>
            <Label htmlFor="r-title">اسم الجولة</Label>
            <Input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className="mt-1" />
          </div>

          <div>
            <Label htmlFor="r-desc">الوصف</Label>
            <Textarea id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} className="mt-1" rows={2} />
          </div>

          <div>
            <Label>المدة الكلية</Label>
            <div className="mt-1 flex items-center justify-center gap-2">
              <div className="flex flex-col items-center">
                <Input type="number" min="0" max="5" value={hours} onChange={(e) => setHours(e.target.value)} className="w-20 text-center text-xl font-mono font-bold h-12" />
                <span className="mt-1 text-xs text-muted-foreground">ساعة</span>
              </div>
              <span className="text-2xl font-bold text-muted-foreground mb-4">:</span>
              <div className="flex flex-col items-center">
                <Input type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-20 text-center text-xl font-mono font-bold h-12" />
                <span className="mt-1 text-xs text-muted-foreground">دقيقة</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="r-work">دراسة (دقائق)</Label>
              <Input id="r-work" type="number" min="1" value={workMin} onChange={(e) => setWorkMin(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="r-break">بريك (دقائق)</Label>
              <Input id="r-break" type="number" min="0" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="mt-1" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            تتكرر دورة الدراسة والبريك تلقائياً حتى نهاية الجولة.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createRound.isPending} className="gap-1">
            {createRound.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            إنشاء الجولة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
