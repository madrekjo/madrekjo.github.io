import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FolderOpen, ArrowRight, Star, ExternalLink } from "lucide-react";
import { listTeachers, deleteTeacher, updateTeacher, type TeacherAgg } from "@/lib/teacher-files";
import { TeacherForm } from "./TeacherForm";
import { SectionsTab } from "./SectionsTab";

export function TeachersTab() {
  const [teachers, setTeachers] = useState<TeacherAgg[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherAgg | null>(null);
  const [selected, setSelected] = useState<TeacherAgg | null>(null);

  const load = useCallback(async () => {
    const rows = await listTeachers();
    setTeachers(rows);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e?.message ?? "تعذر تحميل المعلمين"));
  }, [load]);

  async function togglePublished(t: TeacherAgg, v: boolean) {
    try {
      await updateTeacher(t.id, { is_published: v });
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "حدث خطأ");
    }
  }

  async function remove(t: TeacherAgg) {
    if (!confirm(`حذف المعلم «${t.name}» وجميع أقسامه ومحتواه نهائياً؟`)) return;
    try {
      await deleteTeacher(t.id);
      toast.success("تم الحذف");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "حدث خطأ");
    }
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="h-4 w-4" />
            جميع المعلمين
          </button>
          <Badge variant="secondary">{selected.name}</Badge>
        </div>
        <SectionsTab teacher={selected} />
      </div>
    );
  }

  if (teachers === null) {
    return <p className="py-8 text-center text-sm text-muted-foreground">جاري التحميل...</p>;
  }

  return (
    <div className="space-y-3">
      <Button
        onClick={() => {
          setEditing(null);
          setFormOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> إضافة معلم
      </Button>

      {teachers.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          لا معلمين بعد — اضغط «إضافة معلم» للبدء.
        </p>
      )}

      {teachers.map((t) => (
        <div key={t.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <Avatar className="h-14 w-14 rounded-xl">
              <AvatarImage src={t.photo_url ?? undefined} />
              <AvatarFallback className="rounded-xl bg-primary/15 text-lg font-bold text-primary">
                {t.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate font-bold">{t.name}</h3>
                {t.featured && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                <Badge variant={t.is_published ? "default" : "outline"}>
                  {t.is_published ? "منشور" : "مسودة"}
                </Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {t.subject_ids.map((id) => (
                  <span
                    key={"s" + id}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                  >
                    مادة
                  </span>
                ))}
                {t.field_ids.map((id) => (
                  <span
                    key={"f" + id}
                    className="rounded-full bg-accent/30 px-2 py-0.5 text-[10px] text-accent-foreground"
                  >
                    حقل
                  </span>
                ))}
                {t.grade_ids.map((id) => (
                  <span
                    key={"g" + id}
                    className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    صف
                  </span>
                ))}
              </div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground" dir="ltr">
                /t/{t.slug}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  window.open(`${window.location.origin}/teacher-files/t/${t.slug}`, "_blank")
                }
                title="عرض صفحة المعلم"
              >
                <ExternalLink className="h-3.5 w-3.5" /> عرض الصفحة
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelected(t)}>
                <FolderOpen className="h-3.5 w-3.5" /> الأقسام
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(t);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => remove(t)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <span className="text-xs text-muted-foreground">منشور للطلاب</span>
            <Switch checked={t.is_published} onCheckedChange={(v) => togglePublished(t, v)} />
          </div>
        </div>
      ))}

      <TeacherForm open={formOpen} onOpenChange={setFormOpen} teacher={editing} onSaved={load} />
    </div>
  );
}
