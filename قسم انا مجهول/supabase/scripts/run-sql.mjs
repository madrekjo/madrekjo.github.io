// ينفّذ استعلام/ملف SQL عبر Management API ويطبع النتيجة.
//   node run-sql.mjs <project-ref> "SELECT ..."
//   node run-sql.mjs <project-ref> --file path.sql
import fs from "node:fs";

const PAT = process.env.SUPABASE_PAT;
const REF = process.argv[2];
const mode = process.argv[3];
if (!PAT) { console.error("MISSING SUPABASE_PAT"); process.exit(1); }

let query =
  mode === "--file" ? fs.readFileSync(process.argv[4], "utf8") : mode;

// Management API تفهم SQL فقط — أوامر psql مثل \echo و \set ما عندها مكان.
// نحوّل \echo 'نص' إلى SELECT حتى ما تضيع عناوين الأقسام، ونحذف الباقي.
query = query
  .replace(/^\\echo\s+'([^']*)'\s*$/gm, "SELECT '$1' AS section;")
  .replace(/^\\[a-z]+.*$/gm, "");

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const text = await res.text();

if (!res.ok) {
  console.error("HTTP " + res.status);
  try {
    const j = JSON.parse(text);
    console.error(j.message || text);
    if (j.hint) console.error("HINT: " + j.hint);
    if (j.details) console.error("DETAILS: " + j.details);
  } catch { console.error(text); }
  process.exit(1);
}

let out;
try { out = JSON.parse(text); } catch { console.log(text); process.exit(0); }

if (!Array.isArray(out) || out.length === 0) {
  console.log("(لا صفوف — الأمر نجح)");
} else {
  for (const row of out) console.log(JSON.stringify(row, null, 2));
}
process.exit(0);
