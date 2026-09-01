// Cloudinary unsigned upload - رفع مباشر من المتصفح.
// https://res.cloudinary.com/<cloud_name>/image/upload
// لتفعيله: أنشئ حساب على cloudinary.com مجاناً وعبّئ cloud_name و upload_preset.
// ملاحظة: بلا Sandbox باسم dlv4q1lzg و preset te8bwmkc - تبديلها من لوحة Cloudinary.
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "iahnnsgu";
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "madarik";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

export async function uploadToCloudinary(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", "madarik");
  // فولدر فرعي حسب النوع يمكن تحديده من المتصل عبر خيار
  const res = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloudinary upload failed (${res.status}): ${errText}`);
  }
  const data = await res.json();
  const url: string = data.secure_url || data.url;
  if (!url) throw new Error("Cloudinary returned no URL");
  return url;
}
