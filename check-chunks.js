const fs = require('fs');
const mathDir = 'C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله\\رياضيات 2010';

function readChunks(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const chunks = [];
  let d = 0, s = -1, esc = false, inS = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inS = !inS; continue; }
    if (inS) continue;
    if (c === '{' || c === '[') { if (d === 0) s = i; d++; }
    if (c === '}' || c === ']') { d--; if (d === 0 && s >= 0) { chunks.push(raw.slice(s, i + 1)); s = -1; } }
  }
  return chunks.map(c => { try { return JSON.parse(c); } catch(e) { return { __parseError: true }; } });
}

// Check Math U3
console.log('=== Math Unit 3 ===');
const m3 = readChunks(mathDir + '\\وحده ثالثه.txt');
m3.forEach((c, i) => {
  if (c.__parseError) { console.log(`  Chunk ${i}: PARSE ERROR`); return; }
  if (Array.isArray(c)) {
    const ids = c.filter(q => q.ID).map(q => q.ID);
    const first = ids[0] || 'no IDs';
    const last = ids[ids.length - 1] || '';
    console.log(`  Chunk ${i}: ${c.length} items, IDs: ${first} ... ${last}`);
  } else {
    console.log(`  Chunk ${i}: object with keys: ${Object.keys(c).join(', ')}`);
  }
});

// Check Islamic U3
console.log('\n=== Islamic Unit 3 ===');
const i3 = readChunks('C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله\\دين 2010\\وحده ثالثه.txt');
i3.forEach((c, i) => {
  if (c.__parseError) { console.log(`  Chunk ${i}: PARSE ERROR`); return; }
  if (Array.isArray(c)) {
    const first = c[0];
    const hasLesson = first && first.lesson !== undefined;
    const hasUnit = first && first.unit !== undefined;
    console.log(`  Chunk ${i}: ${c.length} items, hasLesson=${hasLesson}, hasUnit=${hasUnit}, firstKeys: ${Object.keys(first || {}).join(',')}`);
  } else if (c.lesson_title || c.unit_title) {
    console.log(`  Chunk ${i}: ${c.lesson_title || c.unit_title} - ${c.questions?.length} Qs`);
  } else {
    console.log(`  Chunk ${i}: object, keys: ${Object.keys(c).join(', ')}`);
  }
});
