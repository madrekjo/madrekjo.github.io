import { enabledBooks, settings, subjectName } from './config.js';
import { buildStructure } from './parser.js';
import { extractBook } from './extractor.js';
import { loadQueue, saveQueue } from './state.js';
import * as logger from './logger.js';

export function pad(n, width) {
  return String(n).padStart(width, '0');
}

export function taskId(book, unitNum, suffix) {
  return `${book.generation}-${book.subject}-U${pad(unitNum, 2)}-${suffix}`;
}

function buildTasksForBook(book, structure, opts = {}) {
  const tasks = [];
  const unitTarget = opts.lessonTarget ?? settings().lesson_target;
  const reviewTarget = opts.reviewTarget ?? settings().review_target;

  // نطاق محدود للتجارب: QF_LIMIT_UNIT=1 QF_LIMIT_LESSON=1 → وحدة واحدة ودرس واحد فقط
  const limitUnit = Number(process.env.QF_LIMIT_UNIT || 0);
  const limitLesson = Number(process.env.QF_LIMIT_LESSON || 0);
  const limited = limitUnit > 0 || limitLesson > 0;

  structure.units.forEach((unit, ui) => {
    const unitNum = unit.unit_number ?? ui + 1;
    const isTest = Boolean(opts.testMode);
    const lessonList = unit.lessons || [];

    lessonList.forEach((lesson, li) => {
      if (isTest && (ui > 0 || li > 0)) return;
      if (limitUnit > 0 && ui + 1 !== limitUnit) return;
      if (limitLesson > 0 && li + 1 !== limitLesson) return;
      const start = lesson.page_start ?? unit.page_start ?? 1;
      const end = lesson.page_end ?? unit.page_end ?? null;
      tasks.push({
        id: taskId(book, unitNum, `L${pad(li + 1, 2)}`),
        type: 'lesson',
        generation: book.generation,
        semester: book.semester,
        subject: book.subject,
        unit: unitNum,
        lesson: lesson.lesson_number,
        lesson_index: li + 1,
        unit_name: unit.unit_name,
        lesson_name: lesson.lesson_name,
        page_start: start,
        page_end: end,
        target: isTest ? Math.min(10, unitTarget) : unitTarget,
        batch_size: opts.batchSize ?? settings().batch_size,
        batch_index: 0,
        status: 'pending'
      });
    });

    if (!isTest && !limited) {
      const start = unit.page_start ?? (lessonList.length ? lessonList[0].page_start : 1);
      const end = unit.page_end ?? (lessonList.length ? lessonList[lessonList.length - 1].page_end : null);
      tasks.push({
        id: taskId(book, unitNum, 'REV'),
        type: 'review',
        generation: book.generation,
        semester: book.semester,
        subject: book.subject,
        unit: unitNum,
        lesson: 'review',
        lesson_index: 0,
        unit_name: unit.unit_name,
        lesson_name: 'مراجعة الوحدة ' + unitNum,
        lessons: lessonList.map((l, i) => ({ number: l.lesson_number, name: l.lesson_name, index: i + 1 })),
        page_start: start,
        page_end: end,
        target: reviewTarget,
        batch_size: opts.batchSize ?? settings().batch_size,
        batch_index: 0,
        status: 'pending'
      });
    }
  });
  return tasks;
}

export async function buildQueue({ testMode = false, force = false } = {}) {
  const existing = loadQueue();
  const byId = new Map(existing.map((t) => [t.id, t]));
  const books = enabledBooks();
  const all = [];

  for (const book of books) {
    try {
      await extractBook(book, { force });
      const structure = buildStructure(book, { force });
      const fresh = buildTasksForBook(book, structure, { testMode });
      for (const task of fresh) {
        const prev = byId.get(task.id);
        if (prev && (prev.status === 'completed' || prev.status === 'failed')) {
          task.status = prev.status;
          task.batch_index = prev.batch_index || 0;
        }
        all.push(task);
      }
      logger.info(`تم تجهيز مهام: ${book.generation}/${book.subject} (${fresh.length} مهمة)`);
    } catch (err) {
      logger.error(`تخطي كتاب ${book.generation}/${book.subject}: ${err.message}`, err);
    }
  }

  if (all.length) {
    saveQueue(all);
  } else {
    logger.warn('لا توجد كتب مفعلة أو ملفات PDF. ضع الكتب في books/ وفعّلها في config/books.json.');
  }
  return all;
}

export { subjectName };
