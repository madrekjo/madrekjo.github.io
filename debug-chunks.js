const fs = require('fs');
function readChunks(f) {
  const raw = fs.readFileSync(f, 'utf8').trim();
  const c = [];
  let d = 0, s = -1, esc = false, inS = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inS = !inS; continue; }
    if (inS) continue;
    if (ch === '{' || ch === '[') { if (d === 0) s = i; d++; }
    if (ch === '}' || ch === ']') { d--; if (d === 0 && s >= 0) { c.push(raw.slice(s, i + 1)); s = -1; } }
  }
  return c.map(x => { try { return JSON.parse(x); } catch(e) { return null; } }).filter(Boolean);
}

// Math U1
console.log('=== Math U1 ===');
const m1 = readChunks('C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله\\رياضيات 2010\\رياضيات وحده اولى 2010 معتمده.txt');
m1.forEach((c, i) => {
  if (Array.isArray(c)) {
    const ids = c.filter(q => q && q.ID).map(q => q.ID);
    console.log(`  Chunk ${i}: ${c.length} items, first=${ids[0]}, last=${ids[ids.length-1]}`);
  }
});

// Math U3 - check L06
console.log('\n=== Math U3 L05/L06 check ===');
const m3 = readChunks('C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله\\رياضيات 2010\\وحده ثالثه.txt');
m3.forEach((c, i) => {
  if (Array.isArray(c)) {
    const ids = c.filter(q => q && q.ID).map(q => q.ID);
    const l05 = ids.filter(id => id.includes('L05')).length;
    const l06 = ids.filter(id => id.includes('L06')).length;
    console.log(`  Chunk ${i}: ${c.length} items, L05=${l05}, L06=${l06}, first=${ids[0]}, last=${ids[ids.length-1]}`);
  }
});
