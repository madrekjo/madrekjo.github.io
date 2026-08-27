import fs from 'node:fs';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = process.argv[2];
const outDir = process.argv[3];

const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await getDocument({
  data,
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
  disableFontFace: true
}).promise;

fs.mkdirSync(outDir, { recursive: true });
let all = '';
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  let text = '';
  let lastY = null;
  for (const item of content.items) {
    if (typeof item.str !== 'string') continue;
    const y = Math.round(item.transform[5]);
    if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n';
    else text += ' ';
    text += item.str.trim();
    lastY = y;
  }
  const pageFile = path.join(outDir, `page-${String(i).padStart(3, '0')}.txt`);
  fs.writeFileSync(pageFile, text, 'utf8');
  all += `=== PAGE ${i} ===\n` + text + '\n';
}
fs.writeFileSync(path.join(outDir, '_all.txt'), all, 'utf8');
console.log('DONE pages=' + doc.numPages);
