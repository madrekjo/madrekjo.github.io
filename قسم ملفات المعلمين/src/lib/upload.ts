import { supabase } from "@/integrations/supabase/client";

// Map extension → canonical Content-Type (authoritative — لا نثق بـ file.type)
const SAFE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  rar: "application/vnd.rar",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file

export function sanitizeFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = (dot > 0 ? name.slice(dot + 1) : "").toLowerCase();
  const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40) || "file";
  const safeExt = SAFE_TYPES[ext] ? ext : "bin";
  return `${safeBase}.${safeExt}`;
}

export function isAllowedFile(file: File): boolean {
  const dot = file.name.lastIndexOf(".");
  const ext = (dot > 0 ? file.name.slice(dot + 1) : "").toLowerCase();
  return !!SAFE_TYPES[ext];
}

export function allowedExtensionsLabel(): string {
  return Object.keys(SAFE_TYPES).join("، ");
}

export const FILE_ACCEPT = Object.entries(SAFE_TYPES)
  .map(([ext, mime]) => `${mime},.${ext}`)
  .join(",");

export async function uploadTeacherFile(
  prefix: string,
  file: File,
): Promise<{ url: string; name: string; type: string }> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `الملف كبير جداً (الحد الأقصى ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} ميغابايت)`,
    );
  }
  const dot = file.name.lastIndexOf(".");
  const ext = (dot > 0 ? file.name.slice(dot + 1) : "").toLowerCase();
  const contentType = SAFE_TYPES[ext];
  if (!contentType) {
    throw new Error("نوع الملف غير مسموح");
  }
  const safe = sanitizeFilename(file.name);
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const { error } = await supabase.storage.from("teacher-files").upload(path, file, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("teacher-files").getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, type: contentType };
}
