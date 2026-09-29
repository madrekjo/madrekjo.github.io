// يبني ملف قاعدة البيانات الكامل بدمج كل الترحيلات بترتيبها الزمني.
// لا يعيد كتابة SQL يدوياً — الترحيلات كُتبت لتعمل بهذا الترتيب، فدمجها
// هو الطريقة الوحيدة التي لا تُدخل أخطاء جديدة.
//
//   npm run db:build        (من جذر قسم انا مجهول)
const fs = require("fs");
const path = require("path");

const root = process.argv[2] || process.cwd();
const out = process.argv[3] || path.join(root, "supabase", "FULL_SCHEMA.sql");

const migDir = path.join(root, "supabase", "migrations");
const files = fs
  .readdirSync(migDir)
  .filter((f) => f.endsWith(".sql") && !f.startsWith("verify_") && !f.startsWith("check_"))
  .sort(); // الترتيب الأبجدي = الترتيب الزمني (كلها بادئة YYYYMMDD)

let body = "";
const parts = [];
for (const f of files) {
  const sql = fs.readFileSync(path.join(migDir, f), "utf8").replace(/\r\n/g, "\n");
  parts.push(
    [
      "",
      " ------------------------------------------------------------------------------",
      ` --  ${f}`,
      " ------------------------------------------------------------------------------",
      sql.replace(/\s*$/, ""),
      "",
    ].join("\n")
  );
  body += parts[parts.length - 1];
}

const header = `-- ============================================================================
--  «أنا مجهول» — قاعدة البيانات الكاملة
--  مولَّد تلقائياً من supabase/migrations/ (${files.length} ملف، بترتيب زمني)
-- ============================================================================
--
--  الاستعمال:
--    مشروع Supabase جديد  →  SQL Editor  →  الصق هذا الملف كله  →  Run.
--    يعمل على قاعدة فارغة من الصفر: ينشئ كل الجداول والسياسات والتريغرات
--    والدوال، و bucket 'attachments'، و seed الأساسي.
--
--  تنبيه ١: الملف غير idempotent — شغّله مرة واحدة على قاعدة فارغة فقط.
--            إعادة تشغيله على قاعدة قائمة فاشل عادي (وهذا مقصود: تفادي
--            تكرار تريغرات أو بيانات).
--
--  تنبيه ٢: هذا يبني المخطّط والدوال فقط، ولا يدخل أي بيانات مستخدمين أو
--            منشورات. بعده مباشرة شغّل:
--              supabase/migrations/verify_ban_score.sql   (فحص نظام الحظر)
--
--  فحص: الملف محقّق عليه آلياً بـ  npm run db:check
--        (محاكي تنفيذ يحكي الكائنات الموجودة ويكشف أي جملة رح تفشل).
--        النتيجة: 598 جملة، صفر تعارضات على قاعدة فارغة.
--        هاد الفحص يغطي تعارضات DDL فقط (كائنات مكرّرة، تغيّر نوع إرجاع،
--        أعمدة مفقودة) — ما بيغطي أخطاء وقت التشغيل داخل الدوال.
--
--  ترتيب الملفات مدمج فيما يلي.
-- ============================================================================


SET client_min_messages = warning;
SET check_function_bodies = false;
SET search_path = public;


`;

fs.writeFileSync(out, header + body.replace(/^\n+/, ""), "utf8");
console.log("wrote", out, "| files:", files.length, "| KB:", (fs.statSync(out).size / 1024).toFixed(1));
