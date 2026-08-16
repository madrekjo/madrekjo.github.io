import fs from 'node:fs';
import path from 'node:path';
import { paths, settings, subjectName, aiEnv } from './config.js';
import * as state from './state.js';
import * as logger from './logger.js';
import { chat, extractJsonArray, AIError } from './ai-client.js';
import { readPages, loadManifest, readPage } from './extractor.js';
import { buildQueue } from './queue.js';
import { validateBatch, validateFile } from '../validators/index.js';
import { Dedupe, normalizeQuestionsData, seedDedupeFromFiles } from './dedupe.js';
import { makeLessonId, makeReviewId } from './ids.js';
import { writeLessonFile, writeReviewFile, mergeSubjectIndex, unitDir, lessonFile, questionsBase } from './output.js';
import { generateMockBatch } from './mock.js';
import { subjectConf } from './config.js';

function readPrompt(name) {
  const f = path.join(paths().prompts, name);
  return fs.readFileSync(f, 'utf8');
}

function fillPrompt(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

function buildTaskContent(task) {
  const pages = readPages(task.generation, task.subject, task.page_start || 1, task.page_end || Number.MAX_SAFE_INTEGER);
  return pages.map((p) => `--- صفحة ${p.page} ---\n${p.text}`).join('\n');
}

function truncateContent(text) {
  const max = settings().max_content_chars ?? 24000;
  return text.length > max ? text.slice(0, max) + '\n...(مقتطع لطول المحتوى)' : text;
}

function finalFileFor(task) {
  if (task.type === 'lesson') {
    return path.join(questionsBase(task), unitDir(task.unit), lessonFile(task.lesson_index || 1));
  }
  return path.join(questionsBase(task), unitDir(task.unit), 'review.json');
}

function countValidQuestions(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return normalizeQuestionsData(data).length;
  } catch {
    return 0;
  }
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
    lessons: (task.lessons || []).map((l) => `${l.number} - ${l.name}`).join('، '),
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

async function aiReviewPass(task, list) {
  if (!list.length) return new Set();
  const template = readPrompt('validation.txt');
  const content = truncateContent(buildTaskContent(task));
  const questions = JSON.stringify(list, null, 2);
  const prompt = fillPrompt(template, { content, questions });
  const text = await chat(
    [
      { role: 'system', content: 'أنت مدقق أسئلة صارم وتخرج JSON فقط.' },
      { role: 'user', content: prompt }
    ],
    { temperature: 0.1, maxTokens: 4000, json: true }
  );
  const verdicts = extractJsonArray(text);
  const fail = new Set();
  for (const v of verdicts) {
    if (v && v.verdict === 'fail') fail.add(v.index);
  }
  return fail;
}

async function generateValidBatch(task, count, opts) {
  const cfg = settings();
  const conf = subjectConf(task.subject);
  const stats = { generated: 0, rejected: 0, regenerated: 0 };
  const accepted = [];
  let toGenerate = count;
  let attempt = 0;
  const ctx = {
    subject: task.subject,
    verifyCalculations: conf.verify_calculations,
    content: truncateContent(buildTaskContent(task))
  };

  while (toGenerate > 0 && attempt <= cfg.max_regeneration_attempts) {
    let parsed = null;
    try {
      parsed = opts.forceMock
        ? generateMockBatch({ content: ctx.content, lesson_name: task.lesson_name, page: task.page_start }, toGenerate)
        : await callGeneration(task, toGenerate);
    } catch (err) {
      stats.regenerated++;
      if (attempt >= cfg.max_regeneration_attempts) throw err;
      attempt++;
      continue;
    }
    stats.generated += Array.isArray(parsed) ? parsed.length : 0;

    const batchResult = validateBatch(parsed, ctx);

    if (!opts.forceMock && batchResult.aiReview.length) {
      try {
        const failIdx = await aiReviewPass(task, batchResult.aiReview.map((r) => r.q));
        const failedList = batchResult.aiReview.filter((r) => failIdx.has(r.index));
        for (const f of failedList) {
          batchResult.rejected.push({ q: f.q, index: f.index, issues: ['رفضته مراجعة AI: ' + f.detail] });
          batchResult.accepted = batchResult.accepted.filter((a) => a !== f.q);
        }
      } catch (err) {
        logger.warn(`مراجعة AI فشلت (لن تُرفض الأسئلة بسببها): ${err.message}`);
      }
    }

    const fresh = [];
    for (const q of batchResult.accepted) {
      const res = opts.dedupe.check(q, { subject: task.subject, taskId: task.id, threshold: task.dedupe_threshold });
      if (res.dup) {
        stats.rejected++;
        logger.validation(`[${task.id}] مرفوض (${res.kind}): ${q.question.slice(0, 60)}... (${res.reason})`);
      } else {
        fresh.push(q);
      }
    }
    accepted.push(...fresh);
    stats.rejected += batchResult.rejected.length;
    stats.regenerated += batchResult.rejected.length + (Array.isArray(parsed) ? parsed.length - batchResult.accepted.length - batchResult.aiReview.length : 0) * 0;
    toGenerate = count - accepted.length;
    attempt++;
  }

  return { accepted, stats, shortfall: Math.max(0, count - accepted.length) };
}

async function processTask(task, opts) {
  const progress = opts.progress;
  progress.current_task = task.id;
  task.status = 'processing';
  state.saveQueue(opts.queue);
  state.saveProgress(progress);
  logger.info(`بدء المهمة: ${task.id} (${task.type}) — ${task.lesson_name} — الهدف ${task.target}`);

  const finalFile = finalFileFor(task);
  if (countValidQuestions(finalFile) >= task.target) {
    task.status = 'completed';
    progress.completed[task.id] = { type: task.type, questions: task.target, file: finalFile.replaceAll('\\', '/'), completed_at: new Date().toISOString(), reused: true };
    progress.current_task = null;
    state.saveQueue(opts.queue);
    state.saveProgress(progress);
    logger.info(`المهمة موجودة مسبقًا (${task.target} سؤالًا صالحًا) — تم التجاهل: ${task.id}`);
    return 'done';
  }
  seedDedupeFromFiles(opts.dedupe, [finalFile]);

  let partial = state.loadPartial(task.id);
  const questions = (partial && partial.questions) || [];
  let batchIndex = (partial && partial.batch_index) || task.batch_index || 0;
  const stats = (partial && partial.stats) || { generated: 0, rejected: 0, regenerated: 0 };
  const batchSize = task.batch_size || settings().batch_size;
  let emptyRounds = 0;

  while (questions.length < task.target) {
    if (progress.paused) {
      task.status = 'paused';
      break;
    }
    if (Date.now() >= opts.runUntil && questions.length > 0) {
      task.status = 'paused';
      break;
    }

    const count = Math.min(batchSize, task.target - questions.length);
    logger.info(`[${task.id}] توليد دفعة ${batchIndex + 1} (${count} سؤالًا)`);
    const res = await generateValidBatch(task, count, opts);
    stats.generated += res.stats.generated;
    stats.rejected += res.stats.rejected;
    stats.regenerated += res.stats.regenerated;

    const newOnes = res.accepted.length;
    if (newOnes === 0) {
      emptyRounds++;
      logger.warn(`[${task.id}] دفعة بدون أسئلة مقبولة (المرة ${emptyRounds})`);
    } else {
      emptyRounds = 0;
    }
    questions.push(...res.accepted);
    batchIndex++;

    progress.counts.generated += newOnes;
    progress.counts.rejected += res.stats.rejected;
    progress.counts.regenerated += res.stats.regenerated;
    progress.attempts[task.id] = (progress.attempts[task.id] || 0) + 1;
    task.batch_index = batchIndex;
    state.savePartial(task.id, { questions, batch_index: batchIndex, stats });
    state.saveQueue(opts.queue);
    state.saveProgress(progress);

    if (emptyRounds >= (settings().max_regeneration_attempts + 1)) {
      throw new AIError('دفعات متتالية بدون أسئلة مقبولة (تكرار أو فشل في التوليد)', { retryable: false });
    }
    if (Date.now() >= opts.runUntil) break;
  }

  if (questions.length < task.target) {
    task.status = progress.paused ? 'paused' : 'paused';
    state.saveQueue(opts.queue);
    state.saveProgress(progress);
    logger.info(`[${task.id}] توقف مؤقت (${questions.length}/${task.target}) — سيُستأنف لاحقًا`);
    return 'paused';
  }

  const conf = subjectConf(task.subject);
  const renumbered = questions.map((q, i) => ({
    ...q,
    number: i + 1,
    id: task.type === 'review'
      ? makeReviewId(task.unit, i + 1, conf.review_id_prefix, conf.id_padding)
      : makeLessonId(task.unit, task.lesson_index || 1, i + 1, conf.id_padding)
  }));

  const idPattern = task.type === 'review'
    ? `^U${String(task.unit).padStart(conf.id_padding, '0')}-${conf.review_id_prefix}-Q\\d+$`
    : `^U${String(task.unit).padStart(conf.id_padding, '0')}-L${String(task.lesson_index || 1).padStart(conf.id_padding, '0')}-Q\\d+$`;
  const fileCheck = validateFile(
    task.type === 'review' ? renumbered : { lesson: { questions: renumbered } },
    { expected: task.target, idPattern }
  );

  if (!fileCheck.valid) {
    throw new AIError('فشل التحقق النهائي للملف: ' + fileCheck.issues.join(' ; '), { retryable: false });
  }

  if (task.type === 'review') {
    const unit = { unit_number: task.unit, unit_name: task.unit_name, page_start: task.page_start, page_end: task.page_end };
    const rel = writeReviewFile(task, unit, renumbered);
    progress.completed[task.id] = { type: 'review', questions: renumbered.length, file: finalFile.replaceAll('\\', '/'), completed_at: new Date().toISOString() };
    logger.info(`اكتملت مراجعة الوحدة ${task.unit}: ${renumbered.length} سؤالًا → ${rel}`);
  } else {
    const unit = { unit_number: task.unit, unit_name: task.unit_name, page_start: task.page_start, page_end: task.page_end };
    const lesson = { index: task.lesson_index, lesson_number: task.lesson, lesson_name: task.lesson_name, page_start: task.page_start, page_end: task.page_end };
    const rel = writeLessonFile(task, unit, lesson, renumbered);
    progress.completed[task.id] = { type: 'lesson', questions: renumbered.length, file: finalFile.replaceAll('\\', '/'), completed_at: new Date().toISOString() };
    logger.info(`اكتمل الدرس ${task.lesson}: ${renumbered.length} سؤالًا → ${rel}`);
  }

  for (const q of renumbered) opts.dedupe.add(q, { subject: task.subject, taskId: task.id });
  opts.dedupe.save();
  state.removePartial(task.id);
  task.status = 'completed';
  if (progress.current_task === task.id) progress.current_task = null;
  state.saveQueue(opts.queue);
  state.saveProgress(progress);
  return 'done';
}

export async function runGenerate({ testMode = false, mock = false } = {}) {
  state.ensureDirs();
  const cfg = settings();
  const forceMock = mock || aiEnv().provider === 'mock';
  const progress = state.loadProgress();
  const dedupe = new Dedupe();

  progress.status = 'running';
  progress.paused = false;
  progress.last_run_at = new Date().toISOString();
  if (!progress.started_at) progress.started_at = progress.last_run_at;
  state.saveProgress(progress);

  const queue = await buildQueue({ testMode });
  if (!queue.length) {
    console.log('لا توجد مهام قابلة للتشغيل.');
    console.log('  - ضع ملفات PDF في question-factory/books/ وحدّث config/books.json (enabled: true).');
    console.log('  - أو شغّل: npm run generate -- --test --mock لاختبار خط الإنتاج بدون API.');
    finishSession(progress);
    return;
  }

  if (forceMock) console.log('⚠️  وضع المحاكاة (mock) — أسئلة تجريبية فقط، لا تُستخدم في الإنتاج.');
  console.log('Question Factory — بدء التشغيل (' + (testMode ? 'TEST MODE' : 'إنتاج') + ')');
  console.log('الكتب: ' + [...new Set(queue.map((t) => t.subject))].length + ' مادة | المهام: ' + queue.length);

  const runUntil = Date.now() + cfg.max_runtime_hours * 3600 * 1000;
  const sessionStart = Date.now();

  const onSignal = () => {
    if (progress.current_task) {
      const t = queue.find((x) => x.id === progress.current_task);
      if (t && t.status === 'processing') t.status = 'paused';
    }
    progress.status = 'paused';
    progress.last_run_at = new Date().toISOString();
    progress.accumulated_seconds += Math.round((Date.now() - sessionStart) / 1000);
    state.saveQueue(queue);
    state.saveProgress(progress);
    logger.info('تم إيقاف البرنامج يدويًا — حُفظ التقدم.');
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const opts = { queue, progress, dedupe, forceMock, runUntil };
  try {
    for (const task of queue) {
      if (progress.paused) break;
      if (task.status === 'completed' || task.status === 'failed') continue;
      if (Date.now() >= runUntil) {
        logger.info('انتهت المدة الزمنية — لن تبدأ مهام جديدة.');
        break;
      }
      try {
        await processTask(task, opts);
      } catch (err) {
        progress.counts.errors++;
        task.status = 'failed';
        progress.failed[task.id] = { error: err.message, attempts: progress.attempts[task.id] || 1, at: new Date().toISOString() };
        logger.error(`فشلت المهمة ${task.id}: ${err.message}`, err);
        state.removePartial(task.id);
        state.saveQueue(queue);
        state.saveProgress(progress);
      }
    }
  } finally {
    progress.status = 'idle';
    progress.last_run_at = new Date().toISOString();
    progress.accumulated_seconds += Math.round((Date.now() - sessionStart) / 1000);
    state.saveQueue(queue);
    state.saveProgress(progress);
    logger.info('انتهت الجلسة. تم حفظ التقدم.');
  }

  const done = queue.filter((t) => t.status === 'completed').length;
  const failed = queue.filter((t) => t.status === 'failed').length;
  const paused = queue.filter((t) => t.status === 'paused').length;
  console.log('\n— ملخص الجلسة —');
  console.log('مهام مكتملة: ' + done + ' | فاشلة: ' + failed + ' | معلقة/متوقفة: ' + paused);
  console.log('أسئلة مولّدة: ' + progress.counts.generated + ' | مرفوضة: ' + progress.counts.rejected + ' | إعادة توليد: ' + progress.counts.regenerated);
  if (failed) console.log('المهام الفاشلة: ' + Object.keys(progress.failed).join(', '));
  console.log('يمكنك متابعة التشغيل لاحقًا: npm run generate');
}

function finishSession(progress) {
  progress.status = 'idle';
  progress.last_run_at = new Date().toISOString();
  state.saveProgress(progress);
}
