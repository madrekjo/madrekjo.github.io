const fs = require('fs');
const path = require('path');

const SRC = 'C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله';
const raw = fs.readFileSync(path.join(SRC, 'دين 2010', 'وحده ثانيه.txt'), 'utf8').trim();

function extractJsonObjects(text) {
  const objects = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{' || c === '[') { if (depth === 0) start = i; depth++; }
    if (c === '}' || c === ']') { depth--; if (depth === 0 && start >= 0) { objects.push(text.slice(start, i + 1)); start = -1; } }
  }
  return objects;
}

const objects = extractJsonObjects(raw);
const obj = objects[0];
console.log('Object 0 length:', obj.length);
console.log('Around pos 2412:', JSON.stringify(obj.slice(2395, 2440)));
console.log('Char at 2412:', obj.charCodeAt(2412), String.fromCharCode(obj.charCodeAt(2412)));

// Also check: find the "lesson_title" in the 2009-style unit-02/lesson-06 for comparison
const dst = 'C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\مدارك جو موقع جديد\\questions\\2010\\semester-1';
const u02l06 = JSON.parse(fs.readFileSync(path.join(dst, 'islamic/unit-02/review.json'), 'utf8'));
console.log('U02 review questions:', u02l06.lesson.questions.length);
