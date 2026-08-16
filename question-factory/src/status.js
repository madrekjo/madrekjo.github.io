import fs from 'node:fs';
import path from 'node:path';
import { books, enabledBooks, settings, subjectName, paths } from './config.js';
import { loadQueue, loadProgress } from './state.js';
import { buildStructure } from './parser.js';
import { loadManifest } from './extractor.js';
import * as logger from './logger.js';

function hms(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function printStatus() {
  const queue = loadQueue();
  const progress = loadProgress();
  const booksCfg = books();

  const perGen = {};
  for (const b of booksCfg) {
    perGen[b.generation] = (perGen[b.generation] || 0) + 1;
  }

  const completedLessons = queue.filter((t) => t.type === 'lesson' && t.status === 'completed').length;
  const pendingLessons = queue.filter((t) => t.type === 'lesson' && t.status !== 'completed' && t.status !== 'failed').length;
  const completedReviews = queue.filter((t) => t.type === 'review' && t.status === 'completed').length;
  const pendingReviews = queue.filter((t) => t.type === 'review' && t.status !== 'completed' && t.status !== 'failed').length;
  const failedTasks = queue.filter((t) => t.status === 'failed');
  const current = progress.current_task
    ? queue.find((t) => t.id === progress.current_task)
    : queue.find((t) => t.status === 'processing');

  console.log('');
  console.log('Question Factory');
  console.log('');
  console.log('Books:');
  if (!Object.keys(perGen).length) console.log('  (لا كتب معرّفة في config/books.json)');
  for (const [gen, n] of Object.entries(perGen)) console.log(`  ${gen}: ${n}`);
  console.log('');
  console.log('Lessons:');
  console.log(`  Completed: ${completedLessons}`);
  console.log(`  Pending: ${pendingLessons}`);
  console.log('');
  console.log('Questions:');
  console.log(`  Generated: ${progress.counts.generated || 0}`);
  console.log('');
  console.log('Reviews:');
  console.log(`  Completed: ${completedReviews}`);
  if (pendingReviews) console.log(`  Pending: ${pendingReviews}`);
  console.log('');
  console.log('Failed:');
  console.log(`  ${failedTasks.length}`);
  if (failedTasks.length) {
    for (const t of failedTasks.slice(0, 10)) {
      const rec = progress.failed[t.id];
      console.log(`    ${t.id}: ${rec ? rec.error : 'خطأ غير مسجل'}`);
    }
  }
  console.log('');
  console.log('Current:');
  if (current) console.log(`  ${current.subject} ${subjectName(current.subject)} → Unit ${current.unit} → ${current.type === 'review' ? 'Review' : 'Lesson ' + current.lesson}`);
  else console.log('  (لا توجد مهمة جارية)');
  console.log('');
  console.log('Runtime:');
  let seconds = progress.accumulated_seconds || 0;
  if (progress.status === 'running' && progress.last_run_at) {
    seconds += Math.round((Date.now() - new Date(progress.last_run_at).getTime()) / 1000);
  }
  console.log(`  ${hms(seconds)}`);
  console.log('');
  console.log('Status: ' + progress.status + (progress.paused ? ' (متوقف مؤقتًا)' : ''));
}

export function printScan() {
  console.log('Question Factory — scan');
  console.log('');
  const booksCfg = books();
  for (const b of booksCfg) {
    const source = b.source;
    const full = source;
    const exists = fileExists(full);
    const enabled = b.enabled !== false;
    console.log(`- ${b.generation}/${b.subject} (${subjectName(b.subject)})`);
    console.log(`    المصدر: ${source} ${exists ? '✓ موجود' : '✗ غير موجود'} ${enabled ? '' : '[معطّل — enabled: false]'}`);
    if (exists && enabled) {
      const manifest = loadManifest(b.generation, b.subject);
      if (manifest) {
        console.log(`    استخراج: ${manifest.page_count} صفحة ✓ (آخر استخراج ${manifest.extracted_at})`);
      } else {
        console.log(`    استخراج: لم يتم بعد (شغّل npm run extract)`);
      }
    }
  }
  if (!booksCfg.length) console.log('لا كتب معرّفة. أضفها إلى config/books.json ثم ضع PDF في books/');
}

export function printStructureForBooks() {
  const list = enabledBooks();
  if (!list.length) {
    console.log('لا كتب مفعلة — فعّل الكتب في config/books.json أولًا.');
    return;
  }
  for (const book of list) {
    try {
      const structure = buildStructure(book, { force: false });
      console.log(`\n${book.generation}/${book.subject} (${subjectName(book.subject)}):`);
      for (const u of structure.units) {
        console.log(`  U${u.unit_number}. ${u.unit_name} [صفحات ${u.page_start ?? '-'} - ${u.page_end ?? '-'}]`);
        for (const l of u.lessons) {
          console.log(`     - الدرس ${l.lesson_number}: ${l.lesson_name} [صفحات ${l.page_start ?? '-'} - ${l.page_end ?? '-'}]`);
        }
      }
    } catch (err) {
      console.log(`\n${book.generation}/${book.subject}: خطأ — ${err.message}`);
    }
  }
}

function fileExists(rel) {
  try {
    return fs.existsSync(path.resolve(paths().factoryRoot, rel));
  } catch {
    return false;
  }
}
