import fs from 'fs';
import path from 'path';

const FILE = path.resolve('questions/2009/semester-1/math/unit-01/lesson-01.json');
const KEYS = ['A', 'B', 'C', 'D'];

const norm = s => String(s || '').replace(/\s+/g, '').trim();

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const list = data.lesson.questions;
let fixed = 0, manual = [];

list.forEach(q => {
  if (KEYS.includes(q.correct_answer)) return;
  const target = q.correct_answer_text;
  if (!target) { manual.push({ id: q.id, reason: 'لا يوجد correct_answer_text للاستنتاج منه' }); return; }
  const tn = norm(target);
  let exact = [], loose = [];
  KEYS.forEach(k => {
    const v = q.options && q.options[k];
    if (v === undefined) return;
    if (String(v).trim() === String(target).trim()) exact.push(k);
    if (norm(v) === tn) loose.push(k);
  });
  const matches = exact.length === 1 ? exact : (exact.length === 0 && loose.length === 1 ? loose : null);
  if (matches) {
    q.correct_answer = matches[0];
    fixed++;
    console.log('✓ ' + q.id + ' → correct_answer = ' + matches[0]);
  } else {
    manual.push({ id: q.id, matches: exact.concat(loose), target: target });
    console.log('✗ ' + q.id + ' → لا تطابق فريد. تطابقات: ' + (exact.concat(loose).join(',') || 'لا شيء') + ' | النص: ' + target);
  }
});

if (fixed) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('\nتم إصلاح ' + fixed + ' سؤالاً.');
}
if (manual.length) console.log('متبقٍ للتدخل اليدوي: ' + manual.length);
