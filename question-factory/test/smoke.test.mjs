import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';

import { evaluateExpression, parseNumeric, verifyQuestion, normalizeExponents } from '../validators/math.js';
import { Dedupe, literalHash, similarity, normalize } from '../src/dedupe.js';
import { checkSchema, validateFile } from '../validators/index.js';
import { generateMockBatch } from '../src/mock.js';
import { makeLessonId, makeReviewId } from '../src/ids.js';
import { buildPdf } from './pdf-builder.mjs';

test('evaluator: تعابير بسيطة', () => {
  assert.ok(Math.abs(evaluateExpression('2 + 3 * 4') - 14) < 1e-9);
  assert.ok(Math.abs(evaluateExpression('(8.85e-12 * 8e-4) / 2e-3') - 3.54e-12) < 1e-20);
  assert.ok(Math.abs(evaluateExpression('sqrt(2)') - Math.sqrt(2)) < 1e-9);
  assert.ok(Math.abs(evaluateExpression('10^3') - 1000) < 1e-9);
  assert.ok(Math.abs(evaluateExpression('pi * 2') - Math.PI * 2) < 1e-9);
});

test('parseNumeric: وحدات وأسس', () => {
  assert.equal(parseNumeric('9.9 mC'), 9.9);
  assert.equal(parseNumeric('2.16 × 10^-3 J'), 2.16e-3);
  assert.equal(parseNumeric('10⁻³'), 1e-3);
  assert.equal(parseNumeric('1/2'), 0.5);
  assert.equal(parseNumeric('لا توجد أرقام'), null);
});

test('normalizeExponents: أحرف علوية', () => {
  assert.equal(normalizeExponents('10⁻¹²'), '10^-12');
});

test('verifyQuestion: تحقق حسابي ناجح', () => {
  const q = {
    correct_answer: 'A',
    correct_answer_text: '3.54 × 10^-12 F',
    options: { A: '3.54 × 10^-12 F', B: '1.77 pF', C: '7.08 pF', D: '3.54 nF' },
    solution: { formula: '(8.85e-12 * 8e-4) / 2e-3', steps: [], summary: '' }
  };
  assert.equal(verifyQuestion(q).status, 'verified');
});

test('verifyQuestion: معادلة خاطئة ترفض', () => {
  const q = {
    correct_answer: 'A',
    correct_answer_text: '5',
    options: { A: '5', B: '3', C: '7', D: '9' },
    solution: { formula: '2 + 2', steps: [], summary: '' }
  };
  assert.equal(verifyQuestion(q).status, 'failed');
});

test('verifyQuestion: معادلة بمتغيرات → unverified', () => {
  const q = {
    correct_answer: 'B',
    correct_answer_text: '5',
    options: { A: '3', B: '5', C: '7', D: '9' },
    solution: { formula: 'C = Q / V', steps: [], summary: '' }
  };
  assert.equal(verifyQuestion(q).status, 'unverified');
});

test('dedupe: تكرار حرفي', () => {
  const d = new Dedupe();
  const q = { id: 'Q1', question: 'ما وحدة قياس القوة؟' };
  d.add(q, { subject: 'physics' });
  const dup = d.check({ id: 'Q2', question: 'ما وحدة قياس القوة؟' }, { subject: 'physics' });
  assert.equal(dup.dup, true);
  assert.equal(dup.kind, 'literal');
});

test('dedupe: تشابه معنوي', () => {
  const d = new Dedupe();
  d.add({ id: 'Q1', question: 'ما وحدة قياس القوة؟' }, { subject: 'physics' });
  const dup = d.check({ id: 'Q2', question: 'بأي وحدة يتم قياس القوة؟' }, { subject: 'physics' });
  assert.equal(dup.dup, true);
  assert.equal(dup.kind, 'semantic');
});

test('dedupe: أسئلة مختلفة لا تُرفض', () => {
  const d = new Dedupe();
  d.add({ id: 'Q1', question: 'ما وحدة قياس القوة؟' }, { subject: 'physics' });
  const ok = d.check({ id: 'Q2', question: 'ما مقدار القوة المؤثرة في جسم كتلته 2kg؟' }, { subject: 'physics' });
  assert.equal(ok.dup, false);
});

test('normalize/similarity', () => {
  assert.equal(normalize('القوّة'), 'القوه');
  assert.ok(similarity('ما وحدة قياس القوة', 'بأي وحدة يتم قياس القوة') > 0.8);
});

test('normalize: الرموز الرياضية تغير المعنى ولا تُحذف', () => {
  assert.notEqual(normalize('-1'), normalize('1'));
  assert.notEqual(normalize('+1'), normalize('1'));
  assert.notEqual(normalize('-5'), normalize('5'));
  assert.notEqual(normalize('x - 2'), normalize('x + 2'));
  assert.notEqual(normalize('-1'), normalize('1'));
});

