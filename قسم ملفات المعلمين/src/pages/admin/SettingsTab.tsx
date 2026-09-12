import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Lock, Unlock } from "lucide-react";
import { getTeacherFilesEnabled, setTeacherFilesEnabled } from "@/lib/teacher-files";

export function SettingsTab() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getTeacherFilesEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(false));
  }, []);

  async function toggle(v: boolean) {
    setBusy(true);
    try {
      await setTeacherFilesEnabled(v);
      setEnabled(v);
      toast.success(v ? "تم تفعيل القسم للطلاب" : "تم إخفاء القسم عن الطلاب");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) {
    return <p className="py-8 text-center text-sm text-muted-foreground">جاري التحميل...</p>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-base flex items-center gap-1.5">
              {enabled ? <Unlock className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4" />}
              إظهار «ملفات المعلمين» للطلاب
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {enabled
                ? "القسم مفعّل — صفحة المعلمين والملفات ظاهرة للطلاب الآن."
                : "القسم معطّل — صفحة المعلمين وكل بياناته مخفية تماماً عن الطلاب."}
            </p>
          </div>
          {busy ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
          ) : (
            <Switch checked={enabled} onCheckedChange={toggle} />
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant={enabled ? "default" : "outline"}>{enabled ? "مفعّل" : "معطّل"}</Badge>
          <Badge variant="outline">teacher_files_enabled</Badge>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 text-sm">
        <h2 className="font-semibold">ماذا يحدث عند التفعيل؟</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
          <li>
            يظهر رابط القسم وصفحة المعلمين للطلاب تلقائياً من قاعدة البيانات — لا حاجة لإعادة
            البناء.
          </li>
          <li>الملفات المرفوعة في «teacher-files» تصبح قابلة للقراءة العامة.</li>
          <li>كل العناصر المخفية (مسودة / غير منشور / قسم مخفي) تبقى مخفية للأدمن فقط.</li>
        </ul>
      </section>
    </div>
  );
}
