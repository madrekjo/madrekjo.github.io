/**
 * Regenerate missing questions for earth-science files after cleanup.
 * Usage: node scripts/regenerate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat, extractJsonArray } from '../src/ai-client.js';
import { readPages } from '../src/extractor.js';
import { Dedupe, normalizeQuestionsData, seedDedupeFromFiles } from '../src/dedupe.js';
import { validateBatch, validateFile } from '../validators/index.js';
import { makeLessonId, makeReviewId } from '../src/ids.js';
import { subjectConf, settings, subjectName, FACTORY_ROOT } from '../src/config.js';
import { writeJson } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(FACTORY_ROOT, '..');
const QDIR = path.join(ROOT, 'questions', '2009', 'semester-1', 'earth-science');
const LESSON_TARGET = settings().lesson_target;   // 40
const REVIEW_TARGET = settings().review_target;   // 50

const UNITS = [
  { unit: 1, unit_name: 'الوقود الأحفوري والبيئة', page_start: 7, page_end: 44,
    lessons: [
      { lesson_number: '1.1', lesson_name: 'الوقود الأحفوري وغازات الدفيئة', page_start: 10, page_end: 20 },
      { lesson_number: '1.2', lesson_name: 'الوقود الأحفوري والتغيّر المناخي', page_start: 21, page_end: 31 },
      { lesson_number: '1.3', lesson_name: 'الحد من التغيّر المناخي والتكيف مع آثاره', page_start: 32, page_end: 40 },
    ]
  },
  { unit: 2, unit_name: 'الاستكشاف الجيولوجي', page_start: 45, page_end: 82,
    lessons: [
      { lesson_number: '2.1', lesson_name: 'الخرائط الجيولوجية', page_start: 48, page_end: 58 },
      { lesson_number: '2.2', lesson_name: 'طرائق الاستكشاف الجيولوجي', page_start: 59, page_end: 69 },
      { lesson_number: '2.3', lesson_name: 'تعدين الخامات المعدنية وأثره في البيئة', page_start: 70, page_end: 77 },
    ]
  },
  { unit: 3, unit_name: 'التراكيب الجيولوجية', page_start: 83, page_end: 114,
    lessons: [
      { lesson_number: '3.1', lesson_name: 'تشوّه الصخور', page_start: 86, page_end: 93 },
      { lesson_number: '3.2', lesson_name: 'الصدوع', page_start: 94, page_end: 101 },
      { lesson_number: '3.3', lesson_name: 'الطيّات', page_start: 102, page_end: 110 },
    ]
  },
  { unit: 4, unit_name: 'الصفائح التكتونية', page_start: 115, page_end: 154,
    lessons: [
      { lesson_number: '4.1', lesson_name: 'انجراف القارات', page_start: 118, page_end: 124 },
      { lesson_number: '4.2', lesson_name: 'توسّع قاع المحيط', page_start: 125, page_end: 133 },
      { lesson_number: '4.3', lesson_name: 'حدود الصفائح', page_start: 134, page_end: 150 },
    ]
  }
];

function readPrompt(name) {
  return fs.readFileSync(path.join(FACTORY_ROOT, 'prompts', name), 'utf8');
}

function fillPrompt(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

function truncateContent(text) {
  const max = settings().max_content_chars ?? 24000;
  return text.length > max ? text.slice(0, max) + '\n...(مقتطع لطول المحتوى)' : text;
}

function buildTaskContent(task) {
  const pages = readPages(task.generation, task.subject, task.page_start || 1, task.page_end || Number.MAX_SAFE_INTEGER);
  return pages.map((p) => `--- صفحة ${p.page} ---\n${p.text}`).join('\n');
}

function buildPrompt(task, count) {
  const template = readPrompt(task.type === 'review' ? 'review-generation.txt' : 'lesson-generation.txt');
  const conf = subjectConf(task.subject);
  const vars = {
    batch_size: count,
    subject_name: subjectName(task.subject),
    generation: task.generation,
    unit_number: task.unit,
    unit_name: task.unit_name,
    lesson_number: task.lesson,
    lesson_name: task.lesson_name,
    page_start: task.page_start ?? 1,
    page_end: task.page_end ?? 'نهاية الكتاب',
    lessons: (task.lessons || []).map((l) => `${l.lesson_number} - ${l.lesson_name}`).join('، '),
    content: truncateContent(buildTaskContent(task)),
    review_id_prefix: conf.review_id_prefix
  };
  return fillPrompt(template, vars);
}

async function callGeneration(task, count) {
  const prompt = buildPrompt(task, count);
  const text = await chat(
    [
      { role: 'system', content: 'أنت متخصص في توليد أسئلة اختيار من متعدد بدقة عالية وتخرج JSON فقط.' },
      { role: 'user', content: prompt }
    ],
    { temperature: 0.3, maxTokens: 8000, json: true }
  );
  return extractJsonArray(text);
}

function loadQuestions(filepath) {
  try {
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    if (Array.isArray(data)) return { data, questions: data, format: 'array' };
    if (data?.lesson?.questions) return { data, questions: data.lesson.questions, format: 'wrapped' };
    return { data: null, questions: [], format: 'unknown' };
  } catch { return { data: null, questions: [], format: 'missing' }; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Regenerating missing questions ===');
  console.log(`Lesson target: ${LESSON_TARGET}, Review target: ${REVIEW_TARGET}`);

  const dedupe = new Dedupe();
  const conf = subjectConf('earth-science');
  const book = { generation: '2009', semester: 'semester-1', subject: 'earth-science' };
  const stats = { generated: 0, failed: 0 };

  for (const unit of UNITS) {
    console.log(`\n--- Unit ${unit.unit}: ${unit.unit_name} ---`);

    // Process lessons
    for (let li = 0; li < unit.lessons.length; li++) {
      const lesson = unit.lessons[li];
      const filepath = path.join(QDIR, `unit-${String(unit.unit).padStart(2,'0')}`, `lesson-${String(li+1).padStart(2,'0')}.json`);
      const { data, questions, format } = loadQuestions(filepath);
      const needed = LESSON_TARGET - questions.length;

      if (needed <= 0) {
        console.log(`  L${li+1} (${lesson.lesson_name}): ${questions.length}/${LESSON_TARGET} OK`);
        for (const q of questions) dedupe.add(q, { subject: 'earth-science', taskId: 'existing' });
        continue;
      }

      console.log(`  L${li+1} (${lesson.lesson_name}): ${questions.length}/${LESSON_TARGET} — need ${needed}`);

      const task = {
        id: `${book.generation}-${book.subject}-U${String(unit.unit).padStart(2,'0')}-L${String(li+1).padStart(2,'0')}`,
        type: 'lesson',
        generation: book.generation,
        semester: book.semester,
        subject: book.subject,
        unit: unit.unit,
        lesson: lesson.lesson_number,
        lesson_index: li + 1,
        unit_name: unit.unit_name,
        lesson_name: lesson.lesson_name,
        page_start: lesson.page_start,
        page_end: lesson.page_end,
        target: LESSON_TARGET,
        batch_size: settings().batch_size
      };

      // Seed dedupe from existing questions in this file
      for (const q of questions) dedupe.add(q, { subject: 'earth-science', taskId: 'existing' });

      let newQuestions = [];
      let attempts = 0;
      while (newQuestions.length < needed && attempts < 8) {
        const batchSize = Math.min(settings().batch_size, needed - newQuestions.length);
        console.log(`    Batch ${attempts+1}: generating ${batchSize}...`);
        try {
          const parsed = await callGeneration(task, batchSize);
          const ctx = {
            subject: 'earth-science',
            verifyCalculations: conf.verify_calculations,
            content: truncateContent(buildTaskContent(task))
          };
          const batchResult = validateBatch(parsed, ctx);

          for (const q of batchResult.accepted) {
            const res = dedupe.check(q, { subject: 'earth-science', threshold: 0.82 });
            if (!res.dup) {
              newQuestions.push(q);
              dedupe.add(q, { subject: 'earth-science', taskId: task.id });
            }
          }
          stats.generated += newQuestions.length;
          console.log(`    Accepted: ${batchResult.accepted.length}, dedup-rejected: ${batchResult.accepted.length - newQuestions.length + batchResult.rejected.length}, total new: ${newQuestions.length}`);
        } catch (err) {
          console.error(`    ERROR: ${err.message}`);
          stats.failed++;
        }
        attempts++;
        await sleep(2000);
      }

      // Merge and renumber
      const all = [...questions, ...newQuestions];
      for (let i = 0; i < all.length; i++) {
        all[i].number = i + 1;
        all[i].id = makeLessonId(unit.unit, li + 1, i + 1, conf.id_padding);
      }

      // Write back in wrapped format
      if (data && data.lesson) {
        data.lesson.questions = all;
        writeJson(filepath, data);
      } else {
        writeJson(filepath, { lesson: { lesson_number: lesson.lesson_number, lesson_name: lesson.lesson_name, unit_number: unit.unit, unit_name: unit.unit_name, page_start: lesson.page_start, page_end: lesson.page_end, questions: all } });
      }
      console.log(`  => ${all.length} questions saved to ${path.basename(path.dirname(filepath))}/${path.basename(filepath)}`);
    }

    // Process review
    const revPath = path.join(QDIR, `unit-${String(unit.unit).padStart(2,'0')}`, 'review.json');
    const { data: revData, questions: revQs, format: revFmt } = loadQuestions(revPath);
    const revNeeded = REVIEW_TARGET - revQs.length;

    if (revNeeded <= 0) {
      console.log(`  REV: ${revQs.length}/${REVIEW_TARGET} OK`);
      for (const q of revQs) dedupe.add(q, { subject: 'earth-science', taskId: 'existing' });
      continue;
    }

    console.log(`  REV: ${revQs.length}/${REVIEW_TARGET} — need ${revNeeded}`);

    const revTask = {
      id: `${book.generation}-${book.subject}-U${String(unit.unit).padStart(2,'0')}-REV`,
      type: 'review',
      generation: book.generation,
      semester: book.semester,
      subject: book.subject,
      unit: unit.unit,
      lesson: 'review',
      lesson_index: 0,
      unit_name: unit.unit_name,
      lesson_name: 'مراجعة الوحدة ' + unit.unit,
      lessons: unit.lessons.map((l, i) => ({ number: l.lesson_number, name: l.lesson_name, index: i + 1 })),
      page_start: unit.page_start,
      page_end: unit.page_end,
      target: REVIEW_TARGET,
      batch_size: settings().batch_size
    };

    for (const q of revQs) dedupe.add(q, { subject: 'earth-science', taskId: 'existing' });

    let newRevQs = [];
    let revAttempts = 0;
    while (newRevQs.length < revNeeded && revAttempts < 8) {
      const batchSize = Math.min(settings().batch_size, revNeeded - newRevQs.length);
      console.log(`    Rev batch ${revAttempts+1}: generating ${batchSize}...`);
      try {
        const parsed = await callGeneration(revTask, batchSize);
        const ctx = {
          subject: 'earth-science',
          verifyCalculations: conf.verify_calculations,
          content: truncateContent(buildTaskContent(revTask))
        };
        const batchResult = validateBatch(parsed, ctx);
        for (const q of batchResult.accepted) {
          const res = dedupe.check(q, { subject: 'earth-science', threshold: 0.82 });
          if (!res.dup) {
            newRevQs.push(q);
            dedupe.add(q, { subject: 'earth-science', taskId: revTask.id });
          }
        }
        console.log(`    Accepted: ${batchResult.accepted.length}, total new: ${newRevQs.length}`);
      } catch (err) {
        console.error(`    Rev ERROR: ${err.message}`);
        stats.failed++;
      }
      revAttempts++;
      await sleep(2000);
    }

    const allRev = [...revQs, ...newRevQs];
    for (let i = 0; i < allRev.length; i++) {
      allRev[i].number = i + 1;
      allRev[i].id = makeReviewId(unit.unit, i + 1, conf.review_id_prefix, conf.id_padding);
    }

    // Write as array (existing format)
    writeJson(revPath, allRev);
    console.log(`  => ${allRev.length} review questions saved`);
  }

  dedupe.save();
  console.log(`\n=== Done ===`);
  console.log(`Generated: ${stats.generated}, Failed batches: ${stats.failed}`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
