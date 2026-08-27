import { supabase } from "@/integrations/supabase/client";

// Maps extension → canonical Content-Type. This is authoritative:
// we never trust the browser-supplied file.type when uploading,
// which prevents stored-XSS via MIME spoofing on the storage CDN.
const SAFE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file

export function sanitizeFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = (dot > 0 ? name.slice(dot + 1) : "").toLowerCase();
  const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40) || "file";
  const safeExt = SAFE_TYPES[ext] ? ext : "bin";
  return `${safeBase}.${safeExt}`;
}

export async function uploadFile(
  prefix: string,
  file: File,
): Promise<{ url: string; name: string; type: string }> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`الملف كبير جداً (الحد الأقصى ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} ميغابايت)`);
  }
  const dot = file.name.lastIndexOf(".");
  const ext = (dot > 0 ? file.name.slice(dot + 1) : "").toLowerCase();
  const contentType = SAFE_TYPES[ext];
  if (!contentType) {
    throw new Error("نوع الملف غير مسموح");
  }
  const safe = sanitizeFilename(file.name);
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const { error } = await supabase.storage.from("attachments").upload(path, file, {
    contentType, // authoritative — ignores file.type
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("attachments").getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, type: contentType };
}
