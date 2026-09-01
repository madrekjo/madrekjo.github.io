// ============================================================
// نقل الصور من Supabase Storage إلى Cloudinary
// - ينزل كل الملفات من buckets الموقعة الستة
// - يرفعها إلى Cloudinary (preset: madarik unsigned)
// - يحدّث كل الجداول بحيث تشير إلى عناوين Cloudinary الجديدة
// لا يحذف أي شيء من Supabase - ينقل فقط ويحدّث الروابط
// ============================================================
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// ---------- قراءة الإعدادات من .env.local ----------
const envRaw = fs.readFileSync(path.join("C:/Users/abdal_cw9hjgr/OneDrive/Desktop/مدارك جو موقع جديد/chat", ".env.local"), "utf8");
const env = {};
for (const line of envRaw.split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const SUPABASE_URL = env.VITE_SUPABASE_URL || "https://ofltanaffcxoobfvlkii.supabase.co";
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE;
if (!SERVICE_ROLE || SERVICE_ROLE === "PLACE_KEY_HERE") {
  console.error("❌ مفتاح service_role غير موجود في chat/.env.local");
  process.exit(1);
}

const CLOUD_NAME = env.VITE_CLOUDINARY_CLOUD_NAME || "iahnnsgu";
const UPLOAD_PRESET = env.VITE_CLOUDINARY_UPLOAD_PRESET || "madarik";
const CLOUDINARY_UPLOAD_URL = (type) => `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${type}/upload`;

// ---------- انشاء عميل Supabase ----------
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKETS = ["avatars", "post-media", "schedules", "support-media", "round-meetings", "staff-chat"];

// ---------- تنزيل قائمة بكل الملفات (متكررة عبر المجلدات) ----------
async function listAllFiles(bucket) {
  const files = [];
  async function walk(folder) {
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(folder, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`list ${bucket}/${folder}: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const item of data) {
        const itemPath = folder ? `${folder}/${item.name}` : item.name;
        if (item.id) {
          // ملف
          files.push(itemPath);
        } else {
          // مجلد -> تعميق
          await walk(itemPath);
        }
      }
      offset += data.length;
      if (data.length < 100) break;
    }
  }
  await walk("");
  return files;
}

// ---------- تحديد نوع المورد ----------
function resourceTypeFromFile(fileName, contentType) {
  const img = /\.(png|jpe?g|gif|webp|svg|bmp|ico|tif|tiff|heic|heif|avif)$/i.test(fileName);
  const vid = /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(fileName);
  if (img) return "image";
  if (vid) return "video";
  if (contentType && contentType.startsWith("image/")) return "image";
  if (contentType && contentType.startsWith("video/")) return "video";
  return "raw";
}

// ---------- رفع ملف إلى Cloudinary ----------
async function uploadToCloudinary(buffer, contentType, fileName, resourceType) {
  const url = CLOUDINARY_UPLOAD_URL(resourceType === "video" ? "video" : "image");
  const form = new FormData();
  const blob = new Blob([buffer], { type: contentType || undefined });
  form.append("file", blob, fileName);
  form.append("upload_preset", UPLOAD_PRESET);
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`Cloudinary ${resourceType} upload ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.secure_url || data.url;
}

// ---------- بناء نطاق الروابط ----------
function publicUrl(bucket, filePath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`;
}

// تحويل رابط Supabase قديم إلى Cloudinary جديد (إن وُجد)
function remapUrl(value, map) {
  if (typeof value !== "string") return value;
  if (!value.includes(`${SUPABASE_URL.replace(/\/$/, "")}/storage`)) return value;
  const publicMatch = value.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  const signMatch = value.match(/\/storage\/v1\/object\/sign\/([^/]+)\/([^?]+)/);
  if (publicMatch) {
    const key = `${publicMatch[1]}/${publicMatch[2]}`;
    return map[key] ? map[key].newUrl : value;
  }
  if (signMatch) {
    const key = `${signMatch[1]}/${signMatch[2]}`;
    return map[key] ? map[key].newUrl : value;
  }
  return value;
}

// ---------- العمليات ----------
async function main() {
  console.log("🚀 بدء نقل الصور من Supabase إلى Cloudinary...\n");
  const map = {}; // key: bucket/path => {newUrl, size, type}
  const summary = { total: 0, ok: 0, failed: 0, bytes: 0 };

  for (const bucket of BUCKETS) {
    let files;
    try {
      files = await listAllFiles(bucket);
    } catch (e) {
      console.log(`⚠️  فشل قراءة bucket ${bucket}: ${e.message}`);
      continue;
    }
    console.log(`📁 ${bucket}: ${files.length} ملف`);

    for (const filePath of files) {
      summary.total++;
      try {
        const { data, error } = await supabase.storage.from(bucket).download(filePath);
        if (error) throw new Error(`download: ${error.message}`);
        const buffer = Buffer.from(await data.arrayBuffer());
        const contentType = data.type || "";
        const fileName = filePath.split("/").pop();
        const resourceType = resourceTypeFromFile(fileName, contentType);
        const newUrl = await uploadToCloudinary(buffer, contentType, fileName, resourceType);
        map[`${bucket}/${filePath}`] = { newUrl, size: buffer.length, type: resourceType };
        summary.ok++;
        summary.bytes += buffer.length;
        console.log(`   ✅ ${bucket}/${filePath} (${(buffer.length / 1024).toFixed(1)}KB) -> ${newUrl.slice(0, 60)}...`);
      } catch (e) {
        summary.failed++;
        console.log(`   ❌ ${bucket}/${filePath}: ${e.message.slice(0, 120)}`);
      }
    }
  }

  console.log(`\n📊 النتائج: ${summary.ok} نجحت / ${summary.failed} فشلت / ${summary.total} إجمالي (${(summary.bytes / 1024 / 1024).toFixed(1)}MB)`);

  // ---------- تحديث قاعدة البيانات ----------
  const tables = [
    { name: "profiles", pk: "id", cols: ["avatar_url"] },
    { name: "posts", pk: "id", cols: ["image_url", "image_urls", "video_url"] },
    { name: "schedules", pk: "id", cols: ["image_url"] },
    { name: "changes_messages", pk: "id", cols: ["image_url"] },
    { name: "staff_chat", pk: "id", cols: ["image_url"] },
    { name: "round_meeting_messages", pk: "id", cols: ["image_url"] },
    { name: "support_messages", pk: "id", cols: ["image_urls"] },
  ];

  console.log("\n🔄 تحديث الجداول...");
  for (const t of tables) {
    const { data: rows, error } = await supabase.from(t.name).select(`id, ${t.cols.join(",")}`);
    if (error) {
      console.log(`   ⚠️  فشل قراءة ${t.name}: ${error.message}`);
      continue;
    }
    let changed = 0;
    for (const row of rows || []) {
      const update = {};
      let dirty = false;
      for (const col of t.cols) {
        const oldVal = row[col];
        if (Array.isArray(oldVal)) {
          const mapped = oldVal.map((u) => remapUrl(u, map)).filter(Boolean);
          if (JSON.stringify(mapped) !== JSON.stringify(oldVal)) {
            update[col] = mapped;
            dirty = true;
          }
        } else if (typeof oldVal === "string" && oldVal.includes("/storage/")) {
          const newVal = remapUrl(oldVal, map);
          if (newVal !== oldVal) {
            update[col] = newVal;
            dirty = true;
          }
        }
      }
      if (dirty) {
        const { error: uErr } = await supabase.from(t.name).update(update).eq(t.pk, row[t.pk]);
        if (uErr) console.log(`   ❌ ${t.name} id=${row[t.pk]}: ${uErr.message.slice(0, 100)}`);
        else changed++;
      }
    }
    console.log(`   ${t.name}: تحديث ${changed} صف`);
  }

  // ---------- تقرير نهائي ----------
  console.log("\n✅ انتهى النقل");
  console.log("المستخدم للـ Egress الأساسي على Supabase بعد الآن: فقط الرسائل النصية والقاعدة، الصور كلها من Cloudinary.");

  // نسخة احتياطية من روابط الخرائط
  fs.writeFileSync(
    path.join("C:/Users/abdal_cw9hjgr/OneDrive/Desktop/مدارك جو موقع جديد/chat", "cloudinary-migration-map.json"),
    JSON.stringify(map, null, 2)
  );
  console.log("💾 حُفظت خريطة التحويل في chat/cloudinary-migration-map.json");
}

main().catch((e) => {
  console.error("❌ خطأ عام:", e.message);
  process.exit(1);
});