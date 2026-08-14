import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('questions/2009/semester-1/math');
const KEYS = ['A', 'B', 'C', 'D'];
const EXPECTED_LESSON = 40;
const EXPECTED_REVIEW = 50;

function normalizeQuestions(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.questions)) return data.questions;
  if (data && data.lesson && Array.isArray(data.lesson.questions)) return data.lesson.questions;
  return [];
}

function reasons(q) {
  const r = [];
  if (!q) return ['السؤال فارغ (null)'];
  if (!q.id || !String(q.id).trim()) r.push('بلا معرّف id');
  if (!q.question || !String(q.question).trim()) r.push('نص السؤال فارغ');
  if (!q.options || typeof q.options !== 'object') r.push('لا توجد خيارات options');
  else KEYS.forEach(k => {
    if (typeof q.options[k] !== 'string' || !q.options[k].trim()) r.push('الخيار ' + k + ' فارغ أو مفقود');
  });
  if (!KEYS.includes(q.correct_answer)) r.push('correct_answer ليس ضمن A-D (الموجود: ' + JSON.stringify(q.correct_answer) + ')');
  if (!q.correct_answer_text || !String(q.correct_answer_text).trim()) r.push('correct_answer_text فارغ');
  return r;
}

function scanDir() {
  const units = fs.readdirSync(ROOT).filter(d => /^unit-\d+$/.test(d)).sort();
  const report = [];
  let totalQuestions = 0, totalValid = 0, totalBad = 0, totalDupIds = 0;
  const idMap = new Map();

  for (const unit of units) {
    const files = fs.readdirSync(path.join(ROOT, unit)).filter(f => /\.json$/.test(f)).sort();
    for (const file of files) {
      const fp = path.join(ROOT, unit, file);
      let data;
      try { data = JSON.parse(fs.readFileSync(fp, 'utf8')); }
      catch (e) {
        report.push({ file: 'questions/2009/semester-1/math/' + unit + '/' + file, error: 'JSON تالف: ' + e.message });
        continue;
      }
      const list = normalizeQuestions(data);
      const isReview = file.indexOf('review') === 0;
      const expected = isReview ? EXPECTED_REVIEW : EXPECTED_LESSON;
      const entry = {
        file: 'questions/2009/semester-1/math/' + unit + '/' + file,
        type: isReview ? 'مراجعة' : 'درس',
        expected,
        total: list.length,
        valid: 0,
        bad: [],
        dupIds: []
      };
      list.forEach((q, i) => {
        totalQuestions++;
        const qid = q && q.id;
        if (qid) {
          if (idMap.has(qid)) { entry.dupIds.push(qid + ' (مكرر مع ' + idMap.get(qid) + ')'); totalDupIds++; }
          else idMap.set(qid, file);
        }
        const r = reasons(q);
        const ok = r.length === 0;
        if (ok) { entry.valid++; totalValid++; }
        else {
          entry.bad.push({ index: i + 1, id: qid || '-', reasons: r });
          totalBad++;
        }
      });
      entry.shortfall = Math.max(0, expected - entry.valid);
      report.push(entry);
    }
  }
  return { report, totalQuestions, totalValid, totalBad, totalDupIds };
}

const { report, totalQuestions, totalValid, totalBad, totalDupIds } = scanDir();

console.log('=== تقرير فحص الأسئلة ===');
console.log('الإجمالي: ' + totalQuestions + ' سؤالاً | صالح: ' + totalValid + ' | ناقص/غير صالح: ' + totalBad + ' | معرّفات مكررة: ' + totalDupIds + '\n');

let filesWithIssues = 0;
for (const e of report) {
  if (e.error) { console.log('[JSON تالف] ' + e.file + '\n   ' + e.error); filesWithIssues++; continue; }
  const issueCount = e.bad.length + e.dupIds.length + e.shortfall;
  if (issueCount === 0) continue;
  filesWithIssues++;
  console.log('>>> ' + e.file + '  (' + e.type + ')');
  console.log('    في الملف: ' + e.total + ' سؤالاً | صالح: ' + e.valid + ' | المتوقع في الموقع: ' + e.expected + ' | العجز: ' + e.shortfall);
  if (e.bad.length) {
    console.log('    — غير صالحة (' + e.bad.length + '):');
    e.bad.forEach(b => console.log('      سؤال رقم ' + b.index + ' (id=' + b.id + '): ' + b.reasons.join(' ; ')));
  }
  if (e.dupIds.length) console.log('    — معرّفات مكررة: ' + e.dupIds.join(' ; '));
  console.log('');
}

console.log('الملفات ذات المشاكل: ' + filesWithIssues + ' من ' + report.length);
