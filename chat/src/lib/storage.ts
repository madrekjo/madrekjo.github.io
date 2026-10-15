// رفع الوسائط (صور/فيديو) إلى Supabase Storage داخل قاعدة الدردشة نفسها.
// استُبدل Cloudinary نهائياً — الدلو: chat-media (قراءة عامة عبر الرابط العام).
//
// بنية المسار داخل الدلو: <auth.uid()>/<timestamp>-<random>.<ext>
//   المجلد الأول = معرّف المستخدم، وهو ما تتحقّق منه سياسة الرفع (foldername(name))[1].
//
// ملاحظة: الدلو عام للقراءة، لذا لا نحتاج سياسة SELECT (والروابط العامة
// تعمل بلا سياسة قراءة). سياسات الكتابة فقط: إدراج/تحديث/حذف لمجلد صاحبه.
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "chat-media";

// 50MB — الحد الأقصى لملف واحد في الخطة المجانية من Supabase.
const MAX_BYTES = 50 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
};

function extFor(file: File): string {
  const byMime = MIME_EXT[file.type];
  if (byMime) return byMime;
  const nameExt = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "";
  if (nameExt && /^[a-z0-9]{1,5}$/.test(nameExt)) return nameExt;
  return "bin";
}

/**
 * يرفع ملفاً إلى دلو chat-media ويعيد رابطاً عاماً دائماً.
 * يرمي خطأً عربياً واضحاً عند الفشل (حجم كبير / غير مسجّل / خطأ شبكة).
 */
export async function uploadMedia(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error("حجم الملف كبير جداً (الحد 50 ميغابايت)");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("يجب تسجيل الدخول لرفع الملفات");

  const path = `${user.id}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${extFor(file)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(`فشل رفع الملف: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("تعذّر توليد رابط الملف");
  return data.publicUrl;
}

export function isStorageConfigured(): boolean {
  return true;
}
