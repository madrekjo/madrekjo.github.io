/*
  اختبار عزل وحدات الرياضيات بين الأجيال:
  - وحدات رياضيات جيل 2009 تظهر فقط لجيل 2009.
  - لا تظهر لجيل 2010 ولا عند غياب معلَم الجيل.
  - المواد الأخرى لا تتأثر.
  - المراجعة الختامية معزولة بالجيل.
  - النظام جاهز لمحتوى رياضيات مستقل لجيل 2010 مستقبلاً دون تعارض.
*/
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Mini static server with an in-memory overlay (to simulate future 2010 content)
// ---------------------------------------------------------------------------
function createServer(overlay) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      try {
        let url = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
        if (url === '/') url = '/index.html';
        if (overlay && overlay.has(url)) {
          const o = overlay.get(url);
          res.writeHead(200, { 'Content-Type': o.type || 'application/json', 'Cache-Control': 'no-store' });
          res.end(o.body);
          return;
        }
        const fp = path.resolve(path.join(ROOT, '.' + url));
        if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('403'); return; }
        if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
        const stat = fs.statSync(fp);
        let f = fp;
        if (stat.isDirectory()) {
          f = path.join(fp, 'index.html');
          if (!fs.existsSync(f)) { res.writeHead(404); res.end('404'); return; }
        }
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(f));
      } catch (e) {
        res.writeHead(500); res.end('500 ' + e.message);
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

// ---------------------------------------------------------------------------
// DOM + browser shims so exam.html's inline script can run under Node
// ---------------------------------------------------------------------------
function makeEl(id) {
  return {
    id: id,
    innerHTML: '',
    textContent: '',
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    appendChild() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    scrollIntoView() {}
  };
}

const elements = {};
const documentStub = {
  getElementById(id) {
    if (!elements[id]) elements[id] = makeEl(id);
    return elements[id];
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  createElement() { return makeEl('created'); },
  body: makeEl('body'),
  addEventListener() {},
  documentElement: { style: {} }
};

function makeLocalStorage() {
  const store = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; }
  };
}

function extractInlineScripts(html) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    if (!m[2].trim()) continue;
    scripts.push(m[2]);
  }
  return scripts.join('\n;\n');
}

function runExamPage(query, opts) {
  const search = query ? '?' + query : '';
  const ctx = {
    window: { location: { search }, MathJax: { typesetPromise: () => Promise.resolve() } },
    document: documentStub,
    localStorage: makeLocalStorage(),
    URLSearchParams,
    URL,
    fetch: global.fetch,
    setTimeout,
    clearTimeout,
    console,
    Promise,
    JSON,
    Math,
    confirm: () => true
  };
  vm.createContext(ctx);
  const html = fs.readFileSync(path.join(ROOT, 'exam.html'), 'utf8');
  const src = extractInlineScripts(html);
  vm.runInContext(src, ctx, { filename: 'exam.html' });

  if (opts && opts.preRun) opts.preRun(ctx);

  const examContent = elements.examContent;
  if (query.indexOf('review=') === -1) {
    // initData is async (fetch) — poll until content renders or timeout.
    return pollContent(examContent).then(() => ({
      content: examContent.innerHTML,
      subject: elements.examSubject ? elements.examSubject.textContent : '',
      semester: elements.examSemester ? elements.examSemester.textContent : '',
      ctx: ctx
    }));
  }
  // Review branch runs synchronously.
  return Promise.resolve({
    content: examContent.innerHTML,
    subject: elements.examSubject ? elements.examSubject.textContent : '',
    semester: elements.examSemester ? elements.examSemester.textContent : '',
    ctx: ctx
  });
}

