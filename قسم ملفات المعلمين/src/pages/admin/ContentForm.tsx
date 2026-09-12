import { useEffect, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Upload, Paperclip } from "lucide-react";
import {
  createContent,
  updateContent,
  CONTENT_TYPES,
  contentTypeLabel,
  type TeacherContent,
  type ContentType,
} from "@/lib/teacher-files";
import { uploadTeacherFile, allowedExtensionsLabel, FILE_ACCEPT } from "@/lib/upload";

export function ContentForm({
  open,
  onOpenChange,
  sectionId,
  content,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sectionId: string;
  content: TeacherContent | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState<ContentType>("file");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileMime, setFileMime] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [published, setPublished] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(content?.title ?? "");
      setDescription(content?.description ?? "");
      setContentType((content?.content_type as ContentType) ?? "file");
      setFileUrl(content?.file_url ?? null);
      setFileName(content?.file_name ?? null);
      setFileMime(content?.file_mime ?? null);
      setLinkUrl(content?.link_url ?? "");
      setPublished(content?.is_published ?? true);
    }
  }, [open, content]);

  const needsFile =
    contentType === "file" || contentType === "image" || (contentType === "video" && !linkUrl);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const r = await uploadTeacherFile("contents", f);
      setFileUrl(r.url);
      setFileName(f.name);
      setFileMime(r.type);
      if (!title.trim()) setTitle(f.name);
      toast.success("تم رفع الملف");
    } catch (err: any) {
      toast.error(err?.message ?? "فشل الرفع");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const t = title.trim();
    if (!t) {
      toast.error("اكتب عنوان المحتوى");
      return;
    }
    const isLink = contentType === "link" || (contentType === "video" && !needsFile);
    if (isLink && !linkUrl.trim()) {
      toast.error("اكتب الرابط");
      return;
    }
    if (needsFile && !fileUrl) {
      toast.error("ارفع الملف أولاً");
      return;
    }
    setSaving(true);
    try {
      const patch = {
        title: t,
        description,
        content_type: contentType,
        file_url: needsFile ? fileUrl : null,
        file_name: needsFile ? fileName : null,
        file_mime: needsFile ? fileMime : null,
        link_url: isLink ? linkUrl.trim() : null,
        is_published: published,
      };
      if (content) {
        await updateContent(content.id, patch);
        toast.success("تم التحديث");
      } else {
        await createContent({ section_id: sectionId, ...patch });
        toast.success("تمت الإضافة");
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
          <DialogTitle>{content ? "تعديل محتوى" : "إضافة محتوى"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>اسم المحتوى *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: ملخص الفصل الأول"
            />
          </div>

          <div>
            <Label>الوصف (اختياري)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[60px]"
            />
          </div>

          <div>
            <Label>نوع المحتوى</Label>
            <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_TYPES.map((ct) => (
                  <SelectItem key={ct} value={ct}>
                    {contentTypeLabel(ct)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {contentType === "link" || contentType === "video" ? (
            <div>
              <Label>
                {contentType === "video"
                  ? "رابط الفيديو (أو ارفع ملف فيديو بالأسفل)"
                  : "الرابط الخارجي"}
              </Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                dir="ltr"
              />
            </div>
          ) : null}

          {needsFile && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <Label className="text-sm">الملف</Label>
              {fileUrl && fileName ? (
                <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-1 truncate">
                    <Paperclip className="h-3 w-3" /> {fileName}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFileUrl(null);
                      setFileName(null);
                      setFileMime(null);
                    }}
                  >
                    إزالة
                  </Button>
                </div>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  اختيار ملف
                  <input
                    type="file"
                    accept={FILE_ACCEPT}
                    className="hidden"
                    onChange={onFile}
                    disabled={uploading}
                  />
                </label>
              )}
              <p className="text-[11px] text-muted-foreground">
                الأنواع المسموحة: {allowedExtensionsLabel()} — كحد أقصى 25 ميغابايت
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={published} onCheckedChange={setPublished} />
            منشور
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
