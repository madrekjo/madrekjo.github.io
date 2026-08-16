import fs from 'node:fs';
import path from 'node:path';
import { paths, subjectName } from './config.js';
import { arabicDigitsToLatin } from './extractor.js';
import { loadStructure, saveStructure } from './state.js';
import * as logger from './logger.js';

const UNIT_ORDINALS = [
  'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة',
  'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة',
  'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس'
];
const UNIT_RE = new RegExp(`(الوحدة|الفصل)\\s+(${UNIT_ORDINALS.join('|')}|[0-9٠-٩۰-۹]+)`);
const LESSON_RE = new RegExp(`(الدرس|الفصل)\\s+([0-9٠-٩۰-۹]+|${UNIT_ORDINALS.join('|')})`);

function normText(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractTrailingPage(line) {
  const normalized = arabicDigitsToLatin(line);
  const m = normalized.match(/(?:ص\.?|صفحة|page|p\.?)?\s*(\d+)\s*$/i);
  return m ? Number(m[1]) : null;
}

function allPages(gen, subject) {
  const manifest = readJsonSafe(path.join(paths().extracted, gen, subject, 'manifest.json'));
  if (!manifest || !manifest.page_count) return [];
  const out = [];
  for (let n = 1; n <= manifest.page_count; n++) {
    const txt = readPageSafe(path.join(paths().extracted, gen, subject, `page-${String(n).padStart(3, '0')}.txt`));
    out.push({ n, text: txt });
  }
  return out;
}

function readJsonSafe(f) {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

function readPageSafe(f) {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return '';
  }
}

function findStartPage(pages, query) {
  const q = normText(query);
  const tokens = q.split(' ').filter((w) => w.length > 2);
  if (!tokens.length) return null;
  for (const page of pages) {
    const t = normText(page.text);
    if (!t) continue;
    const found = tokens.filter((tok) => t.includes(tok)).length;
    if (found / tokens.length >= 0.6) return page.n;
  }
  return null;
}

function normalizeStructure(structure) {
  const units = (structure.units || structure || [])
    .filter((u) => u && u.lessons && u.lessons.length)
    .map((u, ui) => ({
      unit_number: u.unit_number ?? u.number ?? ui + 1,
      unit_name: u.unit_name ?? u.name ?? `الوحدة ${ui + 1}`,
      page_start: u.page_start ?? null,
      page_end: u.page_end ?? null,
      lessons: u.lessons.map((l, li) => ({
        lesson_number: String(l.lesson_number ?? `${u.unit_number ?? u.number ?? ui + 1}.${li + 1}`),
        lesson_name: l.lesson_name ?? l.name ?? `الدرس ${li + 1}`,
        page_start: l.page_start ?? null,
        page_end: l.page_end ?? null
      }))
    }));
  return { units };
}

function deriveFromSiteIndex(gen, semester, subject, pages) {
  const idxPath = path.join(paths().questions, gen, semester, subject, 'index.json');
  const idx = readJsonSafe(idxPath);
  if (!idx || !Array.isArray(idx.units) || !idx.units.length) return null;

  const units = idx.units.map((u) => ({
    unit_number: u.number ?? 0,
    unit_name: u.name || '',
    lessons: (u.lessons || []).map((l) => ({
      lesson_number: String(`${u.number ?? 0}.${l.number ?? ''}`),
      lesson_name: l.name || '',
      file: l.file || ''
    }))
  }));

  let lastPage = 0;
  for (const unit of units) {
    const unitStart = findStartPage(pages, unit.unit_name) || lastPage + 1;
    let cursor = unitStart;
    for (const lesson of unit.lessons) {
      const start = lesson.lesson_name ? findStartPage(pages, lesson.lesson_name) : null;
      lesson.page_start = start || cursor;
      lesson.page_end = null;
      cursor = Math.max(lesson.page_start, cursor + 1);
    }
    unit.page_start = unitStart;
    unit.page_end = null;
    lastPage = unitStart;
  }

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    for (let j = 0; j < u.lessons.length; j++) {
      const next = u.lessons[j + 1] ? u.lessons[j + 1].page_start : null;
      const nextUnit = units[i + 1] ? units[i + 1].page_start : null;
      const endCandidates = [next, nextUnit].filter(Boolean);
      u.lessons[j].page_end = endCandidates.length
        ? Math.max(u.lessons[j].page_start, endCandidates[0] - 1)
        : u.lessons[j].page_start;
    }
    const nextUnit = units[i + 1] ? units[i + 1].page_start : null;
    u.page_end = nextUnit ? Math.max(u.page_start, nextUnit - 1) : u.page_start;
  }
  return { units };
}

