// ============================================================
// build-fix.mjs — بعد اكتمال vite build
// ينقل مخرجات dist/ إلى جذر /chat/ (index.html + assets + public)
// حتى يعمل GitHub Pages مباشرة من الملفات الجاهزة داخل /chat/.
//
// ملاحظة: ننسخ الملفات واحداً واحداً (بدلاً من fs.cpSync العودي)
// لتفادي خلل أصلي في cpSync على Windows مع بعض البيئات.
// ============================================================
import { readdirSync, copyFileSync, rmSync, mkdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");

function copyFile(src, dest) {
  copyFileSync(src, dest);
}

for (const name of readdirSync(dist)) {
  const src = path.join(dist, name);
  const dest = path.join(root, name);

  if (name === "entry.html") {
    // مخرجات البناء تُسمى entry.html (نسبة لمدخل Vite).
    // نضعها كـ index.html الجاهز للعرض على GitHub Pages.
    copyFile(src, path.join(root, "index.html"));
    console.log("[build-fix] entry.html -> index.html");
    continue;
  }

  if (statSync(src).isDirectory()) {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    for (const f of readdirSync(src)) {
      copyFile(path.join(src, f), path.join(dest, f));
    }
    console.log("[build-fix] copied dir:", name);
  } else {
    copyFile(src, dest);
    console.log("[build-fix] copied file:", name);
  }
}

rmSync(dist, { recursive: true, force: true });
console.log("[build-fix] done (dist removed)");