function pollContent(examContent) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function tick() {
      if (examContent.innerHTML) return resolve();
      if (Date.now() - started > 8000) return reject(new Error('timeout: examContent never rendered'));
      setTimeout(tick, 50);
    })();
  });
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, name, detail) {
  if (cond) { passed++; console.log('  \u2713 ' + name); }
  else { failed++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  \u2717 ' + name + (detail ? ' :: ' + detail : '')); }
}

async function main() {
  const overlay = new Map();
  const srvInfo = await createServer(overlay);
  const base = 'http://127.0.0.1:' + srvInfo.port + '/';
  const origFetch = global.fetch;
  global.fetch = (u, o) => origFetch(new URL(u, base), o);

  try {
    console.log('\n=== 1) ملكية بيانات الرياضيات ===');

    const idxData = JSON.parse(fs.readFileSync(path.join(ROOT, 'questions', 'index.json'), 'utf8'));
    const mathRec = (idxData.subjects || []).find(s => s.name === 'الرياضيات');
    ok(!!mathRec, 'الرياضيات موجودة في questions/index.json');
    ok(Array.isArray(mathRec.generations) && mathRec.generations.includes('2009'), 'الرياضيات مرفوعة صراحةً لجيل 2009');
    ok(!mathRec.generations.includes('2010'), 'الرياضيات غير مرفوعة لجيل 2010');

    const semIdx = JSON.parse(fs.readFileSync(path.join(ROOT, 'questions', 'math', 'semester-1', 'index.json'), 'utf8'));
    ok(semIdx.generation === '2009', 'فهرس الفصل الأول ملك لجيل 2009 (generation: "2009")');
    ok(Array.isArray(semIdx.units) && semIdx.units.length > 0, 'فهرس الفصل الأول ما زال يحوي الوحدات (لم تُحذف)');
    for (const u of semIdx.units) {
      for (const l of (u.lessons || [])) {
        const f = path.join(ROOT, 'questions', 'math', 'semester-1', l.file);
        ok(fs.existsSync(f), 'ملف درس موجود ولم يتغير مساره: ' + l.file);
      }
      if (u.review) {
        const f = path.join(ROOT, 'questions', 'math', 'semester-1', u.review.file);
        ok(fs.existsSync(f), 'ملف مراجعة موجود ولم يتغير مساره: ' + u.review.file);
      }
    }

    console.log('\n=== 2) جيل 2009 -> رياضيات -> وحدات الفصل الأول تظهر ===');

    let r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف1') + '&generation=2009');
    ok(r.content.indexOf('unit-card') !== -1, 'جيل 2009 يشاهد وحدات الرياضيات (unit-card)');
    ok(r.content.indexOf('الاقترانات والمقادير الجبرية') !== -1, 'وحدة U01 ظاهرة');
    ok(r.content.indexOf('التفاضل وتطبيقاته') !== -1, 'وحدة U3 ظاهرة');
    ok(r.content.indexOf('الأعداد المركبة') !== -1, 'وحدة U4 ظاهرة');
    ok(r.content.indexOf('لا توجد أسئلة لجيلك لهذه المادة بعد') === -1, 'لا رسالة "لا توجد أسئلة لجيلك"');
    ok(r.subject.indexOf('الرياضيات') !== -1, 'العنوان يعرض الرياضيات');

    // Drill into a lesson to confirm baseDir path resolution loads questions.
    r.ctx.openUnit(0);
    r.ctx.startLesson(0);
    await pollContent(elements.examContent);
    const drill = elements.examContent.innerHTML;
    ok(drill.indexOf('question-card') !== -1, 'درس من جيل 2009 يُحمَّل ويشاهد الأسئلة (baseDir صحيح)');

    console.log('\n=== 3) جيل 2010 -> رياضيات -> لا شيء (محتوى مستقل لاحقاً) ===');

    r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف1') + '&generation=2010');
    ok(r.content.indexOf('لا توجد أسئلة لجيلك لهذه المادة بعد') !== -1, 'جيل 2010 يرى رسالة "لا توجد أسئلة لجيلك"');
    ok(r.content.indexOf('unit-card') === -1, 'جيل 2010 لا يشاهد وحدات جيل 2009 نهائياً');
    ok(r.content.indexOf('الاقترانات والمقادير الجبرية') === -1, 'لا تظهر أي وحدة من وحدات 2009');

    console.log('\n=== 4) رابط بلا جيل -> لا يظهر محتوى ملكاً لجيل محدد ===');

    r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف1'));
    ok(r.content.indexOf('unit-card') === -1, 'الرابط بلا جيل لا يعرض وحدات 2009');
    ok(r.content.indexOf('لا توجد أسئلة لجيلك لهذه المادة بعد') !== -1, 'الرابط بلا جيل يطلب تحديد الجيل');

    console.log('\n=== 5) المواد الأخرى غير متأثرة ===');

    r = await runExamPage('subject=' + encodeURIComponent('الدين') + '&semester=' + encodeURIComponent('ف1') + '&generation=2009');
    ok(r.content.indexOf('question-card') !== -1, 'مادة "الدين" (بدون ملفات أسئلة) تعمل كالمعتاد لجيل 2009');

    r = await runExamPage('subject=' + encodeURIComponent('الدين') + '&semester=' + encodeURIComponent('ف1') + '&generation=2010');
    ok(r.content.indexOf('question-card') !== -1, 'مادة "الدين" (بدون ملفات أسئلة) تعمل كالمعتاد لجيل 2010');
    ok(r.content.indexOf('لا توجد أسئلة لجيلك لهذه المادة بعد') === -1, 'لا رسالة جيل خاطئة للمواد غير المعزولة');

    console.log('\n=== 6) المراجعة الختامية معزولة بالجيل ===');

    function reviewQuery(gen) {
      return 'review=true' + (gen ? '&generation=' + gen : '');
    }
    const wrongRecords = [
      { subject: 'الرياضيات', semester: 'ف1', generation: '2009', qObj: { q: 'سؤال جيل 2009', options: ['أ', 'ب', 'ج', 'د'], answer: 0 }, answer: 0 },
      { subject: 'الرياضيات', semester: 'ف1', generation: '2010', qObj: { q: 'سؤال جيل 2010', options: ['أ', 'ب', 'ج', 'د'], answer: 0 }, answer: 0 },
      { subject: 'الدين', semester: 'ف1', qObj: { q: 'سؤال قديم مشترك', options: ['أ', 'ب', 'ج', 'د'], answer: 0 }, answer: 0 }
    ];

    r = await runExamPage(reviewQuery('2009'), { preRun: () => localStorage.setItem('madrekjo_wrong_questions', JSON.stringify(wrongRecords)) });
    ok(r.content.indexOf('سؤال جيل 2009') !== -1, 'مراجعة 2009 تعرض أسئلة 2009 الخطأ');
    ok(r.content.indexOf('سؤال جيل 2010') === -1, 'مراجعة 2009 لا تعرض أسئلة 2010');
    ok(r.content.indexOf('سؤال قديم مشترك') !== -1, 'مراجعة 2009 تعرض السجلات القديمة المشتركة');

    r = await runExamPage(reviewQuery('2010'), { preRun: () => localStorage.setItem('madrekjo_wrong_questions', JSON.stringify(wrongRecords)) });
    ok(r.content.indexOf('سؤال جيل 2010') !== -1, 'مراجعة 2010 تعرض أسئلة 2010 الخطأ');
    ok(r.content.indexOf('سؤال جيل 2009') === -1, 'مراجعة 2010 لا تعرض أسئلة 2009 نهائياً');
    ok(r.content.indexOf('سؤال قديم مشترك') !== -1, 'مراجعة 2010 تعرض السجلات القديمة المشتركة');

    r = await runExamPage(reviewQuery('2010'), { preRun: () => localStorage.setItem('madrekjo_wrong_questions', JSON.stringify(wrongRecords.slice(0, 1))) });
    ok(r.content.indexOf('لا توجد أسئلة خاطئة للمراجعة') !== -1, 'مراجعة 2010 فارغة عندما لا توجد أسئلة خاصة بها');

    console.log('\n=== 7) إضافة محتوى مستقل لجيل 2010 لاحقاً دون تعارض ===');

    overlay.set('/questions/math/2010/semester-1/index.json', {
      type: 'application/json',
      body: JSON.stringify({
        subject: 'الرياضيات',
        generation: '2010',
        semester: 1,
        semester_label: 'ف1',
        units: [
          { id: 'Z01', number: 1, name: 'وحدة رياضيات جيل 2010 الجديدة',
            lessons: [ { id: 'L01', number: 1, name: 'درس جيل 2010', file: 'unit-01/lesson-01.json' } ],
            review: null }
        ]
      })
    });
    overlay.set('/questions/math/2010/semester-1/unit-01/lesson-01.json', {
      type: 'application/json',
      body: JSON.stringify({
        lesson: { lesson_number: '1.1', lesson_name: 'درس جيل 2010', unit_number: 1, unit_name: 'وحدة رياضيات جيل 2010 الجديدة',
          questions: [
            { id: 'Z01-L01-Q001', number: 1, question: 'سؤال خاص بجيل 2010', difficulty: 'easy',
              options: { A: 'أ', B: 'ب', C: 'ج', D: 'د' },
              correct_answer: 'A', correct_answer_text: 'أ' }
          ] }
      })
    });

    r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف1') + '&generation=2010');
    ok(r.content.indexOf('وحدة رياضيات جيل 2010 الجديدة') !== -1, 'جيل 2010 يشاهد وحداته المستقلة الجديدة');
    ok(r.content.indexOf('الاقترانات والمقادير الجبرية') === -1, 'جيل 2010 لا يتأثر بوحدات 2009 رغم وجود محتوى جديد له');
    r.ctx.openUnit(0);
    r.ctx.startLesson(0);
    await pollContent(elements.examContent);
    const drill2010 = elements.examContent.innerHTML;
    ok(drill2010.indexOf('سؤال خاص بجيل 2010') !== -1, 'درس جيل 2010 يُحمَّل من مجلده المستقل (baseDir صحيح)');

    r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف1') + '&generation=2009');
    ok(r.content.indexOf('الاقترانات والمقادير الجبرية') !== -1, 'جيل 2009 ما زال يشاهد وحداته الأصلية دون أي تعارض');

    console.log('\n=== 8) روابط الصفحات تمرر الجيل ===');

    const fieldPages = ['engineering.html', 'health.html', 'business.html', 'languages.html'];
    for (const page of fieldPages) {
      const html = fs.readFileSync(path.join(ROOT, '2009', page), 'utf8');
      const links = [];
      const re = /url:\s*'\.\.\/exam\.html\?([^']+)'/g;
      let m;
      while ((m = re.exec(html)) !== null) links.push(m[1]);
      const genLinks = links.filter(l => /generation=2009/.test(decodeURIComponent(l)));
      const missing = links.filter(l => !/generation=2009/.test(decodeURIComponent(l)));
      ok(links.length > 0, page + ': فيه روابط exam.html (' + links.length + ')');
      ok(genLinks.length === links.length, page + ': كل روابط الامتحان تمرر generation=2009' +
        (missing.length ? ' :: ناقصة: ' + missing.join(' | ') : ''));
    }

    const h2010 = fs.readFileSync(path.join(ROOT, '2010', 'index.html'), 'utf8');
    const links2010 = [];
    let m2010;
    const re2010 = /url:\s*'\.\.\/exam\.html\?([^']+)'/g;
    while ((m2010 = re2010.exec(h2010)) !== null) links2010.push(m2010[1]);
    const missing2010 = links2010.filter(l => !/generation=2010/.test(decodeURIComponent(l)));
    ok(links2010.length > 0, '2010/index.html: فيه روابط exam.html (' + links2010.length + ')');
    ok(missing2010.length === 0, '2010/index.html: كل روابط الامتحان تمرر generation=2010' +
      (missing2010.length ? ' :: ناقصة: ' + missing2010.join(' | ') : ''));
    const popupSrcOk = /iframe\.src\s*=\s*'\.\.\/exam\.html\?review=true&generation=2010'/.test(h2010);
    ok(popupSrcOk, 'نافذة المراجعة في 2010 تمرر generation=2010');

    console.log('\n========================================');
    console.log('  النتيجة: ' + passed + ' ناجح / ' + failed + ' فاشل');
    console.log('========================================\n');
    if (failed > 0) {
      console.log('فشل:\n' + failures.map(f => '  - ' + f).join('\n'));
      process.exitCode = 1;
    }
  } finally {
    srvInfo.srv.close();
  }
}

main().catch(e => {
  console.error('خطأ في الاختبار:', e);
  process.exitCode = 1;
});
