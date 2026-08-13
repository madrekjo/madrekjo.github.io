import fs from 'fs';
import path from 'path';

const dir = 'questions/math/semester-1/unit-01/';
const files = ['lesson-01.json', 'lesson-02.json', 'review.json'];

// Fields that should NEVER be math-wrapped
const SKIP_FIELDS = new Set([
  'id', 'number', 'difficulty', 'lesson_number', 'unit_number',
  'page_start', 'page_end', 'correct_answer', 'page', 'reference',
  'source'
]);

// Detect if a string segment is math (not Arabic)
function isMathSegment(seg) {
  if (seg.length < 3) return false;
  // Check for Arabic characters
  const arabicRange = '\u0600-\u06FF';
  if (new RegExp(`[${arabicRange}]`).test(seg)) return false;
  // Must contain at least one digit or math operator
  if (!/[0-9^=+\-*/().]/.test(seg)) return false;
  return true;
}

// Convert ASCII fraction patterns to LaTeX \frac
function convertFractions(s) {
  // (A) / (B) → \frac{A}{B}
  s = s.replace(/\(([^()]+?)\)\s*\/\s*\(([^()]+?)\)/g, '\\frac{$1}{$2}');
  // number / number → \frac{n}{m}
  s = s.replace(/(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}');
  // single letter / single letter (p/q, b/a)
  s = s.replace(/([a-zA-Z])\s*\/\s*([a-zA-Z])/g, '\\frac{$1}{$2}');
  // number / letter-group (1/2a, 3/4)
  s = s.replace(/(\d+)\s*\/\s*([a-zA-Z][a-zA-Z0-9]*)/g, '\\frac{$1}{$2}');
  // letter-group / number ((a+b)/2)
  s = s.replace(/([a-zA-Z][a-zA-Z0-9]*)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}');
  // letter / (paren) → A/(x+1)
  s = s.replace(/([a-zA-Z])\s*\/\s*\(([^()]+?)\)/g, '\\frac{$1}{$2}');
  // number / (paren) → 1/(x^2+1)
  s = s.replace(/(\d+)\s*\/\s*\(([^()]+?)\)/g, '\\frac{$1}{$2}');
  // Special: 1/2a → \frac{1}{2a}, 1/2a(x-a) → \frac{1}{2a(x-a)}
  s = s.replace(/(\d+)\/2([a-zA-Z])/g, '\\frac{$1}{2$2}');
  // Single letter / (paren) general case
  s = s.replace(/([a-zA-Z])\s*\/\s*\(([^()]+?)\)/g, '\\frac{$1}{$2}');
  // number / (paren) general
  s = s.replace(/(\d+)\s*\/\s*\(([^()]+?)\)/g, '\\frac{$1}{$2}');
  return s;
}

// Convert a math string to LaTeX
function convertMath(s) {
  if (!s) return s;
  s = s.replace(/\.\.\./g, '\\dots');
  s = s.replace(/±/g, '\\pm ');
  s = s.replace(/\*/g, '\\cdot ');
  s = convertFractions(s);
  return s;
}

// Detect if a string segment is math (not Arabic)
function isMathSegment(seg) {
  if (seg.length < 3) return false;
  const arabicRange = '\u0600-\u06FF';
  if (new RegExp(`[${arabicRange}]`).test(seg)) return false;
  if (!/[0-9^=+\-*/().]/.test(seg)) return false;
  return true;
}

// Process a string value: wrap math in $...$ and convert
function processString(s) {
  if (!s || typeof s !== 'string') return s;
  if (/^\$[^$]+\$$/.test(s.trim())) return s;
  
  let result = s.replace(/([A-Za-z0-9^+\-*/=()_,.\s\\{}[\]<>±]{3,})/g, (match) => {
    const trimmed = match.trim();
    if (!trimmed) return match;
    if (!isMathSegment(trimmed)) return match;
    if (trimmed.startsWith('$') && trimmed.endsWith('$')) return match;
    const converted = convertMath(trimmed);
    return '$' + converted + '$';
  });
  
  // Fix periods inside $...$: $74.$ → $74$.
  result = result.replace(/\$([^$]+?)\.([.,;:!?؛؛])(\$)/g, '$1$2$3');
  
  // Also handle: $...$. pattern where period should be outside
  result = result.replace(/\$([^$]+?)\.(\$)/g, '$1$.$2');
  
  return result;
}

// Walk object and process all string values
function walk(obj, skipField) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (SKIP_FIELDS.has(skipField)) return obj;
    if (/^\$[^$]+\$$/.test(obj.trim())) return obj;
    return processString(obj);
  }
  if (Array.isArray(obj)) return obj.map((item, i) => walk(item, skipField));
  if (typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      if (SKIP_FIELDS.has(key)) {
        result[key] = obj[key];
        continue;
      }
      result[key] = walk(obj[key], key);
    }
    return result;
  }
  return obj;
}

// Process each file
for (const file of files) {
  const filepath = path.join(dir, file);
  console.log(`Processing ${file}...`);
  
  const raw = fs.readFileSync(filepath, 'utf8');
  const data = JSON.parse(raw);
  const converted = walk(data, null);
  
  const output = JSON.stringify(converted, null, 2);
  JSON.parse(output);
  
  fs.writeFileSync(filepath, output, 'utf8');
  console.log(`  ✓ Saved ${file}`);
}

console.log('\nDone!');