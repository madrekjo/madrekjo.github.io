import { useEffect, useState, type ChangeEvent } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ImagePlus } from "lucide-react";
import {
  createTeacher,
  updateTeacher,
  replaceTeacherLinks,
  listSubjects,
  listFields,
  listGrades,
  addRefItem,
  slugify,
  type TeacherAgg,
  type SocialLink,
  type RefItem,
} from "@/lib/teacher-files";
import { uploadTeacherFile } from "@/lib/upload";

type LinksState = { subject_ids: string[]; field_ids: string[]; grade_ids: string[] };

function RefPicker({
  title,
  items,
  selected,
  onToggle,
  onAdd,
}: {
  title: string;
  items: RefItem[];
  selected: string[];
  onToggle: (id: string) => void;
  onAdd: (name: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <Label className="text-sm">{title}</Label>
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {items.map((it) => (
          <label
            key={it.id}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
              selected.includes(it.id)
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-background hover:bg-accent"
            }`}
          >
            <Checkbox
              checked={selected.includes(it.id)}
              onCheckedChange={() => onToggle(it.id)}
              className="hidden"
            />
            {it.name}
          </label>
        ))}
        {items.length === 0 && (
          <span className="text-xs text-muted-foreground">لا توجد عناصر — أضف من الأسفل</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="إضافة عنصر جديد..."
          className="h-8 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => {
            const v = val.trim();
            if (!v) return;
            onAdd(v);
            setVal("");
          }}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function TeacherForm({
  open,
  onOpenChange,
  teacher,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teacher: TeacherAgg | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [socials, setSocials] = useState<SocialLink[]>([]);
  const [published, setPublished] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [links, setLinks] = useState<LinksState>({ subject_ids: [], field_ids: [], grade_ids: [] });
  const [refs, setRefs] = useState<{ subjects: RefItem[]; fields: RefItem[]; grades: RefItem[] }>({
    subjects: [],
    fields: [],
    grades: [],
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(teacher?.name ?? "");
    setSlug(teacher?.slug ?? "");
    setBio(teacher?.bio ?? "");
    setPhotoUrl(teacher?.photo_url ?? null);
    setWebsite(teacher?.website_url ?? "");
    setSocials((teacher?.social_links as SocialLink[]) ?? []);
    setPublished(teacher?.is_published ?? false);
    setFeatured(teacher?.featured ?? false);
    setSortOrder(String(teacher?.sort_order ?? 0));
    setLinks({
      subject_ids: teacher?.subject_ids ?? [],
      field_ids: teacher?.field_ids ?? [],
      grade_ids: teacher?.grade_ids ?? [],
    });
  }

  useEffect(() => {
    if (open) {
      reset();
      Promise.all([listSubjects(), listFields(), listGrades()])
        .then(([s, f, g]) => setRefs({ subjects: s, fields: f, grades: g }))
        .catch((e) => toast.error(e?.message ?? "تعذر تحميل القوائم"));
    }
  }, [open, teacher]);

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const r = await uploadTeacherFile("teachers", f);
      setPhotoUrl(r.url);
      toast.success("تم رفع الصورة");
    } catch (err: any) {
      toast.error("فشل رفع الصورة: " + (err?.message ?? ""));
    } finally {
      setUploading(false);
    }
  }

  function toggleRef(key: keyof LinksState, id: string) {
    setLinks((prev) => {
      const arr = prev[key].includes(id) ? prev[key].filter((x) => x !== id) : [...prev[key], id];
      return { ...prev, [key]: arr };
    });
  }

  async function addRef(key: "subjects" | "fields" | "grades", name: string) {
    const table =
      key === "subjects"
        ? "teacher_subjects"
        : key === "fields"
          ? "teacher_fields"
          : "teacher_grades";
    const linkKey =
      key === "subjects" ? "subject_ids" : key === "fields" ? "field_ids" : "grade_ids";
    try {
      const item = await addRefItem(table, name);
      setRefs((prev) => ({
        ...prev,
        [key]: [...prev[key], item].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      setLinks((prev) => ({
        ...prev,
        [linkKey]: prev[linkKey].includes(item.id) ? prev[linkKey] : [...prev[linkKey], item.id],
      }));
    } catch (e: any) {
      toast.error(e?.message ?? "تعذرت الإضافة");
    }
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("اكتب اسم المعلم");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: trimmed,
        bio,
        photo_url: photoUrl,
        website_url: website.trim() || null,
        social_links: socials.filter((s) => s.url.trim()),
        is_published: published,
        featured,
        sort_order: Number(sortOrder) || 0,
      };
      if (teacher) {
        await updateTeacher(teacher.id, { ...payload, slug: slug.trim() || slugify(trimmed) });
        await replaceTeacherLinks(teacher.id, links);
        toast.success("تم تحديث المعلم");
      } else {
        await createTeacher({
          ...payload,
          slug: slug.trim() || slugify(trimmed),
          links,
        });
        toast.success("تمت إضافة المعلم");
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{teacher ? "تعديل معلم" : "إضافة معلم"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-16 w-16 text-lg">
              <AvatarImage src={photoUrl ?? undefined} />
              <AvatarFallback className="bg-primary/15 text-primary">
                {trimmed0fy(name)}
              </AvatarFallback>
            </Avatar>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-muted px-3 py-2 text-sm hover:bg-accent">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}{" "}
              صورة المعلم
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            </label>
            {photoUrl && (
              <Button size="sm" variant="ghost" onClick={() => setPhotoUrl(null)}>
                إزالة
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الاسم *</Label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!teacher || !slug) setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <div>
              <Label>الرابط المختصر (slug)</Label>
              <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} dir="ltr" />
            </div>
          </div>

          <div>
            <Label>نبذة</Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="min-h-[70px]"
            />
          </div>

          <div>
            <Label>الموقع الإلكتروني</Label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
              dir="ltr"
            />
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <Label>حسابات التواصل</Label>
            {socials.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={s.platform}
                  onChange={(e) => {
                    const next = [...socials];
                    next[i] = { ...next[i], platform: e.target.value };
                    setSocials(next);
                  }}
                  placeholder="المنصة (إنستغرام...)"
                  className="w-1/3"
                />
                <Input
                  value={s.url}
                  onChange={(e) => {
                    const next = [...socials];
                    next[i] = { ...next[i], url: e.target.value };
                    setSocials(next);
                  }}
                  placeholder="https://..."
                  dir="ltr"
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setSocials(socials.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSocials([...socials, { platform: "", url: "" }])}
            >
              <Plus className="h-3 w-3" /> إضافة حساب
            </Button>
          </div>

          <RefPicker
            title="المواد"
            items={refs.subjects}
            selected={links.subject_ids}
            onToggle={(id) => toggleRef("subject_ids", id)}
            onAdd={(n) => addRef("subjects", n)}
          />
          <RefPicker
            title="الحقول"
            items={refs.fields}
            selected={links.field_ids}
            onToggle={(id) => toggleRef("field_ids", id)}
            onAdd={(n) => addRef("fields", n)}
          />
          <RefPicker
            title="الصفوف"
            items={refs.grades}
            selected={links.grade_ids}
            onToggle={(id) => toggleRef("grade_ids", id)}
            onAdd={(n) => addRef("grades", n)}
          />

          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={published} onCheckedChange={setPublished} />
              منشور
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={featured} onCheckedChange={setFeatured} />
              مميز
            </label>
            <div className="flex items-center gap-2 text-sm">
              <Label className="text-xs">الترتيب</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="h-8 w-20"
              />
            </div>
          </div>

          <Button onClick={save} className="w-full" disabled={saving}>
            {saving && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function trimmed0fy(name: string): string {
  return (name ?? "").trim().charAt(0) || "؟";
}
