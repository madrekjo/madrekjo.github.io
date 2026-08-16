import { normalize } from '../src/dedupe.js';
import { settings } from '../src/config.js';

const KEYS = ['A', 'B', 'C', 'D'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

export function checkSchema(q, ctx = {}) {
  const issues = [];
  const minLen = settings().min_question_length ?? 12;

  if (!q || typeof q !== 'object') return ['السؤال غير موجود (null)'];
  if (!q.question || typeof q.question !== 'string' || !q.question.trim()) issues.push('نص السؤال فارغ');
  else if (q.question.trim().length < minLen) issues.push(`نص السؤال قصير جدًا (${q.question.trim().length} حرفًا — الحد الأدنى ${minLen})`);

  const opts = q.options;
  if (!opts || typeof opts !== 'object') {
    issues.push('لا توجد خيارات options');
  } else {
    for (const k of KEYS) {
      if (typeof opts[k] !== 'string' || !opts[k].trim()) issues.push(`الخيار ${k} فارغ أو مفقود`);
    }
    const values = KEYS.map((k) => (typeof opts[k] === 'string' ? normalize(opts[k]) : '')).filter(Boolean);
    const uniq = new Set(values);
    if (uniq.size !== values.length) issues.push('توجد خيارات متكررة أو متطابقة');
  }

  if (!KEYS.includes(q.correct_answer)) issues.push(`correct_answer ليس ضمن A-D (الموجود: ${JSON.stringify(q.correct_answer)})`);

  if (!q.correct_answer_text || typeof q.correct_answer_text !== 'string' || !q.correct_answer_text.trim()) {
    issues.push('correct_answer_text فارغ');
  } else if (opts && typeof opts[q.correct_answer] === 'string' && normalize(q.correct_answer_text) !== normalize(opts[q.correct_answer])) {
    issues.push('correct_answer_text لا يطابق نص الخيار الصحيح');
  }

  if (q.correct_answer && opts && typeof opts[q.correct_answer] === 'string' && opts[q.correct_answer].trim()) {
    const ca = normalize(opts[q.correct_answer]);
    for (const k of KEYS) {
      if (k !== q.correct_answer && typeof opts[k] === 'string' && normalize(opts[k]) === ca) {
        issues.push(`الخيار ${k} يطابق الإجابة الصحيحة (أكثر من إجابة صحيحة)`);
      }
    }
  }

  if (q.difficulty !== undefined && !DIFFICULTIES.includes(q.difficulty)) {
    issues.push(`difficulty غير معروف: ${JSON.stringify(q.difficulty)}`);
  }

  if (q.source !== undefined) {
    if (q.source && q.source.page !== undefined && q.source.page !== null && (typeof q.source.page !== 'number' || Number.isNaN(q.source.page))) {
      issues.push('source.page ليس رقمًا صحيحًا');
    }
  }

  return issues;
}
