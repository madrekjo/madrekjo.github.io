import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
} from "lucide-react";
import {
  listSections,
  createSection,
  updateSection,
  deleteSection,
  moveSection,
  listContents,
  createContent,
  updateContent,
  deleteContent,
  moveContent,
  contentTypeLabel,
  type TeacherSection,
  type TeacherContent,
  type TeacherAgg,
} from "@/lib/teacher-files";
import { ContentForm } from "./ContentForm";
import { ContentIcon } from "./ContentIcon";

function SectionForm({
  open,
  onOpenChange,
  teacherId,
  section,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teacherId: string;
  section: TeacherSection | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("📁");
  const [visible, setVisible] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(section?.name ?? "");
      setDescription(section?.description ?? "");
      setIcon(section?.icon ?? "📁");
      setVisible(section?.is_visible ?? true);
    }
  }, [open, section]);

  async function save() {
    const n = name.trim();
    if (!n) {
      toast.error("اكتب اسم القسم");
      return;
    }
    setSaving(true);
    try {
      if (section) {
        await updateSection(section.id, { name: n, description, icon, is_visible: visible });
        toast.success("تم تحديث القسم");
      } else {
        await createSection({
          teacher_id: teacherId,
          name: n,
          description,
          icon,
          is_visible: visible,
        });
        toast.success("تمت إضافة القسم");
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{section ? "تعديل قسم" : "إضافة قسم"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>اسم القسم *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: ملخصات"
            />
          </div>
          <div>
            <Label>الأيقونة (إيموجي)</Label>
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="w-24" />
          </div>
          <div>
            <Label>وصف القسم (اختياري)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[60px]"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={visible} onCheckedChange={setVisible} />
            ظاهر للطلاب
          </label>
          <Button onClick={save} className="w-full" disabled={saving}>
            {saving && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContentRow({
  content,
  onToggle,
  onEdit,
  onDelete,
  onMove,
}: {
  content: TeacherContent;
  onToggle: (id: string, published: boolean) => void;
  onEdit: (c: TeacherContent) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-2">
      <div className="flex min-w-0 items-center gap-2">
        <ContentIcon content={content} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{content.title}</div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Badge variant="outline">{contentTypeLabel(content.content_type)}</Badge>
            {content.content_type === "file" && content.file_name && (
              <span className="truncate">{content.file_name}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => onMove(content.id, -1)}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => onMove(content.id, 1)}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Switch
          checked={content.is_published}
          onCheckedChange={(v) => onToggle(content.id, v)}
          className="mx-1 scale-75"
          title="نشر/إخفاء"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(content)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive"
          onClick={() => onDelete(content.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function SectionCard({
  section,
  contents,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onToggle,
  onEdit,
  onDelete,
  onExpand,
  expanded,
  onReload,
}: {
  section: TeacherSection;
  contents: TeacherContent[];
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onExpand: () => void;
  expanded: boolean;
  onReload: () => Promise<void>;
}) {
  const [contentForm, setContentForm] = useState<{ open: boolean; content: TeacherContent | null }>(
    {
      open: false,
      content: null,
    },
  );

  async function toggleContent(id: string, published: boolean) {
    try {
      await updateContent(id, { is_published: published });
      await onReload();
    } catch (e: any) {
      toast.error(e?.message ?? "حدث خطأ");
    }
  }
  async function delContent(id: string) {
    if (!confirm("حذف هذا المحتوى نهائياً؟")) return;
    try {
      await deleteContent(id);
      await onReload();
    } catch (e: any) {
      toast.error(e?.message ?? "حدث خطأ");
    }
  }
  async function mvContent(id: string, dir: -1 | 1) {
    try {
      await moveContent(section.id, id, dir);
      await onReload();
    } catch (e: any) {
      toast.error(e?.message ?? "حدث خطأ");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg">{section.icon || "📁"}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{section.name}</span>
              {!section.is_visible && <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
            {section.description && (
              <p className="truncate text-xs text-muted-foreground">{section.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onMoveUp}
            disabled={index === 0}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onMoveDown}
            disabled={index === total - 1}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Switch
            checked={section.is_visible}
            onCheckedChange={onToggle}
            className="mx-1 scale-75"
          />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-border p-3">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setContentForm({ open: true, content: null })}
          >
            <Plus className="h-3.5 w-3.5" /> إضافة محتوى
          </Button>
          {contents.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">لا محتوى بعد.</p>
          )}
          {contents.map((c) => (
            <ContentRow
              key={c.id}
              content={c}
              onToggle={toggleContent}
              onEdit={(cc) => setContentForm({ open: true, content: cc })}
              onDelete={delContent}
              onMove={mvContent}
            />
          ))}
        </div>
      )}

      <button
        onClick={onExpand}
        className="flex w-full items-center justify-center gap-1 border-t border-border py-1.5 text-[11px] text-muted-foreground hover:bg-accent/40"
      >
        <FolderOpen className="h-3 w-3" />
        {expanded ? "إغلاق المحتوى" : `إدارة المحتوى (${contents.length})`}
      </button>

      <ContentForm
        open={contentForm.open}
        onOpenChange={(o) => setContentForm((prev) => ({ ...prev, open: o }))}
        sectionId={section.id}
        content={contentForm.content}
        onSaved={onReload}
      />
    </div>
  );
}

export function SectionsTab({ teacher }: { teacher: TeacherAgg }) {
  const [sections, setSections] = useState<TeacherSection[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contents, setContents] = useState<Record<string, TeacherContent[]>>({});
  const [form, setForm] = useState<{ open: boolean; section: TeacherSection | null }>({
    open: false,
    section: null,
  });

  async function load() {
    try {
      const rows = await listSections(teacher.id);
      setSections(rows);
      if (expandedId) {
        const list = await listContents(expandedId);
        setContents((prev) => ({ ...prev, [expandedId]: list }));
      }
    } catch (e) {
      toast.error("تعذر تحميل الأقسام");
    }
  }

  useEffect(() => {
    load();
  }, [teacher.id]);

  async function onExpand(id: string | null) {
    setExpandedId(id);
    if (id) {
      try {
        const list = await listContents(id);
        setContents((prev) => ({ ...prev, [id]: list }));
      } catch {
        /* ignore */
      }
    }
  }

  async function toggleSec(section: TeacherSection, v: boolean) {
    try {
      await updateSection(section.id, { is_visible: v });
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "حدث خطأ");
    }
  }

  async function delSec(section: TeacherSection) {
    if (!confirm(`حذف قسم «${section.name}» ومحتواه نهائياً؟`)) return;
    try {
      await deleteSection(section.id);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "حدث خطأ");
    }
  }

  async function mvSec(id: string, dir: -1 | 1) {
    try {
      await moveSection(teacher.id, id, dir);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "حدث خطأ");
    }
  }

  if (sections === null) {
    return <p className="py-8 text-center text-sm text-muted-foreground">جاري تحميل الأقسام...</p>;
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => setForm({ open: true, section: null })}>
        <Plus className="h-4 w-4" /> إضافة قسم
      </Button>
      {sections.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          لا أقسام بعد — أنشئ أول قسم مثل «ملخصات» أو «امتحانات».
        </p>
      )}
      {sections.map((s, i) => (
        <SectionCard
          key={s.id}
          section={s}
          contents={contents[s.id] ?? []}
          index={i}
          total={sections.length}
          onMoveUp={() => mvSec(s.id, -1)}
          onMoveDown={() => mvSec(s.id, 1)}
          onToggle={(v) => toggleSec(s, v)}
          onEdit={() => setForm({ open: true, section: s })}
          onDelete={() => delSec(s)}
          onExpand={() => onExpand(expandedId === s.id ? null : s.id)}
          expanded={expandedId === s.id}
          onReload={async () => {
            await load();
            if (s.id && expandedId === s.id) {
              const list = await listContents(s.id);
              setContents((prev) => ({ ...prev, [s.id]: list }));
            }
          }}
        />
      ))}
      <SectionForm
        open={form.open}
        onOpenChange={(o) => setForm((prev) => ({ ...prev, open: o }))}
        teacherId={teacher.id}
        section={form.section}
        onSaved={load}
      />
    </div>
  );
}
