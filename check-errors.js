const fs = require('fs');

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

// Math U1 - find the broken chunk
const raw1 = fs.readFileSync('C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله\\رياضيات 2010\\رياضيات وحده اولى 2010 معتمده.txt', 'utf8');
const objs1 = extractJsonObjects(raw1);
console.log('Math U1: found', objs1.length, 'top-level objects');
for (let i = 0; i < objs1.length; i++) {
  try {
    const parsed = JSON.parse(objs1[i]);
    if (Array.isArray(parsed)) {
      console.log(`  Object ${i}: valid array of ${parsed.length}`);
    }
  } catch (e) {
    console.log(`  Object ${i}: PARSE ERROR (${objs1[i].length} chars)`);
    // Show the error location
    const errPos = parseInt(e.message.match(/position (\d+)/)?.[1]);
    if (errPos) {
      const context = objs1[i].slice(Math.max(0, errPos - 50), errPos + 50);
      console.log(`    Error context: ...${JSON.stringify(context)}...`);
    }
  }
}

// Math U3
const raw3 = fs.readFileSync('C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله\\رياضيات 2010\\وحده ثالثه.txt', 'utf8');
const objs3 = extractJsonObjects(raw3);
console.log('\nMath U3: found', objs3.length, 'top-level objects');
for (let i = 0; i < objs3.length; i++) {
  try {
    const parsed = JSON.parse(objs3[i]);
    if (Array.isArray(parsed)) {
      console.log(`  Object ${i}: valid array of ${parsed.length}`);
    }
  } catch (e) {
    console.log(`  Object ${i}: PARSE ERROR (${objs3[i].length} chars)`);
    const errPos = parseInt(e.message.match(/position (\d+)/)?.[1]);
    if (errPos) {
      const context = objs3[i].slice(Math.max(0, errPos - 50), errPos + 50);
      console.log(`    Error context: ...${JSON.stringify(context)}...`);
    }
  }
}
