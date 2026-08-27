const fs = require('fs');
const raw = fs.readFileSync('C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله\\رياضيات 2010\\رياضيات وحده اولى 2010 معتمده.txt', 'utf8');

// Find top-level [ ] positions
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

console.log('Found', arrays.length, 'top-level arrays:');
arrays.forEach((a, i) => {
  const chunk = raw.slice(a.start, a.end);
  const ids = [...chunk.matchAll(/"ID":\s*"([^"]+)"/g)].map(m => m[1]);
  console.log(`  Array ${i}: pos ${a.start}-${a.end} (${ids.length} IDs, first=${ids[0]}, last=${ids[ids.length-1]})`);
});
