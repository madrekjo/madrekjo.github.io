import fs from 'node:fs';
import path from 'node:path';
import { paths, subjectName, settings, writeJson, readJson, outputLayout } from './config.js';
import { pad } from './ids.js';
import * as logger from './logger.js';

export function unitDir(unitNum) {
  return `unit-${pad(unitNum, 2)}`;
}

export function lessonFile(lessonIndex) {
  return `lesson-${pad(lessonIndex, 2)}.json`;
}

// التخطيط standard: {root}/{generation}/{semester}/{subject}  (بنية الموقع الحالية)
// التخطيط test:     {root}/{generation}/{subject}           (مسرح الاختبار)
function subjectBase(root, book) {
  return outputLayout() === 'test'
    ? path.join(root, book.generation, book.subject)
    : path.join(root, book.generation, book.semester, book.subject);
}

export function stagingBase(book) {
  return subjectBase(paths().output, book);
}

export function questionsBase(book) {
  return subjectBase(paths().questions, book);
}

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export function writeLessonFile(book, unit, lesson, questions) {
  const lessonIndex = lesson.index ?? 1;
  const relDir = unitDir(unit.unit_number);
  const relFile = lessonFile(lessonIndex);
  const doc = {
    lesson: {
      lesson_number: lesson.lesson_number,
      lesson_name: lesson.lesson_name,
      unit_number: unit.unit_number,
      unit_name: unit.unit_name,
      page_start: lesson.page_start ?? unit.page_start ?? null,
      page_end: lesson.page_end ?? unit.page_end ?? null,
      questions
    }
  };
  writeBoth(book, relDir, relFile, doc);
  return path.posix.join(relDir, relFile);
}

export function writeReviewFile(book, unit, questions) {
  const relDir = unitDir(unit.unit_number);
  const format = settings().review_format === 'lesson' ? 'lesson' : 'array';
  const doc = format === 'lesson'
    ? { lesson: { lesson_number: `Unit ${unit.unit_number} Review`, lesson_name: `مراجعة الوحدة ${unit.unit_number}: ${unit.unit_name}`, unit_number: unit.unit_number, unit_name: unit.unit_name, page_start: unit.page_start ?? null, page_end: unit.page_end ?? null, question_count: questions.length, questions } }
    : questions;
  writeBoth(book, relDir, 'review.json', doc);
  return path.posix.join(relDir, 'review.json');
}

function writeBoth(book, relDir, relFile, doc) {
  const staging = path.join(stagingBase(book), relDir, relFile);
  const final = path.join(questionsBase(book), relDir, relFile);
  atomicWrite(staging, doc);
  atomicWrite(final, doc);
  const relRoot = outputLayout() === 'test'
    ? `${book.generation}/${book.subject}`
    : `${book.generation}/${book.semester}/${book.subject}`;
  logger.info(`حفظ الأسئلة: questions/${relRoot}/${relDir}/${relFile}`);
}

function semesterLabel(sem) {
  if (String(sem).endsWith('-2')) return 'ف2';
  return 'ف1';
}

export function mergeSubjectIndex(book, structure) {
  const idxPath = path.join(questionsBase(book), 'index.json');
  const existing = readJson(idxPath, null);

  const base = existing || {
    subject_id: book.subject,
    subject: subjectName(book.subject),
    generation_id: book.generation,
    generation: book.generation,
    semester_id: book.semester,
    semester: book.semester.endsWith('-2') ? 2 : 1,
    semester_label: semesterLabel(book.semester),
    units: []
  };

  const existingUnits = new Map(base.units.map((u) => [Number(u.number), u]));
  for (const unit of structure.units) {
    const unitNum = unit.unit_number;
    const existingUnit = existingUnits.get(unitNum);
    if (existingUnit) {
      if (existingUnit.lessons && existingUnit.lessons.length) continue;
    }
    const lessons = unit.lessons.map((l, li) => ({
      id: `L${pad(li + 1, 2)}`,
      number: li + 1,
      name: l.lesson_name,
      file: `${unitDir(unitNum)}/${lessonFile(li + 1)}`
    }));
    const entry = {
      id: `U${pad(unitNum, 2)}`,
      number: unitNum,
      name: unit.unit_name,
      lessons,
      review: {
        id: 'REV',
        name: 'مراجعة الوحدة',
        file: `${unitDir(unitNum)}/review.json`
      }
    };
    if (existingUnit) {
      Object.assign(existingUnit, entry);
    } else {
      base.units.push(entry);
      existingUnits.set(unitNum, entry);
    }
  }
  base.units.sort((a, b) => Number(a.number) - Number(b.number));
  atomicWrite(idxPath, base);
  logger.info(`تحديث index.json: questions/${book.generation}/${book.semester}/${book.subject}/index.json`);
  return base;
}

export function updateGlobalIndex(book) {
  if (!settings().update_global_index) return;
  const file = path.join(paths().questions, 'index.json');
  const idx = readJson(file, { generations: [], subjects: [] });
  if (!idx.generations.includes(book.generation)) idx.generations.push(book.generation);
  if (!idx.subjects.some((s) => s.slug === book.subject)) {
    idx.subjects.push({ subject_id: book.subject, slug: book.subject, name: subjectName(book.subject) });
  }
  atomicWrite(file, idx);
  logger.info(`تحديث الفهرس العام: questions/index.json`);
}
