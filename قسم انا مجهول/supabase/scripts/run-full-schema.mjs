// ينفّذ supabase/FULL_SCHEMA.sql على مشروع Supabase عبر Management API.
// يقسم الملف عند حدود الترحيلات — طلب لكل ترحيل — عشان لو في خطأ
// نعرف أي ملف بالضبط بدل ما نخسر 5,700 سطر دفعة وحدة.
//
// المفتاح يُقرأ من متغير بيئة فقط. ما يُكتب بأي ملف.
//
//   $env:SUPABASE_PAT = "<token>";  node run-full-schema.mjs <project-ref>

import fs from "node:fs";
import path from "node:path";

const PAT = process.env.SUPABASE_PAT;
const REF = process.argv[2];

if (!PAT) { console.error("MISSING SUPABASE_PAT"); process.exit(1); }
if (!REF) { console.error("MISSING project ref"); process.exit(1); }

const root = process.argv[3] || process.cwd();
const sql = fs
  .readFileSync(path.join(root, "supabase", "FULL_SCHEMA.sql"), "utf8")
  .replace(/\r\n/g, "\n");

// كل طلب في جلسة جديدة على الأرجح، فـ SET ما بي продолжа بين الطلبات.
// نعيدها مع كل قطعة حتى ما ينكسر إنشاء الدوال.
const PRELUDE = `SET client_min_messages = warning;\nSET check_function_bodies = false;\nSET search_path = public;\n`;

// نقسّم عند ترويسة كل ترحيل
const MARK = /^ --  (\d{14}_[\w.-]+\.sql)\s*$/gm;
const parts = [];
let last = null;
let m;
while ((m = MARK.exec(sql)) !== null) {
  if (last) parts.push({ name: last.name, body: sql.slice(last.start, m.index) });
  last = { name: m[1], start: m.index };
}
if (last) parts.push({ name: last.name, body: sql.slice(last.start) });

console.log(`FULL_SCHEMA.sql → ${parts.length} قطعة\n`);

let ok = 0;
const failed = [];

for (const [i, p] of parts.entries()) {
  const q = PRELUDE + p.body.trim() + "\n";
  let res, body;
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: q }),
    });
    body = await res.text();
  } catch (e) {
    console.log(`${i + 1}. ${p.name}\n   ✖ فشل الشبكة: ${e.message}`);
    failed.push({ name: p.name, error: String(e) });
    continue;
  }

  if (res.ok) {
    ok++;
    console.log(`${i + 1}. ✓ ${p.name}`);
  } else {
    console.log(`${i + 1}. ✖ ${p.name}  [HTTP ${res.status}]`);
    console.log("   " + body.slice(0, 600));
    failed.push({ name: p.name, status: res.status, body: body.slice(0, 2000) });
    // نتوقف: الملفات بعده تعتمد على هذا
    break;
  }
}

console.log(`\n${ok}/${parts.length} قطعة نجحت.`);
if (failed.length) {
  console.log("فشل أول قطعة: " + failed[0].name);
  process.exit(1);
} else {
  console.log("كل المخطط اتبنى بنجاح.");
}
