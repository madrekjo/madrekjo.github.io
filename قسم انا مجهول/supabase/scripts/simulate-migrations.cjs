// محاكي تنفيذ: يشغّل الترحيلات بالترتيب على قاعدة فارغة ذهنياً،
// ويكشف كل جملة كانت رح تفشل — بدل ما يكتشف المستخدم خطأ كل مرة.
//
// الهدف: lista كاملة بأخطاء "مشكلة في ملف" من أول مرة، مش بالتجربة.

const fs = require("fs");
const path = require("path");

const migDir = process.argv[2] || path.join(process.cwd(), "supabase", "migrations");

// ---------------------------------------------------------------- tokenizer
// نزيل التعليقات ونقسّم الجمل، مع احترام النصوص وكتل $$$$
function stripComments(sql) {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    // كتلة $$...$$ أو $tag$...$tag$
    if (c === "$") {
      const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        out += sql.slice(i, stop); // نُبقي الكتلة كما هي (مهم: فيها جمل)
        i = stop;
        continue;
      }
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? n : end;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      out += " ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function splitStatements(sql) {
  const stmts = [];
  let buf = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "$") {
      const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        buf += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      buf += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ";") {
      stmts.push(buf);
      buf = "";
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  if (buf.trim()) stmts.push(buf);
  return stmts.map((s) => s.trim()).filter(Boolean);
}

// --------------------------------------------------------------- normalizers
function normType(t) {
  return t
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/character varying/g, "varchar")
    .replace(/timestamp with time zone/g, "timestamptz")
    .replace(/timestamp without time zone/g, "timestamp")
    .replace(/double precision/g, "float8")
    .replace(/\s*\[/g, "[]")
    .replace(/\s+/g, "");
}

// يحوّل قوائم الوسائط إلى (text, timestamptz, numeric) — نأخذ الأنواع فقط
function normArgs(raw) {
  const s = raw.trim();
  if (!s) return "";
  const parts = [];
  let depth = 0, cur = "", q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);

  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      // احذف "= الافتراضي" و OUT/IN/VARIADIC و اسم الوسيط
      let t = p;
      const eq = t.search(/\s+default\s+/i);
      if (eq !== -1) t = t.slice(0, eq);
      t = t.replace(/^\s*(in|out|inout|variadic)\s+/i, "");
      // الوسيط = [الاسم] النوع  → خذ آخر رمز(-ين) قبل أي default/[]
      const words = t.trim().split(/\s+/);
      let typePart;
      if (words.length <= 1) typePart = words[0] || "";
      else typePart = words.slice(1).join(" ");
      return normType(typePart);
    })
    .filter(Boolean)
    .join(",");
}

// ------------------------------------------------------------------- state
const state = {
  tables: new Map(),   // table -> Set(columns)
  cols: new Map(),     // "table.column" -> true
  funcs: new Map(),    // "name(argtypes)" -> returnType
  idx: new Map(),      // index name -> table
  types: new Map(),    // type name -> true
  pol: new Map(),      // "table|policy" -> true
  trg: new Map(),      // "table|trigger" -> true
  views: new Map(),    // view -> column list
  ext: new Map(),
};

const problems = [];
let file = "";

function fail(code, msg, stmt) {
  problems.push({ file, code, msg, stmt: stmt.replace(/\s+/g, " ").slice(0, 150) });
}

