import fs from 'node:fs';
import path from 'node:path';
import { paths, settings, enabledBooks, subjectName, outputRoot } from './config.js';
import { loadProgress, saveProgress } from './state.js';
import { extractBook } from './extractor.js';
import { printStatus, printScan, printStructureForBooks } from './status.js';
import { validateFile, checkSchema } from '../validators/index.js';
import { normalizeQuestionsData } from './dedupe.js';
import * as logger from './logger.js';

export function cmdPause() {
  const progress = loadProgress();
  progress.paused = true;
  progress.status = 'paused';
  progress.last_run_at = new Date().toISOString();
  saveProgress(progress);
  logger.info('pause — تم إيقاف التشغيل مؤقتًا');
  console.log('تم الإيقاف المؤقت. لن يبدأ أي توليد جديد حتى تشغيل: npm run resume');
}

export function cmdResume() {
  const progress = loadProgress();
  progress.paused = false;
  if (progress.status === 'paused') progress.status = 'idle';
  progress.last_run_at = new Date().toISOString();
  saveProgress(progress);
  logger.info('resume — تم استئناف التشغيل');
  console.log('تم الاستئناف. شغّل: npm run generate');
}

export async function cmdExtract() {
  const books = enabledBooks();
  if (!books.length) {
    console.log('لا كتب مفعلة. أضف الكتب إلى config/books.json وضع PDF في books/');
    return;
  }
  for (const book of books) {
    try {
      const manifest = await extractBook(book, { force: true });
      console.log(`✓ استخرجت ${book.generation}/${book.subject}: ${manifest.page_count} صفحة`);
    } catch (err) {
      console.log(`✗ فشل استخراج ${book.generation}/${book.subject}: ${err.message}`);
    }
  }
}

export async function cmdScan() {
  printScan();
  printStructureForBooks();
}

function collectQuestionFiles() {
  const files = [];
  const roots = [path.join(paths().questions), path.join(paths().output)];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.json') && entry.name !== 'index.json') files.push(full);
      }
    };
    walk(root);
  }
  return files;
}

export function cmdValidate() {
  const cfg = settings();
  const files = collectQuestionFiles();
  let badFiles = 0;
  let totalQuestions = 0;
  let totalBad = 0;
  const lines = [];

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      lines.push(`[JSON تالف] ${file.replaceAll('\\', '/')}: ${err.message}`);
      badFiles++;
      continue;
    }
    const list = normalizeQuestionsData(data);
    const isReview = /review\.json$/.test(file);
    const expected = isReview ? cfg.review_target : cfg.lesson_target;
    const fileIssues = [];
    const ids = new Set();
    list.forEach((q, i) => {
      totalQuestions++;
      const issues = checkSchema(q);
      if (q && q.id) {
        if (ids.has(q.id)) issues.push(`id مكرر: ${q.id}`);
        ids.add(q.id);
      }
      if (q && q.number !== i + 1) issues.push(`number غير متسلسل عند السؤال ${i + 1}`);
      if (issues.length) {
        totalBad++;
        fileIssues.push(`  سؤال ${i + 1} (${q && q.id ? q.id : '-'}): ${issues.join(' ; ')}`);
      }
    });
    if (expected !== null && list.length !== expected) {
      fileIssues.push(`  العدد ${list.length} ≠ المتوقع ${expected}`);
    }
    if (fileIssues.length) {
      badFiles++;
      lines.push(`>>> ${file.replaceAll('\\', '/')} (${isReview ? 'مراجعة' : 'درس'})`);
      lines.push(...fileIssues);
      lines.push('');
    }
  }

  console.log('=== فحص الأسئلة (Question Factory validate) ===');
  console.log(`الإجمالي: ${totalQuestions} سؤالاً | غير صالح: ${totalBad} | ملفات بمشاكل: ${badFiles} من ${files.length}`);
  console.log('');
  lines.forEach((l) => console.log(l));
  console.log(`النتيجة: ${badFiles === 0 ? 'جميع الملفات سليمة ✓' : 'يوجد ملفات تحتاج إصلاح'}`);
  return badFiles === 0;
}