test('normalize: اختلاف المسافات فقط → متساوٍ (يُكتشف كتكرار)', () => {
  assert.equal(normalize('x  =   2'), normalize('x = 2'));
  assert.equal(normalize('ما   وحدة   القوة؟'), normalize('ما وحدة القوة؟'));
});

test('normalize: خيارات LaTeX تختلف بالعلامة → غير متساوية', () => {
  assert.notEqual(normalize('$2, -1 \\pm i\\sqrt{3}$'), normalize('$2, 1 \\pm i\\sqrt{3}$'));
});

test('dedupe: تكرار حرفي مع اختلاف المسافات', () => {
  const d = new Dedupe();
  d.add({ id: 'Q1', question: 'ما وحدة قياس القوة؟' }, { subject: 'physics' });
  const dup = d.check({ id: 'Q2', question: 'ما   وحدة   قياس   القوة؟' }, { subject: 'physics' });
  assert.equal(dup.dup, true);
  assert.equal(dup.kind, 'literal');
});

test('schema: خيارات تختلف بالعلامة الرياضية → لا تُعد تكرارًا', () => {
  const q = {
    question: 'أجد الجذور المركبة للمعادلة $z^{3} - 8 = 0$.',
    options: { A: '2 فقط', B: '$2, -1 \\pm i\\sqrt{3}$', C: '$2, 1 \\pm i\\sqrt{3}$', D: '$\\pm 2$' },
    correct_answer: 'B',
    correct_answer_text: '$2, -1 \\pm i\\sqrt{3}$',
    difficulty: 'hard'
  };
  assert.deepEqual(checkSchema(q), []);
});

test('schema: سؤال صالح', () => {
  const q = {
    question: 'ما وحدة قياس المواسعة الكهربائية؟',
    options: { A: 'كولوم', B: 'فولت', C: 'واط', D: 'فاراد' },
    correct_answer: 'D',
    correct_answer_text: 'فاراد',
    difficulty: 'easy'
  };
  assert.deepEqual(checkSchema(q), []);
});

test('schema: خيارات مكررة وcorrect_answer_text خاطئ', () => {
  const q = {
    question: 'ما وحدة قياس المواسعة؟',
    options: { A: 'فاراد', B: 'فاراد', C: 'واط', D: 'أمبير' },
    correct_answer: 'A',
    correct_answer_text: 'فولت',
    difficulty: 'medium'
  };
  const issues = checkSchema(q);
  assert.ok(issues.some((i) => i.includes('متكرر')));
  assert.ok(issues.some((i) => i.includes('لا يطابق')));
});

test('validateFile: ترقيم وid', () => {
  const q = (id, n) => ({
    id, number: n,
    question: 'سؤال اختبار طويل بما فيه الكفاية للفحص الصحيح',
    options: { A: 'واحد', B: 'اثنان', C: 'ثلاثة', D: 'أربعة' },
    correct_answer: 'A',
    correct_answer_text: 'واحد'
  });
  const res = validateFile({ lesson: { questions: [q('U01-L01-Q001', 1), q('U01-L01-Q002', 2)] } }, { expected: 2, idPattern: '^U01-L01-Q\\d+$' });
  assert.equal(res.valid, true);
});

test('ids: أنماط صحيحة', () => {
  assert.equal(makeLessonId(3, 3, 1, 2), 'U03-L03-Q001');
  assert.equal(makeReviewId(3, 1, 'REV', 2), 'U03-REV-Q001');
  assert.equal(makeReviewId(3, 1, 'R', 2), 'U03-R-Q001');
});

test('mock: توليد دفعة صالحة', () => {
  const batch = generateMockBatch({ content: 'وحدة قياس القوة هي النيوتن. القوة تساوي الكتلة مضروبة في التسارع. التسارع هو تغير السرعة مع الزمن.', lesson_name: 'القوة', page: 5 }, 10);
  assert.equal(batch.length, 10);
  for (const q of batch) {
    assert.equal(checkSchema(q).length, 0);
    assert.equal(q.correct_answer_text, q.options[q.correct_answer]);
  }
});

test('pdf: استخراج نص من PDF مبني', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'qf-'));
  const pdfPath = path.join(tmp, 'test.pdf');
  fs.writeFileSync(pdfPath, buildPdf('Hello Question Factory PDF Test'));
  const { extractBook, readPage, isExtractedCurrent } = await import('../src/extractor.js');
  const book = { generation: 'test-gen', semester: 'semester-1', subject: 'test-subj', source: pdfPath };
  const manifest = await extractBook(book);
  assert.equal(manifest.page_count, 1);
  assert.equal(manifest.source, pdfPath);
  const text = readPage('test-gen', 'test-subj', 1);
  assert.ok(text.includes('Question Factory'));
  assert.equal(await isExtractedCurrent('test-gen', 'test-subj', pdfPath), true);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('literalHash مستقر', () => {
  assert.equal(literalHash('ما وحدة قياس القوة؟'), literalHash('ما وحدة قياس القوة؟'));
  assert.notEqual(literalHash('ما وحدة قياس القوة؟'), literalHash('ما وحدة قياس الطاقة؟'));
});