const RE = {
  createTable: /^create\s+(?:unlogged\s+)?table\s+(if\s+not\s+exists\s+)?([\w".]+)\s*\(([\s\S]*)$/i,
  createType: /^create\s+type\s+([\w".]+)/i,
  createIndex: /^create\s+(unique\s+)?index\s+(concurrently\s+)?(if\s+not\s+exists\s+)?([\w".]+)\s+on\s+([\w".]+)/i,
  createPolicy: /^create\s+policy\s+([\w"]+)\s+on\s+([\w".]+)/i,
  createTrigger: /^create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+([\w"]+)\s+on\s+([\w".]+)/i,
  createFunc: /^create\s+(or\s+replace\s+)?function\s+([\w".]+)\s*\(([\s\S]*?)\)\s*returns\s+([\s\S]*?)(?:\s+language\b|\s+as\s+|$)/i,
  dropThing: /^drop\s+(function|table|index|type|policy|trigger|view|view\s+if\s+exists|extension|materialized\s+view)\s+(if\s+exists\s+)?([\w".]+(?:\s*\([^)]*\))?)/i,
  addColumn: /^alter\s+table\s+(if\s+exists\s+)?(?:only\s+)?([\w".]+)\s+add\s+(column\s+)?(if\s+not\s+exists\s+)?([\w"]+)/i,
  createView: /^create\s+(or\s+replace\s+)?view\s+([\w".]+)\s*\(/i,
  addEnumValue: /^alter\s+type\s+([\w".]+)\s+add\s+value\s+['"]?([\w]+)['"]?/i,
  renameColumn: /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w".]+)\s+rename\s+(column\s+)?([\w"]+)\s+to\s+([\w"]+)/i,
  dropColumn: /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w".]+)\s+drop\s+(column\s+)?(if\s+exists\s+)?([\w"]+)/i,
  setDefault: /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w".]+)\s+alter\s+column\s+([\w"]+)\s+set\s+default/i,
};

function bare(s) {
  return s.replace(/^"|"$/g, "").toLowerCase();
}

const TRACE = process.env.TRACE ? process.env.TRACE.split(",") : [];
function trace(s, branch) {
  if (!TRACE.length) return;
  if (TRACE.some((t) => s.toLowerCase().includes(t))) {
    console.log(`  TRACE[${branch}] ${s.replace(/\s+/g, " ").slice(0, 110)}`);
  }
}

function run(stmt) {
  const s = stmt.trim();
  if (/admin_ban_device/.test(s)) trace(s, "in");

  // ---- DROP (يزيل من الحالة) ----
  let m = s.match(/^drop\s+(function|table|index|type|policy|trigger|view|materialized\s+view|extension|schema|cascade)\s+(if\s+exists\s+)?("[^"]+"|[\w".]+(?:\s*\([^)]*\))?)/i);
  if (m) {
    const what = m[1].toLowerCase();
    const ifExists = !!m[2];
    const target = m[3];
    const bn = bare(target);
    const isFn = what === "function";
    if (isFn) {
      const paren = target.indexOf("(");
      const fname = bare(paren === -1 ? target : target.slice(0, paren));
      const key = `${fname}(${paren === -1 ? "" : normArgs(target.slice(paren + 1, target.lastIndexOf(")")))})`;
      if (!ifExists && !state.funcs.has(key)) {
        fail("2P01", `DROP FUNCTION ${key} — الدالة مش موجودة أصلاً (محتاجة IF EXISTS)`, s);
      }
      trace(s, "drop-fn key=[" + key + "]");
      state.funcs.delete(key);
    } else if (what === "table") {
      if (!ifExists && !state.tables.has(bn)) {
        fail("2P01", `DROP TABLE ${bn} — الجدول مش موجود أصلاً (محتاجة IF EXISTS)`, s);
      }
      state.tables.delete(bn);
      for (const k of [...state.cols.keys()]) if (k.startsWith(bn + ".")) state.cols.delete(k);
      for (const k of [...state.pol.keys()]) if (k.startsWith(bn + "|")) state.pol.delete(k);
      for (const k of [...state.trg.keys()]) if (k.startsWith(bn + "|")) state.trg.delete(k);
      for (const [k, v] of state.idx) if (v === bn) state.idx.delete(k);
    } else if (what === "index") {
      state.idx.delete(bn);
    } else if (what === "type") {
      state.types.delete(bn);
    } else if (what === "policy") {
      for (const k of [...state.pol.keys()]) if (k.endsWith("|" + bn)) state.pol.delete(k);
    } else if (what === "trigger") {
      for (const k of [...state.trg.keys()]) if (k.endsWith("|" + bn)) state.trg.delete(k);
    } else if (what === "view" || what === "materialized view") {
      state.views.delete(bn);
    } else if (what === "extension") {
      state.ext.delete(bn);
    }
    return;
  }

  // ---- DROP POLICY IF EXISTS name ON table ----
  // الأسماءquoeted ممكن تحتوي مسافات ("admins read ban bypasses")، فبدون
  // ("[^"]+"|[\w.]+) كان الفحص يتجاهل كل سياسة في المخطط بصمت.
  m = s.match(/^drop\s+policy\s+(if\s+exists\s+)?("[^"]+"|[\w.]+)\s+on\s+("[^"]+"|[\w.]+)/i);
  if (m) {
    const key = `${bare(m[3])}|${bare(m[2])}`;
    if (!m[1] && !state.pol.has(key)) {
      fail("2P01", `DROP POLICY ${key} — السياسة مش موجودة أصلاً (محتاجة IF EXISTS)`, s);
    }
    state.pol.delete(key);
    return;
  }

  // ---- DROP TRIGGER IF EXISTS name ON table ----
  m = s.match(/^drop\s+trigger\s+(if\s+exists\s+)?("[^"]+"|[\w.]+)\s+on\s+("[^"]+"|[\w.]+)/i);
  if (m) {
    const key = `${bare(m[3])}|${bare(m[2])}`;
    if (!m[1] && !state.trg.has(key)) {
      fail("2P01", `DROP TRIGGER ${key} — التريغر مش موجود أصلاً (محتاجة IF EXISTS)`, s);
    }
    state.trg.delete(key);
    return;
  }

  // ---- CREATE TABLE ----
  m = s.match(/^create\s+(?:unlogged\s+)?table\s+(if\s+not\s+exists\s+)?([\w".]+)\s*\(([\s\S]*)$/i);
  if (m) {
    const ifNot = !!m[1];
    const t = bare(m[2]);
    if (!ifNot && state.tables.has(t)) {
      fail("42P07", `الجدول ${t} موجود أصلاً و CREATE TABLE بلا IF NOT EXISTS`, s);
    }
    const body = m[3].replace(/\)\s*(?:with\s*\([^)]*\))?\s*(?:partition\s+by[^;]*)?$/i, "");
    const cols = new Set();
    // نقسّم جسم التعريف顶层 ونأخذ أول رمز في كل تعريف
    let depth = 0, cur = "";
    for (const ch of body) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { cols.add(cur); cur = ""; continue; }
      cur += ch;
    }
    if (cur.trim()) cols.add(cur);
    for (const c of cols) {
      const name = c.trim().split(/\s+/)[0]?.replace(/"/g, "").toLowerCase();
      if (name && !/^(primary|unique|foreign|check|constraint|exclude|like)$/.test(name)) {
        state.cols.set(`${t}.${name}`, true);
      }
    }
    if (!state.tables.has(t)) state.tables.set(t, new Set());
    for (const k of state.cols.keys()) if (k.startsWith(t + ".")) state.tables.get(t).add(k.slice(t.length + 1));
    return;
  }

  // ---- CREATE TYPE ----
  m = s.match(/^create\s+type\s+([\w".]+)/i);
  if (m) {
    const t = bare(m[1]);
    if (state.types.has(t)) {
      fail("42P07", `النوع ${t} موجود أصلاً و CREATE TYPE بلا guard`, s);
    }
    state.types.set(t, true);
    return;
  }

  // ---- ALTER TYPE ... ADD VALUE ----
  m = s.match(/^alter\s+type\s+([\w".]+)\s+add\s+value\s+['"]?([\w]+)['"]?/i);
  if (m) {
    const t = bare(m[1]);
    if (!state.types.has(t)) {
      fail("42704", `ALTER TYPE ${t} — النوع مش موجود (CREATE TYPE ناقص أو بمسار غلط)`, s);
    }
    return;
  }

  // ---- CREATE INDEX ----
  m = s.match(/^create\s+(unique\s+)?index\s+(concurrently\s+)?(if\s+not\s+exists\s+)?([\w".]+)\s+on\s+([\w".]+)/i);
  if (m) {
    const ifNot = !!m[3];
    const n = bare(m[4]);
    if (!ifNot && state.idx.has(n)) {
      fail("42P07", `الفهرس ${n} موجود أصلاً (على ${state.idx.get(n)}) و CREATE INDEX بلا IF NOT EXISTS`, s);
    }
    state.idx.set(n, bare(m[5]));
    return;
  }

  // ---- CREATE POLICY ----
  m = s.match(/^create\s+policy\s+("[^"]+"|[\w.]+)\s+on\s+("[^"]+"|[\w.]+)/i);
  if (m) {
    const key = `${bare(m[2])}|${bare(m[1])}`;
    if (state.pol.has(key)) {
      fail("42710", `السياسة ${m[1]} موجودة أصلاً على ${m[2]} (محتاجة DROP POLICY IF EXISTS قبلها)`, s);
    }
    state.pol.set(key, true);
    return;
  }

  // ---- CREATE TRIGGER ----
  m = s.match(/^create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+("[^"]+"|[\w.]+)\s+on\s+("[^"]+"|[\w.]+)/i);
  if (m) {
    const key = `${bare(m[2])}|${bare(m[1])}`;
    if (state.trg.has(key)) {
      fail("42710", `التريغر ${m[1]} موجود أصلاً على ${m[2]} (محتاجة DROP TRIGGER IF EXISTS قبلها)`, s);
    }
    state.trg.set(key, true);
    return;
  }

  // ---- CREATE VIEW ----
  m = s.match(/^create\s+(or\s+replace\s+)?view\s+([\w".]+)/i);
  if (m) {
    state.views.set(bare(m[2]), null);
    return;
  }

  // ---- CREATE FUNCTION ----
  m = s.match(/^create\s+(or\s+replace\s+)?function\s+([\w".]+)\s*\(([\s\S]*?)\)\s*returns\s+([\s\S]*?)(?=\s+(?:language|as|begin|declare)\b|$)/i);
  if (m) {
    const fname = bare(m[2]);
    const args = normArgs(m[3]);
    let ret = normType(m[4]);
    if (ret.startsWith("table")) ret = "table" + ret.slice(5);
    const key = `${fname}(${args})`;
    const prev = state.funcs.get(key);
    if (prev !== undefined && prev !== ret) {
      fail("42P13", `نوع إرجاع ${fname} تغيّر: ${prev} ← ${ret} (لازم DROP FUNCTION ${key} أولاً)`, s);
    }
    trace(s, `create-fn key=[${key}] ret=${ret} prev=${prev}`);
    state.funcs.set(key, ret);
    return;
  }

  // ---- ALTER TABLE ADD COLUMN ----
  m = s.match(/^alter\s+table\s+(if\s+exists\s+)?(?:only\s+)?([\w".]+)\s+add\s+(column\s+)?(if\s+not\s+exists\s+)?([\w"]+)/i);
  if (m) {
    const t = bare(m[2]);
    const col = bare(m[5]);
    const ifNot = !!m[4];
    if (!state.tables.has(t) && !m[1]) {
      fail("42P01", `ALTER TABLE ${t} — الجدول مش موجود`, s);
    }
    if (state.cols.has(`${t}.${col}`) && !ifNot) {
      fail("42701", `العمود ${t}.${col} موجود أصلاً و ADD COLUMN بلا IF NOT EXISTS`, s);
    }
    state.cols.set(`${t}.${col}`, true);
    return;
  }

  // ---- ALTER TABLE DROP CONSTRAINT / PRIMARY KEY / FOREIGN KEY ----
  // القيود ما بتسبب تعارض في ترحيل جديد، بس لازم نعرف إنها مش أعمدة.
  m = s.match(/^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w".]+)\s+drop\s+(constraint|primary\s+key|unique|foreign\s+key|check|index|exclusion)\s+/i);
  if (m) return;

  // ---- ALTER TABLE DROP COLUMN ----
  m = s.match(/^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w".]+)\s+drop\s+(?:column\s+)?(if\s+exists\s+)?([\w"]+)/i);
  if (m) {
    const t = bare(m[1]);
    const ifExists = !!m[2];
    const col = bare(m[3]);
    if (!ifExists && state.tables.has(t) && !state.cols.has(`${t}.${col}`)) {
      fail("42703", `العمود ${t}.${col} مش موجود و DROP COLUMN بلا IF EXISTS`, s);
    }
    state.cols.delete(`${t}.${col}`);
    return;
  }

  // ---- RENAME COLUMN ----
  m = s.match(/^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w".]+)\s+rename\s+(column\s+)?([\w"]+)\s+to\s+([\w"]+)/i);
  if (m) {
    const t = bare(m[1]);
    state.cols.delete(`${t}.${bare(m[3])}`);
    state.cols.set(`${t}.${bare(m[4])}`, true);
    return;
  }
}

// ------------------------------------------------------------------- run all
const files = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
let total = 0;
for (const f of files) {
  file = f;
  const sql = stripComments(fs.readFileSync(path.join(migDir, f), "utf8").replace(/\r\n/g, "\n"));
  for (const st of splitStatements(sql)) {
    total++;
    run(st);
  }
}

const firstPassCount = problems.length;

// --rerun <file> : طبّق كل المخططات، ثم أعد تطبيق ملف واحد فوق القاعدة المبنية.
// هذا يلتقط الأخطاء التي لا تظهر على قاعدة فارغة — مثل 42710 على CREATE POLICY
// بلا DROP سابق، وهو بالضبط ما كسر إعادة تطبيق 20261002000000 على القاعدة الحية.
const rerunIdx = process.argv.indexOf("--rerun");
const rerunProblems = [];
if (rerunIdx !== -1) {
  const target = process.argv[rerunIdx + 1];
  const full = path.join(migDir, target);
  if (!target || !fs.existsSync(full)) {
    console.error(`\n❌ ملف غير موجود لإعادة التطبيق: ${target}`);
    process.exit(1);
  }
  const mark = problems.length;
  file = `${target}  ⟵ إعادة تطبيق`;
  const sql = stripComments(fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n"));
  let n = 0;
  for (const st of splitStatements(sql)) {
    total++;
    n++;
    run(st);
  }
  rerunProblems.push(...problems.slice(mark));
  console.log(
    rerunProblems.length === 0
      ? `\n✅ إعادة تطبيق ${target} (${n} جملة) على قاعدة مبنية: ما في تعارض.`
      : `\n❌ إعادة تطبيق ${target} (${n} جملة) على قاعدة مبنية: ${rerunProblems.length} جملة رح تفشل.`
  );
}

// dedupe by (code, msg)
const seen = new Set();
const uniq = problems.filter((p) => {
  const k = p.code + "|" + p.msg;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (uniq.length === 0) {
  console.log(`\n✅ ما في تعارضات. ${total} جملة على ${files.length} ملف — كلها بتنفذ على قاعدة فارغة.`);
} else {
  console.log(`\n⚠️  ${uniq.length} جملة رح تفشل (من ${total} جملة):\n`);
  uniq.forEach((p, i) => {
    console.log(`${i + 1}. [${p.code}] ${p.file}`);
    console.log(`   ${p.msg}`);
    console.log(`   > ${p.stmt}\n`);
  });
}

if (rerunProblems.length) process.exit(1);
