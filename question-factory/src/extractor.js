import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { paths, subjectName, settings } from './config.js';
import * as logger from './logger.js';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function arabicDigitsToLatin(s) {
  return String(s)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export function pageFile(gen, subject, n) {
  return path.join(paths().extracted, gen, subject, `page-${String(n).padStart(3, '0')}.txt`);
}

export function manifestFile(gen, subject) {
  return path.join(paths().extracted, gen, subject, 'manifest.json');
}

export function loadManifest(gen, subject) {
  return readJsonSafe(manifestFile(gen, subject));
}

function readJsonSafe(f) {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

export function readPage(gen, subject, n) {
  try {
    return fs.readFileSync(pageFile(gen, subject, n), 'utf8');
  } catch {
    return '';
  }
}

export function readPages(gen, subject, from, to) {
  const out = [];
  for (let n = from; n <= to; n++) {
    const txt = readPage(gen, subject, n);
    if (txt) out.push({ page: n, text: txt });
  }
  return out;
}

export function readAllPages(gen, subject) {
  const m = loadManifest(gen, subject);
  if (!m || !m.page_count) return [];
  return readPages(gen, subject, 1, m.page_count);
}

async function extractWithPdfjs(pdfPath, outDir, onProgress) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true
  }).promise;

  const pageCount = doc.numPages;
  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if (typeof item.str === 'string') {
        text += item.str;
        if (item.hasEOL) text += '\n';
        else text += ' ';
      }
    }
    fs.writeFileSync(
      path.join(outDir, `page-${String(i).padStart(3, '0')}.txt`),
      text.replace(/[ \t]+\n/g, '\n'),
      'utf8'
    );
    page.cleanup();
    if (onProgress) onProgress(i, pageCount);
  }
  await doc.destroy();
  return pageCount;
}

export async function isExtractedCurrent(gen, subject, sourcePath) {
  const m = loadManifest(gen, subject);
  if (!m) return false;
  try {
    const stat = fs.statSync(sourcePath);
    return m.size === stat.size && m.mtime === stat.mtimeMs;
  } catch {
    return false;
  }
}

export async function extractBook(book, { force = false, onProgress } = {}) {
  const gen = book.generation;
  const subject = book.subject;
  const sourcePath = path.resolve(paths().factoryRoot, book.source);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`ملف الكتاب غير موجود: ${book.source}`);
  }

  const outDir = path.join(paths().extracted, gen, subject);
  const current = await isExtractedCurrent(gen, subject, sourcePath);
  if (current && !force) {
    logger.info(`استخراج مسبق صالح (لم يتغير الملف): ${gen}/${subject}`);
    return loadManifest(gen, subject);
  }

  logger.info(`استخراج PDF: ${book.source} (${subjectName(subject)} / ${gen})`);
  const stat = fs.statSync(sourcePath);
  const hash = sha256(fs.readFileSync(sourcePath));
  const pageCount = await extractWithPdfjs(sourcePath, outDir, onProgress);

  const manifest = {
    source: book.source,
    generation: gen,
    subject,
    size: stat.size,
    mtime: stat.mtimeMs,
    sha256: hash,
    page_count: pageCount,
    backend: settings().extractor_backend || 'pdfjs',
    extracted_at: new Date().toISOString()
  };
  fs.writeFileSync(manifestFile(gen, subject), JSON.stringify(manifest, null, 2), 'utf8');
  logger.info(`اكتمل الاستخراج: ${pageCount} صفحة → extracted/${gen}/${subject}`);
  return manifest;
}

export { arabicDigitsToLatin };
