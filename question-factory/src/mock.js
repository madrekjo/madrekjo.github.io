// مولّد أسئلة محلي تجريبي (mock) لاختبار خط الإنتاج كاملًا بدون مفتاح API.
// الأسئلة الناتجة سليمة بنيويًا لكنها ليست أسئلة حقيقية — للاختبار فقط.

function splitSentences(text) {
  const parts = String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!؟?؛])/g);
  const out = [];
  for (let p of parts) {
    p = p.trim();
    if (p.length >= 15 && p.split(' ').length >= 4) out.push(p);
    if (out.length >= 60) break;
  }
  return out;
}

function words(sentence) {
  return sentence.split(' ').filter(Boolean);
}

function tail(sentence, n) {
  const w = words(sentence);
  return w.slice(-n).join(' ');
}

function head(sentence, n) {
  const w = words(sentence);
  return w.slice(0, Math.max(1, w.length - n)).join(' ');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DIFF = ['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard'];

function buildQuestion({ question, answer, allSentences, lessonName, page, diff }) {
  const distractors = [];
  for (const s of shuffle(allSentences)) {
    if (s !== answer && !distractors.includes(s)) distractors.push(s);
    if (distractors.length >= 3) break;
  }
  while (distractors.length < 3) distractors.push(`إجابة غير موجودة في النص ${distractors.length + 1}`);

  const opts = shuffle([answer, ...distractors]);
  const correctKey = 'ABCD'[opts.indexOf(answer)];

  return {
    question,
    options: { A: opts[0], B: opts[1], C: opts[2], D: opts[3] },
    correct_answer: correctKey,
    correct_answer_text: answer,
    difficulty: diff,
    source: {
      page: page || 1,
      reference: 'سؤال تجريبي (mock) — للاختبار فقط'
    },
    solution: {
      formula: null,
      steps: ['سؤال تجريبي مولّد محليًا'],
      summary: 'هذا السؤال ولّده المولّد التجريبي mock لاختبار خط الإنتاج.'
    },
    explanation: 'لا يُستخدم هذا السؤال في الإنتاج الفعلي.'
  };
}

export function generateMockBatch(ctx, count) {
  const content = ctx.content || '';
  let sentences = splitSentences(content);
  if (sentences.length < 4) {
    for (let i = 0; i < 4; i++) sentences.push(`جملة تجريبية رقم ${i + 1} من محتوى الدرس ${ctx.lesson_name || ''} وتشرح فكرة أساسية فيه.`);
  }
  const lesson = ctx.lesson_name || 'الدرس';

  const questions = [];
  const usedKeys = new Set();
  let i = 0;
  let guard = 0;
  while (questions.length < count && guard < count * 30) {
    guard++;
    const base = sentences[i % sentences.length];
    const mode = i % 3;
    let question, answer;
    if (mode === 0) {
      const n = 1 + (i % 3);
      answer = tail(base, n);
      question = `حسب المحتوى (${lesson}): أكمل الجملة التالية: "${head(base, n)}…"`;
    } else if (mode === 1) {
      const n = 1 + (i % 2);
      answer = head(base, n);
      question = `حسب المحتوى (${lesson}): أكمل بداية الجملة التالية: "…${tail(base, n)}"`;
    } else {
      answer = base;
      question = `حسب المحتوى (${lesson}): أي العبارات الآتية موجودة حرفيًا في النص؟`;
    }
    const key = normalizeKey(question + '|' + answer);
    if (usedKeys.has(key)) { i++; continue; }
    usedKeys.add(key);
    questions.push(buildQuestion({
      question,
      answer,
      allSentences: sentences.filter((s) => s !== answer),
      lessonName: lesson,
      page: ctx.page || 1,
      diff: DIFF[questions.length % DIFF.length]
    }));
    i++;
  }

  while (questions.length < count) {
    const q = buildQuestion({
      question: `حسب المحتوى (${lesson}): أكمل الجملة التالية: "جملة تجريبية لتعبئة العدد المطلوب ${questions.length}…"`,
      answer: 'جملة تجريبية لتعبئة العدد المطلوب',
      allSentences: sentences,
      lessonName: lesson,
      page: ctx.page || 1,
      diff: 'easy'
    });
    questions.push(q);
  }
  return questions;
}

function normalizeKey(s) {
  return String(s).replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}
