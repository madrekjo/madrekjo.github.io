import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = process.argv[2];
const fromPage = Number(process.argv[3] || 1);
const maxPages = Number(process.argv[4] || 8);

const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await getDocument({
  data,
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
  disableFontFace: true
}).promise;

console.log('TOTAL_PAGES=' + doc.numPages);

for (let i = fromPage; i <= Math.min(fromPage + maxPages - 1, doc.numPages); i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  let text = '';
  for (const item of content.items) {
    if (typeof item.str === 'string') text += item.str + '\n';
  }
  console.log('=== PAGE ' + i + ' ===');
  console.log(text.slice(0, 2500));
}