function detectFromToc(pages) {
  const tocLines = [];
  for (const page of pages) {
    for (const line of page.text.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      const pageNum = extractTrailingPage(s);
      if (pageNum === null) continue;
      if (UNIT_RE.test(s)) tocLines.push({ kind: 'unit', text: s, page: pageNum, line: page.n });
      else if (LESSON_RE.test(s)) tocLines.push({ kind: 'lesson', text: s, page: pageNum, line: page.n });
    }
    if (tocLines.length) break;
  }
  if (!tocLines.some((l) => l.kind === 'unit')) return null;

  const units = [];
  let current = null;
  for (const entry of tocLines) {
    if (entry.kind === 'unit') {
      if (current) units.push(current);
      current = {
        unit_number: units.length + 1,
        unit_name: entry.text,
        page_start: entry.page,
        lessons: []
      };
    } else if (entry.kind === 'lesson' && current) {
      current.lessons.push({
        lesson_number: String(`${current.unit_number}.${current.lessons.length + 1}`),
        lesson_name: entry.text,
        page_start: entry.page,
        page_end: null
      });
    }
  }
  if (current) units.push(current);
  if (!units.length) return null;

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    for (let j = 0; j < u.lessons.length; j++) {
      const next = u.lessons[j + 1] ? u.lessons[j + 1].page_start : null;
      const nextUnit = units[i + 1] ? units[i + 1].page_start : null;
      const endCandidates = [next, nextUnit].filter(Boolean);
      u.lessons[j].page_end = endCandidates.length
        ? Math.max(u.lessons[j].page_start, endCandidates[0] - 1)
        : u.lessons[j].page_start;
    }
    const nextUnit = units[i + 1] ? units[i + 1].page_start : null;
    u.page_end = nextUnit ? Math.max(u.page_start, nextUnit - 1) : u.page_start;
  }
  return { units };
}

export function buildStructure(book, { force = false } = {}) {
  const gen = book.generation;
  const subject = book.subject;
  const pages = allPages(gen, subject);
  if (!pages.length) throw new Error(`لا يوجد نص مستخرج للكتاب: ${gen}/${subject}. شغّل: npm run extract`);

  if (book.structure && Array.isArray(book.structure.units || book.structure)) {
    const s = normalizeStructure(book.structure);
    saveStructure(gen, subject, s);
    return s;
  }

  const cached = loadStructure(gen, subject);
  if (cached && !force) return cached;

  let structure = deriveFromSiteIndex(gen, book.semester, subject, pages);
  if (structure) {
    logger.info(`بنية مشتقة من index.json الحالي: ${gen}/${subject}`);
  } else {
    structure = detectFromToc(pages);
    if (structure) {
      logger.warn(`بنية مكتشفة من فهرس الكتاب (تحتاج مراجعة): ${gen}/${subject}`);
    } else {
      logger.warn(`لم يُعثر على فهرس واضح للكتاب ${gen}/${subject} — سيُعامل الكتاب كوحدة واحدة (راجع config/books.json لإضافة structure يدويًا)`);
      structure = normalizeStructure({
        units: [{ name: subjectName(subject), lessons: [{ name: subjectName(subject), number: 1 }] }]
      });
    }
  }

  saveStructure(gen, subject, structure);
  return structure;
}
