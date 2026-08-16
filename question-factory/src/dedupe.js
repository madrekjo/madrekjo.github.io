import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { paths, readJson, writeJson, settings } from './config.js';

const PREFIX_RE = /^(ما|ماذا|أي|أي من|بأي|لماذا|كيف|متى|أين|أينما|كم|من|هل|عندما|ما هو|ما هي|ما المقصود|اذكر|عرف|وضح|عدّد)\s+/;

// رموز رياضية/علمية تُحفظ في التطبيع لأنها تغيّر معنى الإجابة
// (+ - × ÷ = < > ≤ ≥ / % ^ ± ∓ ≈ ≠ ≡ √ ∑ ∏ ∫ ∞ ° ′ ″ · • ∆ ⊥ ∥ → ← ↔ ⇌
//  والاشتقاق ' وأقواس الدوال والفترات ( ) [ ])
const KEEP_MATH = "\\u2212+\\-×÷·•/=<>≤≥%^*±∓≈≠≡√∑∏∫∞°′″∆⊥∥→←↔⇌'()\\[\\]";

// أوامر LaTeX شائعة تُحوَّل إلى الرمز المقابل قبل فلترة الرموز
const LATEX_MAP = [
  [/\\pm\b/g, '±'], [/\\mp\b/g, '∓'],
  [/\\times\b/g, '×'], [/\\cdot\b/g, '·'], [/\\cdotp\b/g, '·'],
  [/\\div\b/g, '÷'],
  [/\\sqrt\b/g, '√'],
  [/\\leq\b/g, '≤'], [/\\le\b/g, '≤'],
  [/\\geq\b/g, '≥'], [/\\ge\b/g, '≥'],
  [/\\neq\b/g, '≠'], [/\\ne\b/g, '≠'],
  [/\\approx\b/g, '≈'],
  [/\\infty\b/g, '∞'],
  [/\\triangle\b/g, '∆'],
  [/\\perp\b/g, '⊥'],
  [/\\parallel\b/g, '∥'],
];

export function normalize(text) {
  let s = String(text || '');
  for (const [re, sym] of LATEX_MAP) s = s.replace(re, sym);
  return s
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(new RegExp(`[^\\p{L}\\p{N}${KEEP_MATH}]`, 'gu'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripPrefix(text) {
  return text.replace(PREFIX_RE, '').trim();
}

export function literalHash(text) {
  return crypto.createHash('sha256').update(normalize(text)).digest('hex');
}

function tokens(text) {
  const t = normalize(stripPrefix(text)).split(' ');
  return t.filter((w) => w.length >= 2);
}

function jaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union ? inter / union : 0;
}

function charNgrams(text, n) {
  const s = normalize(text).replace(/\s+/g, '');
  const grams = new Map();
  if (s.length < n) {
    grams.set(s, 1);
    return grams;
  }
  for (let i = 0; i <= s.length - n; i++) {
    const g = s.slice(i, i + n);
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  return grams;
}

function dice(a, b) {
  const ga = charNgrams(a, 3);
  const gb = charNgrams(b, 3);
  let inter = 0;
  for (const [g, c] of ga) {
    inter += Math.min(c, gb.get(g) || 0);
  }
  const total = [...ga.values()].reduce((x, y) => x + y, 0) + [...gb.values()].reduce((x, y) => x + y, 0);
  return total ? (2 * inter) / total : 0;
}

function lcsLength(a, b) {
  if (!a.length || !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  const ja = jaccard(ta, tb);
  const di = dice(a, b);
  const na = normalize(stripPrefix(a));
  const nb = normalize(stripPrefix(b));
  const minLen = Math.min(na.length, nb.length);
  const lcs = minLen ? lcsLength(na, nb) / minLen : 0;
  return Math.max(ja, di, lcs);
}

function loadIndex() {
  const idx = readJson(paths().dedup, null);
  if (idx && idx.version === 1) return idx;
  return { version: 1, entries: {}, texts: {} };
}

function saveIndex(idx) {
  writeJson(paths().dedup, idx);
}

export class Dedupe {
  constructor() {
    this.index = loadIndex();
    this.threshold = settings().semantic_similarity_threshold ?? 0.82;
  }

  check(question, ctx = {}) {
    const subject = ctx.subject || '';
    const text = question.question || '';
    const hash = literalHash(text);
    const threshold = ctx.threshold ?? this.threshold;

    const entry = this.index.entries[hash];
    if (entry) {
      return { dup: true, kind: 'literal', match: entry, reason: 'تكرار حرفي مع سؤال سابق' };
    }

    const pool = this.index.texts[subject] || [];
    const searchFrom = Math.max(0, pool.length - 500);
    for (let i = pool.length - 1; i >= searchFrom; i--) {
      const rec = pool[i];
      if (rec.hash === hash) {
        return { dup: true, kind: 'literal', match: rec, reason: 'تكرار حرفي مع سؤال سابق' };
      }
      if (similarity(text, rec.text) >= threshold) {
        return {
          dup: true,
          kind: 'semantic',
          match: rec,
          reason: `تشابه معنوي مع سؤال سابق (${similarity(text, rec.text).toFixed(2)})`
        };
      }
    }
    return { dup: false };
  }

  add(question, ctx = {}) {
    const subject = ctx.subject || '';
    const text = question.question || '';
    const hash = literalHash(text);
    this.index.entries[hash] = { qid: question.id, task: ctx.taskId || '', subject };
    const list = this.index.texts[subject] || (this.index.texts[subject] = []);
    list.push({ qid: question.id, task: ctx.taskId || '', hash, text: normalize(text) });
    if (list.length > 5000) list.splice(0, list.length - 5000);
  }

  save() {
    saveIndex(this.index);
  }
}

export function normalizeQuestionsData(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.questions)) return data.questions;
  if (data && data.lesson && Array.isArray(data.lesson.questions)) return data.lesson.questions;
  return [];
}

export function seedDedupeFromFiles(dedupe, files) {
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = normalizeQuestionsData(data);
      for (const q of list) {
        if (q && q.question) dedupe.add({ id: q.id, question: q.question }, { subject: path.basename(path.dirname(path.dirname(file))), taskId: 'existing' });
      }
    } catch {
      // تجاهل الملفات التالفة
    }
  }
}
