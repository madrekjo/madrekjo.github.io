const fs = require('fs');
const raw = fs.readFileSync('C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله\\رياضيات 2010\\رياضيات وحده اولى 2010 معتمده.txt', 'utf8');

// Check what's between the arrays
let depth = 0, inStr = false, esc = false;
let start = -1;
const arrays = [];
for (let i = 0; i < raw.length; i++) {
  const c = raw[i];
  if (esc) { esc = false; continue; }
  if (c === '\\' && inStr) { esc = true; continue; }
  if (c === '"') { inStr = !inStr; continue; }
  if (inStr) continue;
  if (c === '[') { if (depth === 0) start = i; depth++; }
  if (c === ']') {
    depth--;
    if (depth === 0 && start >= 0) {
      arrays.push({ start, end: i + 1 });
      start = -1;
    }
  }
}
console.log('Arrays found:', arrays.length);
arrays.forEach((a, i) => {
  console.log(`  ${i}: ${a.start}-${a.end} (${a.end - a.start} chars)`);
});

// Check what's after the last array
const lastEnd = arrays[arrays.length - 1].end;
const after = raw.slice(lastEnd);
console.log('\nAfter last array:', after.length, 'chars');
console.log('First 200:', JSON.stringify(after.slice(0, 200)));

// Try to find any [ after last array
const remaining = raw.slice(lastEnd);
const nextBracket = remaining.indexOf('[');
console.log('\nNext [ after last array at:', nextBracket, 'of', remaining.length);
if (nextBracket >= 0) {
  console.log('Context:', JSON.stringify(remaining.slice(Math.max(0, nextBracket - 20), nextBracket + 100)));
}
