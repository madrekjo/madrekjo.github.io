import { checkSchema } from './schema.js';
import { checkContent } from './content.js';
import { verifyQuestion } from './math.js';

export { checkSchema } from './schema.js';
export { checkContent } from './content.js';
export { verifyQuestion } from './math.js';

export function validateQuestion(q, ctx = {}) {
  const issues = [...checkSchema(q, ctx), ...checkContent(q, ctx)];
  let calc = null;
  if (ctx.verifyCalculations && q && q.correct_answer) {
    try {
      calc = verifyQuestion(q);
      if (calc.status === 'failed') issues.push('فشل التحقق الحسابي: ' + calc.detail);
    } catch {
      calc = { status: 'unverified', detail: 'خطأ أثناء التحقق الحسابي' };
    }
  }
  return {
    valid: issues.length === 0,
    issues,
    needsAiReview: Boolean(calc && calc.status === 'unverified' && !issues.length),
    calc
  };
}

export function validateBatch(list, ctx = {}) {
  const accepted = [];
  const rejected = [];
  const aiReview = [];
  list.forEach((q, i) => {
    const res = validateQuestion(q, ctx);
    if (res.valid) {
      if (res.needsAiReview) aiReview.push({ q, index: i, detail: res.calc.detail });
      accepted.push(q);
    } else {
      rejected.push({ q, index: i, issues: res.issues });
    }
  });
  return { accepted, rejected, aiReview };
}

export function validateFile(data, { expected = null, idPattern = null } = {}) {
  const list = Array.isArray(data) ? data : data && data.lesson && Array.isArray(data.lesson.questions) ? data.lesson.questions : [];
  const issues = [];
  const ids = new Set();
  let numbersOk = true;

  list.forEach((q, i) => {
    if (!q || typeof q !== 'object') { issues.push(`السؤال ${i + 1}: غير صالح`); return; }
    const schemaIssues = checkSchema(q);
    if (schemaIssues.length) issues.push(`السؤال ${i + 1} (${q.id || '-'}): ${schemaIssues.join(' ; ')}`);
    if (!q.id || !String(q.id).trim()) issues.push(`السؤال ${i + 1}: بلا id`);
    else if (ids.has(q.id)) issues.push(`السؤال ${i + 1}: id مكرر ${q.id}`);
    else ids.add(q.id);
    if (q.number !== i + 1) numbersOk = false;
  });

  if (expected !== null && list.length !== expected) {
    issues.push(`عدد الأسئلة ${list.length} لا يطابق المطلوب ${expected}`);
  }
  if (!numbersOk) issues.push('أرقام الأسئلة (number) غير متسلسلة');
  if (idPattern) {
    for (const q of list) {
      if (q.id && idPattern && !new RegExp(idPattern).test(q.id)) {
        issues.push(`السؤال ${q.id}: id لا يطابق النمط ${idPattern}`);
      }
    }
  }
  return { valid: issues.length === 0, issues, count: list.length };
}

export function validateQuestionJsonParse(text) {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
