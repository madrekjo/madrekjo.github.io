const fs = require('fs');
const raw = fs.readFileSync('C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله\\رياضيات 2010\\رياضيات وحده اولى 2010 معتمده.txt', 'utf8');
const ids = [...raw.matchAll(/"ID":\s*"([^"]+)"/g)].map(m => m[1]);
const revIds = ids.filter(id => id.includes('REV'));
console.log('Total IDs:', ids.length, 'REV IDs:', revIds.length);
if (revIds.length > 0) {
  console.log('First REV:', revIds[0], 'Last:', revIds[revIds.length - 1]);
} else {
  console.log('NO REV found in U1 file');
}

// Check Math U3 for L06
const raw3 = fs.readFileSync('C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله\\رياضيات 2010\\وحده ثالثه.txt', 'utf8');
const ids3 = [...raw3.matchAll(/"ID":\s*"([^"]+)"/g)].map(m => m[1]);
const l06 = ids3.filter(id => id.includes('L06'));
console.log('\nMath U3 total IDs:', ids3.length, 'L06 IDs:', l06.length);
if (l06.length > 0) console.log('First L06:', l06[0], 'Last:', l06[l06.length - 1]);
