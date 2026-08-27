const fs = require('fs');
const path = require('path');

const SRC = 'C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\2010 اسئله';
const DST = 'C:\\Users\\abdal_cw9hjgr\\OneDrive\\Desktop\\مدارك جو موقع جديد\\questions\\2010\\semester-1';

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function sanitizeJson(text) {
  // Fix Arabic commas used as JSON separators: ، → ,
  // Only replace commas that are OUTSIDE of strings (between array/object elements)
  let result = '';
  let inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; result += c; continue; }
    if (c === '\\' && inStr) { esc = true; result += c; continue; }
    if (c === '"') { inStr = !inStr; result += c; continue; }
    if (!inStr && c === '\u060C') { result += ','; continue; } // Arabic comma → regular comma
    result += c;
  }
  return result;
}

function extractJsonObjects(text) {
  const objects = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{' || c === '[') { if (depth === 0) start = i; depth++; }
    if (c === '}' || c === ']') { depth--; if (depth === 0 && start >= 0) { objects.push(text.slice(start, i + 1)); start = -1; } }
  }
  return objects;
}

function readAndParse(filePath) {
  let raw = fs.readFileSync(filePath, 'utf8').trim();
  raw = sanitizeJson(raw);
  const objects = extractJsonObjects(raw);
  const results = [];
  for (const obj of objects) {
    try {
      results.push(JSON.parse(obj));
    } catch (e) {
      console.error(`  WARN: Failed to parse chunk (${obj.length} chars): ${e.message.slice(0, 100)}`);
      // Recovery 1: Try to extract questions array from broken JSON (lesson/unit objects)
      const qMatch = obj.match(/"questions"\s*:\s*\[/);
      if (qMatch) {
        const titleMatch = obj.match(/"(lesson_title|unit_title)"\s*:\s*"([^"]+)"/);
        const title = titleMatch ? titleMatch[2] : null;
        const type = titleMatch ? titleMatch[1] : null;
        const qObjects = extractJsonObjects(obj.slice(obj.indexOf('"questions"')));
        const questions = [];
        for (const qo of qObjects) {
          try {
            const parsed = JSON.parse(qo);
            if (parsed.question || parsed.options || parsed.answer) {
              questions.push(parsed);
            }
          } catch (e2) { /* skip */ }
        }
        if (questions.length > 0 && title) {
          const chunk = {};
          if (type === 'lesson_title') chunk.lesson_title = title;
          if (type === 'unit_title') chunk.unit_title = title;
          chunk.questions = questions;
          results.push(chunk);
          console.log(`    Recovered ${questions.length} questions from broken chunk "${title}"`);
        }
        continue;
      }
      // Recovery 2: Try to extract individual question objects from broken array
      const qObjects = extractJsonObjects(obj);
      const questions = [];
      for (const qo of qObjects) {
        try {
          const parsed = JSON.parse(qo);
          if (parsed.question || parsed['السؤال'] || parsed.ID || parsed.options || parsed.answer) {
            questions.push(parsed);
          }
        } catch (e2) { /* skip */ }
      }
      if (questions.length > 0) {
        results.push(questions);
        console.log(`    Recovered ${questions.length} questions from broken array chunk`);
      }
    }
  }
  return results;
}

function makeQuestion(q, unitNum, lessonNum, idx, overrides = {}) {
  let opts, correctKey, correctText;
  if (q['الخيارات'] && q['الإجابة_الصحيحة']) {
    opts = q['الخيارات'];
    correctKey = q['الإجابة_الصحيحة'];
    correctText = q['نص_الإجابة'] || '';
  } else if (Array.isArray(q.options)) {
    opts = Object.fromEntries(q.options.map((o, i) => [String.fromCharCode(65 + i), o]));
    const ans = q.answer;
    const idx2 = q.options.indexOf(ans);
    correctKey = idx2 >= 0 ? String.fromCharCode(65 + idx2) : 'A';
    correctText = ans;
  } else if (typeof q.options === 'object' && q.options !== null) {
    opts = q.options;
    const ans = q.answer;
    correctKey = 'A';
    for (const [k, v] of Object.entries(opts)) { if (v === ans) { correctKey = k; break; } }
    correctText = ans;
  } else {
    opts = { A: '', B: '', C: '', D: '' };
    correctKey = 'A';
    correctText = '';
  }

  return {
    question: q.question || q['السؤال'] || '',
    options: opts,
    correct_answer: correctKey,
    correct_answer_text: correctText,
    difficulty: q['مستوى_الصعوبة'] || overrides.difficulty || 'medium',
    source: { page: q['صفحة_المصدر'] || overrides.page || null, reference: overrides.reference || '' },
    solution: {
      formula: q['القانون_أو_القاعدة'] || null,
      steps: q['خطوات_الحل'] ? [q['خطوات_الحل']] : [],
      summary: q['تفسير_الإجابة'] || q.explanation || correctText
    },
    explanation: q['تفسير_الإجابة'] || q.explanation || correctText,
    number: idx + 1,
    id: overrides.id || `U${String(unitNum).padStart(2,'0')}-L${String(lessonNum).padStart(2,'0')}-Q${String(idx+1).padStart(3,'0')}`
  };
}

function writeLessonFile(subjDir, unitNum, lessonNum, lessonName, unitName, questions) {
  const unitDir = path.join(subjDir, `unit-${String(unitNum).padStart(2,'0')}`);
  ensureDir(unitDir);
  const data = {
    lesson: {
      lesson_number: `${unitNum}.${lessonNum}`,
      lesson_name: lessonName,
      unit_number: unitNum,
      unit_name: unitName,
      page_start: null,
      page_end: null,
      questions
    }
  };
  const fname = `lesson-${String(lessonNum).padStart(2,'0')}.json`;
  fs.writeFileSync(path.join(unitDir, fname), JSON.stringify(data, null, 2), 'utf8');
  return fname;
}

function writeReviewFile(subjDir, unitNum, unitName, questions) {
  const unitDir = path.join(subjDir, `unit-${String(unitNum).padStart(2,'0')}`);
  ensureDir(unitDir);
  const data = {
    lesson: {
      lesson_number: `${unitNum}.review`,
      lesson_name: `مراجعة الوحدة ${unitNum}`,
      unit_number: unitNum,
      unit_name: unitName,
      page_start: null,
      page_end: null,
      questions
    }
  };
  fs.writeFileSync(path.join(unitDir, 'review.json'), JSON.stringify(data, null, 2), 'utf8');
  return 'review.json';
}

// ============ ISLAMIC 2010 ============
function convertIslamic() {
  const subjDir = path.join(DST, 'islamic');
  // Clean existing
  fs.rmSync(subjDir, { recursive: true, force: true });
  ensureDir(subjDir);
  const indexUnits = [];

  // --- Units 1 & 2: JSON objects with lesson_title/questions ---
  for (const [unitNum, fileName, unitName, lessonNames] of [
    [1, 'وحده اولى.txt', 'الوحدة الأولى: واعتصموا بحبل الله جميعاً',
      { 1: 'الآيات 102-105 من سورة آل عمران', 2: 'الحديث الشريف (اتقاء الشبهات)', 3: 'من صور الضلال', 4: 'كرامة الإنسان في الشريعة الإسلامية', 5: 'الزواج: مشروعيته ومقدماته', 6: 'الجهاد في الإسلام' }],
    [2, 'وحده ثانيه.txt', 'الوحدة الثانية: خدم القرآن الكريم',
      { 1: 'جهود علماء المسلمين في خدمة القرآن الكريم', 2: 'العزيمة والرخصة', 3: 'معركة مؤتة', 4: 'المحرمات من النساء', 5: 'التعايش الإنساني', 6: 'الحقوق الاجتماعية للمرأة في الإسلام' }]
  ]) {
    console.log(`  Processing Islamic U${unitNum}: ${fileName}`);
    const chunks = readAndParse(path.join(SRC, 'دين 2010', fileName));
    const lessons = [];
    let reviewQs = null;
    let lessonIdx = 0;
    for (const chunk of chunks) {
      if (chunk.lesson_title) {
        lessonIdx++;
        const qs = chunk.questions.map((q, i) => makeQuestion(q, unitNum, lessonIdx, i));
        const fname = writeLessonFile(subjDir, unitNum, lessonIdx, lessonNames[lessonIdx] || chunk.lesson_title, unitName, qs);
        lessons.push({ number: lessonIdx, file: fname });
        console.log(`    Lesson ${lessonIdx}: ${qs.length} Qs - "${lessonNames[lessonIdx] || chunk.lesson_title}"`);
      } else if (chunk.unit_title) {
        reviewQs = chunk.questions.map((q, i) => makeQuestion(q, unitNum, 99, i));
        console.log(`    Review: ${reviewQs.length} Qs`);
      }
    }
    if (reviewQs) {
      writeReviewFile(subjDir, unitNum, unitName, reviewQs);
      lessons.push({ number: 'review', file: 'review.json' });
    }
    indexUnits.push({ number: unitNum, name: unitName, lessons });
  }

  // --- Units 3 & 4: Arrays with {unit, lesson, question, options, answer} ---
  for (const [unitNum, fileName, unitName, lessonNames, noLessonIsL1] of [
    [3, 'وحده ثالثه.txt', 'الوحدة الثالثة: علاقة المسلم بكتاب الله وسنة نبيه',
      { 1: 'الآيات 169-171 من سورة آل عمران', 2: 'الحديث الشريف (إن الله يرضى لكم ثلاثاً)', 3: 'فتح مكة (8هـ)', 4: 'الإيجابية في الشريعة الإسلامية', 5: 'أحكام عقد الزواج', 6: 'الحقوق المالية للمرأة في الإسلام' },
      true],  // noLessonIsL1 flag
    [4, 'وحده رابعه.txt', 'الوحدة الرابعة: الزواج والحياة الزوجية',
      { 1: 'الآيات من سورة الروم', 2: 'السنة النبوية الشريفة', 3: 'العُرف في الشريعة الإسلامية', 4: 'الحقوق الزوجية في الإسلام', 5: 'الوحدة الوطنية في الإسلام', 6: 'الأمن الغذائي في الإسلام', 7: 'الوحدة الوطنية والتعايش' },
      false]
  ]) {
    console.log(`  Processing Islamic U${unitNum}: ${fileName}`);
    const chunks = readAndParse(path.join(SRC, 'دين 2010', fileName));
    const byLesson = {};
    let reviewQs = [];
    let l1Questions = [];
    for (const chunk of chunks) {
      if (!Array.isArray(chunk)) continue;
      const first = chunk[0];
      if (!first) continue;
      if (first.lesson) {
        const lNum = first.lesson;
        if (!byLesson[lNum]) byLesson[lNum] = [];
        byLesson[lNum].push(...chunk);
      } else if (first.unit === unitNum && !first.lesson) {
        reviewQs = chunk;
      } else if (noLessonIsL1 && !first.lesson && !first.unit) {
        l1Questions = chunk;
      }
    }
    if (l1Questions.length > 0) {
      byLesson[1] = l1Questions;
    }
    const lessons = [];
    for (const [lNum, qs] of Object.entries(byLesson).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const lessonQs = qs.map((q, i) => makeQuestion(q, unitNum, Number(lNum), i));
      const fname = writeLessonFile(subjDir, unitNum, Number(lNum), lessonNames[lNum] || `الدرس ${lNum}`, unitName, lessonQs);
      lessons.push({ number: Number(lNum), file: fname });
      console.log(`    Lesson ${lNum}: ${lessonQs.length} Qs`);
    }
    if (reviewQs.length > 0) {
      const rvQs = reviewQs.map((q, i) => makeQuestion(q, unitNum, 99, i));
      writeReviewFile(subjDir, unitNum, unitName, rvQs);
      lessons.push({ number: 'review', file: 'review.json' });
      console.log(`    Review: ${rvQs.length} Qs`);
    }
    indexUnits.push({ number: unitNum, name: unitName, lessons });
  }

  const index = {
    subject: 'islamic',
    name: 'التربية الإسلامية',
    generation: '2010',
    semester: 'semester-1',
    units: indexUnits.map(u => ({
      number: u.number,
      name: u.name,
      lessons: u.lessons.map(l => ({
        number: l.number,
        name: l.file,
        file: l.file
      }))
    }))
  };
  fs.writeFileSync(path.join(subjDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
}

// ============ MATH 2010 ============
function convertMath() {
  const subjDir = path.join(DST, 'math');
  fs.rmSync(subjDir, { recursive: true, force: true });
  ensureDir(subjDir);
  const indexUnits = [];
  const mathDir = path.join(SRC, 'رياضيات 2010');

  const allLessonNames = {
    1: { 1: 'الاقتران المتشعب', 2: 'متباينات القيمة المطلقة', 3: 'الدوال متعددة الحدود', 4: 'التحليل والكسور الجبرية' },
    2: { 1: 'الزاوية في الوضع القياسي', 2: 'الدوال المثلثية للزاوية الحادة', 3: 'الدوال المثلثية بشكل عام' },
    3: { 1: 'النهايات', 2: 'المشتقة الأولى', 3: 'تطبيقات المشتقة الأولى', 4: 'المشتقة الثانية', 5: 'تطبيقات المشتقة الثانية', 6: 'المسائل الحدية' }
  };

  // --- Unit 1: Single array with ID field ---
  {
    console.log('  Processing Math U1');
    const chunks = readAndParse(path.join(mathDir, 'رياضيات وحده اولى 2010 معتمده.txt'));
    const allQ = chunks.flat().filter(q => q && q.ID);
    const byLesson = {};
    const reviewQs = [];
    for (const q of allQ) {
      const m = q.ID.match(/U01-L(\d+)-Q/);
      if (m) {
        const l = Number(m[1]);
        if (!byLesson[l]) byLesson[l] = [];
        byLesson[l].push(q);
      } else if (q.ID.includes('REV')) {
        reviewQs.push(q);
      }
    }
    const lessons = [];
    for (const [lNum, qs] of Object.entries(byLesson).sort((a, b) => a[0] - b[0])) {
      const lessonQs = qs.map((q, i) => makeQuestion(q, 1, Number(lNum), i, { reference: q['القانون_أو_القاعدة'] || '' }));
      const fname = writeLessonFile(subjDir, 1, Number(lNum), allLessonNames[1][Number(lNum)] || `الدرس ${lNum}`, 'الوحدة الأولى', lessonQs);
      lessons.push({ number: Number(lNum), file: fname });
      console.log(`    Lesson ${lNum}: ${lessonQs.length} Qs`);
    }
    if (reviewQs.length > 0) {
      const rvQs = reviewQs.map((q, i) => makeQuestion(q, 1, 99, i));
      writeReviewFile(subjDir, 1, 'الوحدة الأولى', rvQs);
      lessons.push({ number: 'review', file: 'review.json' });
      console.log(`    Review: ${rvQs.length} Qs`);
    }
    indexUnits.push({ number: 1, name: 'الوحدة الأولى', lessons });
  }

  // --- Unit 2: Multiple arrays, filter out non-math (Arabic grammar) questions ---
  {
    console.log('  Processing Math U2');
    const chunks = readAndParse(path.join(mathDir, 'رياضيات وحده ثانيه 2010.txt'));
    const allQ = chunks.flat().filter(q => q && q.ID);
    const byLesson = {};
    const reviewQs = [];
    for (const q of allQ) {
      const m = q.ID.match(/U02-L(\d+)-Q/);
      if (m) {
        const l = Number(m[1]);
        if (!byLesson[l]) byLesson[l] = [];
        byLesson[l].push(q);
      } else if (q.ID.includes('REV')) {
        reviewQs.push(q);
      }
    }
    const lessons = [];
    for (const [lNum, qs] of Object.entries(byLesson).sort((a, b) => a[0] - b[0])) {
      const lessonQs = qs.map((q, i) => makeQuestion(q, 2, Number(lNum), i, { reference: q['القانون_أو_القاعدة'] || '' }));
      const fname = writeLessonFile(subjDir, 2, Number(lNum), allLessonNames[2][Number(lNum)] || `الدرس ${lNum}`, 'الوحدة الثانية', lessonQs);
      lessons.push({ number: Number(lNum), file: fname });
      console.log(`    Lesson ${lNum}: ${lessonQs.length} Qs`);
    }
    if (reviewQs.length > 0) {
      const rvQs = reviewQs.map((q, i) => makeQuestion(q, 2, 99, i));
      writeReviewFile(subjDir, 2, 'الوحدة الثانية', rvQs);
      lessons.push({ number: 'review', file: 'review.json' });
      console.log(`    Review: ${rvQs.length} Qs`);
    }
    indexUnits.push({ number: 2, name: 'الوحدة الثانية', lessons });
  }

  // --- Unit 3: Multiple arrays ---
  {
    console.log('  Processing Math U3');
    const chunks = readAndParse(path.join(mathDir, 'وحده ثالثه.txt'));
    const allQ = chunks.flat().filter(q => q && q.ID);
    const byLesson = {};
    const reviewQs = [];
    for (const q of allQ) {
      const m = q.ID.match(/U03-L(\d+)-Q/);
      if (m) {
        const l = Number(m[1]);
        if (!byLesson[l]) byLesson[l] = [];
        byLesson[l].push(q);
      } else if (q.ID.includes('REV')) {
        reviewQs.push(q);
      }
    }
    const lessons = [];
    for (const [lNum, qs] of Object.entries(byLesson).sort((a, b) => a[0] - b[0])) {
      const lessonQs = qs.map((q, i) => makeQuestion(q, 3, Number(lNum), i, { reference: q['القانون_أو_القاعدة'] || '' }));
      const fname = writeLessonFile(subjDir, 3, Number(lNum), allLessonNames[3][Number(lNum)] || `الدرس ${lNum}`, 'الوحدة الثالثة', lessonQs);
      lessons.push({ number: Number(lNum), file: fname });
      console.log(`    Lesson ${lNum}: ${lessonQs.length} Qs`);
    }
    if (reviewQs.length > 0) {
      const rvQs = reviewQs.map((q, i) => makeQuestion(q, 3, 99, i));
      writeReviewFile(subjDir, 3, 'الوحدة الثالثة', rvQs);
      lessons.push({ number: 'review', file: 'review.json' });
      console.log(`    Review: ${rvQs.length} Qs`);
    }
    indexUnits.push({ number: 3, name: 'الوحدة الثالثة', lessons });
  }

  const index = {
    subject: 'math',
    name: 'الرياضيات',
    generation: '2010',
    semester: 'semester-1',
    units: indexUnits.map(u => ({
      number: u.number,
      name: u.name,
      lessons: u.lessons.map(l => ({
        number: l.number,
        name: l.file,
        file: l.file
      }))
    }))
  };
  fs.writeFileSync(path.join(subjDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
}

// ============ ARABIC 2010 ============
function convertArabic() {
  const subjDir = path.join(DST, 'arabic');
  fs.rmSync(subjDir, { recursive: true, force: true });
  ensureDir(subjDir);
  const indexUnits = [];
  const arabDir = path.join(SRC, 'عربي 2010');

  const unitConfigs = [
    { num: 1, file: 'عربي وحده اولى 2010.txt', name: 'الوحدة الأولى',
      lessons: { 1: 'النصوص القرآنية (سورة النساء والحجرات والأنعام)' } },
    { num: 2, file: '‏‏عربي ثانيه اولى 2010.txt', name: 'الوحدة الثانية',
      lessons: { 1: 'نصوص (قصائد عربية)', 2: 'قواعد (صور الفاعل) وبلاغة (التشبيه التمثيلي)' } },
    { num: 3, file: 'وحده ثالثه.txt', name: 'الوحدة الثالثة',
      lessons: { 1: 'نصوص (مرض آلزهايمر)', 2: 'قواعد (المبتدأ والخبر والجمل)' } },
    { num: 4, file: 'وحده رابعه.txt', name: 'الوحدة الرابعة',
      lessons: { 1: 'نصوص (الإعلام)', 2: 'قواعد (المفعول معه وأسلوب الأمر)' } },
    { num: 5, file: 'وحده خامسه.txt', name: 'الوحدة الخامسة',
      lessons: { 1: 'نصوص (العمل والمهنة)', 2: 'قواعد (أنواع ما) وبلاغة (الاستفهام)' } }
  ];

  for (const cfg of unitConfigs) {
    console.log(`  Processing Arabic U${cfg.num}: ${cfg.file}`);
    const chunks = readAndParse(path.join(arabDir, cfg.file));
    const arrays = chunks.filter(c => Array.isArray(c));

    // Determine lesson split:
    // Pattern: first array = L1 (40Q), second array = L2 (40Q if exists), last array = review (50Q)
    let lessonIdx = 0;
    const lessons = [];

    for (let ai = 0; ai < arrays.length; ai++) {
      const arr = arrays[ai];
      const isLast = ai === arrays.length - 1;

      // Last array with 50Q is always review
      if (isLast && arr.length >= 50) {
        const rvQs = arr.map((q, i) => makeQuestion(q, cfg.num, 99, i));
        writeReviewFile(subjDir, cfg.num, cfg.name, rvQs);
        lessons.push({ number: 'review', file: 'review.json' });
        console.log(`    Review: ${rvQs.length} Qs`);
        continue;
      }

      lessonIdx++;
      const lessonName = cfg.lessons[lessonIdx] || `الدرس ${lessonIdx}`;
      const lessonQs = arr.map((q, i) => makeQuestion(q, cfg.num, lessonIdx, i));
      const fname = writeLessonFile(subjDir, cfg.num, lessonIdx, lessonName, cfg.name, lessonQs);
      lessons.push({ number: lessonIdx, file: fname });
      console.log(`    Lesson ${lessonIdx}: ${lessonQs.length} Qs - "${lessonName}"`);
    }

    indexUnits.push({ number: cfg.num, name: cfg.name, lessons });
  }

  const index = {
    subject: 'arabic',
    name: 'اللغة العربية',
    generation: '2010',
    semester: 'semester-1',
    units: indexUnits.map(u => ({
      number: u.number,
      name: u.name,
      lessons: u.lessons.map(l => ({
        number: l.number,
        name: l.file,
        file: l.file
      }))
    }))
  };
  fs.writeFileSync(path.join(subjDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
}

// ============ RUN ============
ensureDir(DST);
console.log('=== Converting Islamic 2010 ===');
convertIslamic();
console.log('\n=== Converting Math 2010 ===');
convertMath();
console.log('\n=== Converting Arabic 2010 ===');
convertArabic();

// Summary
console.log('\n=== Summary ===');
let totalQ = 0;
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory()) walk(path.join(dir, f.name));
    else if (f.name.endsWith('.json') && f.name !== 'index.json') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f.name), 'utf8'));
        const q = data.lesson ? data.lesson.questions.length : 0;
        totalQ += q;
      } catch (e) {}
    }
  }
};
walk(DST);
console.log(`Total questions generated: ${totalQ}`);
console.log('Done!');
