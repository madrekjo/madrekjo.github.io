/*
  اختبار العزل الكامل لبنك أسئلة الرياضيات بين جيل 2009 وجيل 2010.

  البنية:
    questions/{generation}/{semester}/{subject_id}/...
        ↓ generation → semester → subject → unit → lesson → question

  - محتوى 2009 موجود في مسار جيله فقط ولا يظهر أبداً لجيل 2010.
  - لا يوجد مجلد "مشترك" ولا أي fallback تلقائي بين الجيلين.
  - إضافة محتوى لأحد الجيلين لا يؤثر على الجيل الآخر إطلاقاً.
*/
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

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
  getElementById(id) { if (!elements[id]) elements[id] = makeEl(id); return elements[id]; },
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
  // Fresh DOM per scenario so no stale content leaks between runs.
  for (const k of Object.keys(elements)) delete elements[k];

  const localStorage = makeLocalStorage();
  if (opts && opts.preRun) opts.preRun(localStorage);

  const search = query ? '?' + query : '';
  const ctx = {
    window: { location: { search }, MathJax: { typesetPromise: () => Promise.resolve() } },
    MathJax: { typesetPromise: () => Promise.resolve() },
    document: documentStub,
    localStorage: localStorage,
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

  if (query.indexOf('review=') === -1) {
    // initData is async (fetch) — poll until content renders or timeout.
    return pollContent().then(() => ({
      content: elements.examContent ? elements.examContent.innerHTML : '',
      subject: elements.examSubject ? elements.examSubject.textContent : '',
      semester: elements.examSemester ? elements.examSemester.textContent : '',
      ctx: ctx
    }));
  }
  // Review branch runs synchronously.
  return Promise.resolve({
    content: elements.examContent ? elements.examContent.innerHTML : '',
    subject: elements.examSubject ? elements.examSubject.textContent : '',
    semester: elements.examSemester ? elements.examSemester.textContent : '',
    ctx: ctx
  });
}

function pollContent() {
  return waitForContentContains('', 8000).catch(() => Promise.reject(new Error('timeout: examContent never rendered')));
}

function waitForContentContains(substring, timeout) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function tick() {
      const el = elements.examContent;
      const c = el ? el.innerHTML : '';
      if (!substring) {
        if (c) return resolve();
      } else if (c.indexOf(substring) !== -1) {
        return resolve();
      }
      if (Date.now() - started > (timeout || 5000)) {
        return reject(new Error('timeout waiting for "' + substring + '" — got: ' + c.slice(0, 120)));
      }
      setTimeout(tick, 50);
    })();
  });
}

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, name, detail) {
  if (cond) { passed++; console.log('  \u2713 ' + name); }
  else { failed++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  \u2717 ' + name + (detail ? ' :: ' + detail : '')); }
}

function scanJsonValid(dir) {
  let bad = 0, total = 0;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) {
        total++;
        try { JSON.parse(fs.readFileSync(p, 'utf8')); }
        catch (err) { bad++; console.log('    BROKEN JSON:', p, '::', err.message); }
      }
    }
  })(dir);
  return { bad, total };
}

async function main() {
  const overlay = new Map();
  const srvInfo = await createServer(overlay);
  const base = 'http://127.0.0.1:' + srvInfo.port + '/';
  const origFetch = global.fetch;
  global.fetch = (u, o) => origFetch(new URL(u, base), o);

  try {
    console.log('\n=== 1) بنية البيانات: جيل -> فصل -> مادة -> وحدة -> درس -> سؤال ===');

    const idxData = JSON.parse(fs.readFileSync(path.join(ROOT, 'questions', 'index.json'), 'utf8'));
    ok(Array.isArray(idxData.generations) && idxData.generations.includes('2009') && idxData.generations.includes('2010'),
      'questions/index.json يعرّف الجيلين 2009 و 2010');
    const mathRec = (idxData.subjects || []).find(s => s.subject_id === 'math');
    ok(!!mathRec, 'الرياضيات معرفة بـ subject_id = "math" في الفهرس الرئيسي');

    const mathIdxPath = path.join(ROOT, 'questions', '2009', 'semester-1', 'math', 'index.json');
    ok(fs.existsSync(mathIdxPath), 'يوجد questions/2009/semester-1/math/index.json');
    const mathIdx = JSON.parse(fs.readFileSync(mathIdxPath, 'utf8'));
    ok(mathIdx.generation === '2009' && mathIdx.generation_id === '2009', 'فهرس الرياضيات يصرّح بجيله: generation_id = "2009"');
    ok(mathIdx.subject_id === 'math', 'فهرس الرياضيات يصرّح بمادته: subject_id = "math"');
    ok(Array.isArray(mathIdx.units) && mathIdx.units.length > 0, 'وحدات 2009 موجودة (لم تُحذف): ' + mathIdx.units.length + ' وحدات');
    for (const u of mathIdx.units) {
      for (const l of (u.lessons || [])) {
        ok(fs.existsSync(path.join(ROOT, 'questions', '2009', 'semester-1', 'math', l.file)),
          'ملف درس 2009 موجود: ' + l.file);
      }
      if (u.review) {
        ok(fs.existsSync(path.join(ROOT, 'questions', '2009', 'semester-1', 'math', u.review.file)),
          'ملف مراجعة 2009 موجود: ' + u.review.file);
      }
    }
    ok(!fs.existsSync(path.join(ROOT, 'questions', '2010')), 'لا يوجد مجلد questions/2010 إطلاقاً (لا محتوى مرفوع لـ2010 بعد)');
    ok(!fs.existsSync(path.join(ROOT, 'questions', 'math')), 'لا يوجد مجلد "مشترك" questions/math — البنية معزولة بالجيل فقط');

    const scan = scanJsonValid(path.join(ROOT, 'questions'));
    ok(scan.bad === 0, 'كل ملفات JSON سليمة (' + scan.total + ' ملفاً)');

    console.log('\n=== 2) جيل 2009 -> ف1 -> رياضيات -> الوحدات تظهر ===');

    let r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف1') + '&generation=2009');
    ok(r.content.indexOf('unit-card') !== -1, '2009 يشاهد وحدات الرياضيات (unit-card)');
    ok(r.content.indexOf('الاقترانات والمقادير الجبرية') !== -1, 'وحدة U01 ظاهرة');
    ok(r.content.indexOf('التفاضل وتطبيقاته') !== -1, 'وحدة U3 ظاهرة');
    ok(r.content.indexOf('الأعداد المركبة') !== -1, 'وحدة U4 ظاهرة');
    ok(r.content.indexOf('لم تتم إضافة محتوى') === -1, 'لا تظهر رسالة "لم تتم إضافة محتوى"');
    ok(r.subject.indexOf('الرياضيات') !== -1, 'العنوان يعرض الرياضيات');

    r.ctx.openUnit(0);
    r.ctx.startLesson(0);
    await waitForContentContains('question-card');
    ok(elements.examContent.innerHTML.indexOf('question-card') !== -1, 'درس 2009 يُحمَّل من مسار جيله (baseDir = questions/2009/semester-1/math)');

    console.log('\n=== 3) جيل 2010 -> ف1 -> رياضيات -> لا محتوى 2009 إطلاقاً ===');

    r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف1') + '&generation=2010');
    ok(r.content.indexOf('لم تتم إضافة محتوى الرياضيات لهذا الجيل بعد') !== -1, '2010 يرى رسالة "لم تتم إضافة محتوى الرياضيات لهذا الجيل بعد"');
    ok(r.content.indexOf('unit-card') === -1, '2010 لا يشاهد أي وحدات');
    ok(r.content.indexOf('الاقترانات والمقادير الجبرية') === -1, 'لا تظهر أي وحدة من وحدات 2009');
    ok(r.content.indexOf('التفاضل وتطبيقاته') === -1, 'لا يظهر أي محتوى 2009 آخر');

    console.log('\n=== 4) رابط بلا جيل -> لا يُعرض أي محتوى ملكاً لجيل محدد ===');

    r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف1'));
    ok(r.content.indexOf('unit-card') === -1, 'الرابط بلا جيل لا يعرض وحدات 2009');
    ok(r.content.indexOf('لم تتم إضافة محتوى الرياضيات لهذا الجيل بعد') !== -1, 'الرابط بلا جيل يطلب تحديد الجيل أولاً');

    console.log('\n=== 5) المواد غير المعتمدة على بنك الأسئلة تعمل للجيلين ===');

    r = await runExamPage('subject=' + encodeURIComponent('الدين') + '&semester=' + encodeURIComponent('ف1') + '&generation=2009');
    ok(r.content.indexOf('question-card') !== -1, 'مادة "الدين" تعمل كالمعتاد لجيل 2009');
    r = await runExamPage('subject=' + encodeURIComponent('الدين') + '&semester=' + encodeURIComponent('ف1') + '&generation=2010');
    ok(r.content.indexOf('question-card') !== -1, 'مادة "الدين" تعمل كالمعتاد لجيل 2010');
    ok(r.content.indexOf('لم تتم إضافة محتوى') === -1, 'لا رسالة جيل خاطئة للمواد غير المعزولة');

    console.log('\n=== 6) المراجعة الختامية معزولة بالجيل ===');

    const reviewQuery = (gen) => 'review=true' + (gen ? '&generation=' + gen : '');
    const wrongRecords = [
      { subject: 'الرياضيات', semester: 'ف1', generation: '2009', qObj: { q: 'سؤال جيل 2009', options: ['أ', 'ب', 'ج', 'د'], answer: 0 }, answer: 0 },
      { subject: 'الرياضيات', semester: 'ف1', generation: '2010', qObj: { q: 'سؤال جيل 2010', options: ['أ', 'ب', 'ج', 'د'], answer: 0 }, answer: 0 },
      { subject: 'الدين', semester: 'ف1', qObj: { q: 'سؤال قديم مشترك', options: ['أ', 'ب', 'ج', 'د'], answer: 0 }, answer: 0 }
    ];

    r = await runExamPage(reviewQuery('2009'), { preRun: (ls) => ls.setItem('madrekjo_wrong_questions', JSON.stringify([wrongRecords[0]])) });
    ok(r.content.indexOf('سؤال جيل 2009') !== -1, 'مراجعة 2009 تعرض أسئلة 2009 الخطأ');
    ok(r.content.indexOf('سؤال جيل 2010') === -1, 'مراجعة 2009 لا تعرض أسئلة 2010');

    r = await runExamPage(reviewQuery('2009'), { preRun: (ls) => ls.setItem('madrekjo_wrong_questions', JSON.stringify([wrongRecords[2]])) });
    ok(r.content.indexOf('سؤال قديم مشترك') !== -1, 'مراجعة 2009 تعرض السجلات القديمة المشتركة (بلا جيل)');

    r = await runExamPage(reviewQuery('2010'), { preRun: (ls) => ls.setItem('madrekjo_wrong_questions', JSON.stringify([wrongRecords[1]])) });
    ok(r.content.indexOf('سؤال جيل 2010') !== -1, 'مراجعة 2010 تعرض أسئلة 2010 الخطأ');
    ok(r.content.indexOf('سؤال جيل 2009') === -1, 'مراجعة 2010 لا تعرض أسئلة 2009 نهائياً');

    r = await runExamPage(reviewQuery('2010'), { preRun: (ls) => ls.setItem('madrekjo_wrong_questions', JSON.stringify([wrongRecords[2]])) });
    ok(r.content.indexOf('سؤال قديم مشترك') !== -1, 'مراجعة 2010 تعرض السجلات القديمة المشتركة (بلا جيل)');

    r = await runExamPage(reviewQuery('2010'), { preRun: (ls) => ls.setItem('madrekjo_wrong_questions', JSON.stringify([wrongRecords[0]])) });
    ok(r.content.indexOf('لا توجد أسئلة خاطئة للمراجعة') !== -1, 'مراجعة 2010 فارغة عندما تكون الأسئلة الخطأ كلها لجيل 2009');

    console.log('\n=== 7) محتوى مستقل لكل جيل: إضافة وحدات لكل منهما دون تسريب ===');

    // 1) رفع محتوى مستقل لجيل 2010 في مسار جيله
    overlay.set('/questions/2010/semester-1/math/index.json', {
      type: 'application/json',
      body: JSON.stringify({
        subject_id: 'math', subject: 'الرياضيات', generation_id: '2010', generation: '2010',
        semester_id: 'semester-1', semester: 1, semester_label: 'ف1',
        units: [
          { id: 'U10', number: 1, name: 'وحدة تجريبية خاصة بجيل 2010 فقط',
            lessons: [ { id: 'L10', number: 1, name: 'درس 2010', file: 'unit-01/lesson-01.json' } ],
            review: null }
        ]
      })
    });
    overlay.set('/questions/2010/semester-1/math/unit-01/lesson-01.json', {
      type: 'application/json',
      body: JSON.stringify({
        lesson: { lesson_number: '1.1', lesson_name: 'درس 2010', unit_number: 1, unit_name: 'وحدة تجريبية خاصة بجيل 2010 فقط',
          questions: [
            { id: '2010-L01-Q001', number: 1, question: 'سؤال خاص بجيل 2010', difficulty: 'easy',
              options: { A: 'أ', B: 'ب', C: 'ج', D: 'د' },
              correct_answer: 'A', correct_answer_text: 'أ' }
          ] }
      })
    });

    // 2) إضافة وحدة إضافية خاصة بجيل 2009 فقط (بجانب وحداته الحقيقية)
    const real2009Idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'questions', '2009', 'semester-1', 'math', 'index.json'), 'utf8'));
    real2009Idx.units.push({
      id: 'UT09', number: 99, name: 'وحدة تجريبية خاصة بجيل 2009 فقط',
      lessons: [ { id: 'LT09', number: 1, name: 'درس 2009 تجريبي', file: 'unit-tt/lesson-01.json' } ],
      review: null
    });
    overlay.set('/questions/2009/semester-1/math/index.json', {
      type: 'application/json',
      body: JSON.stringify(real2009Idx)
    });
    overlay.set('/questions/2009/semester-1/math/unit-tt/lesson-01.json', {
      type: 'application/json',
      body: JSON.stringify({
        lesson: { lesson_number: '9.9', lesson_name: 'درس 2009 تجريبي', unit_number: 99, unit_name: 'وحدة تجريبية خاصة بجيل 2009 فقط',
          questions: [
            { id: '2009-TT-Q001', number: 1, question: 'سؤال خاص بجيل 2009 التجريبي', difficulty: 'easy',
              options: { A: 'أ', B: 'ب', C: 'ج', D: 'د' },
              correct_answer: 'A', correct_answer_text: 'أ' }
          ] }
      })
    });

    // 2010 يشاهد وحدته المستقلة فقط
    r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف1') + '&generation=2010');
    ok(r.content.indexOf('وحدة تجريبية خاصة بجيل 2010 فقط') !== -1, '2010 يشاهد الوحدة المرفوعة له في مساره المستقل');
    ok(r.content.indexOf('وحدة تجريبية خاصة بجيل 2009 فقط') === -1, '2010 لا يشاهد وحدة 2009 التجريبية نهائياً');
    ok(r.content.indexOf('الاقترانات والمقادير الجبرية') === -1, '2010 لا يشاهد وحدات 2009 الحقيقية');
    r.ctx.openUnit(0);
    r.ctx.startLesson(0);
    await waitForContentContains('سؤال خاص بجيل 2010');
    ok(elements.examContent.innerHTML.indexOf('سؤال خاص بجيل 2010') !== -1, 'درس 2010 يُحمَّل من مساره المستقل (baseDir صحيح)');

    // 2009 يشاهد وحداته الحقيقية + وحدته التجريبية فقط
    r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف1') + '&generation=2009');
    ok(r.content.indexOf('الاقترانات والمقادير الجبرية') !== -1, '2009 ما زال يشاهد وحداته الحقيقية');
    ok(r.content.indexOf('وحدة تجريبية خاصة بجيل 2009 فقط') !== -1, '2009 يشاهد الوحدة المضافة له');
    ok(r.content.indexOf('وحدة تجريبية خاصة بجيل 2010 فقط') === -1, '2009 لا يشاهد وحدة 2010 التجريبية نهائياً');
    r.ctx.openUnit(real2009Idx.units.length - 1);
    r.ctx.startLesson(0);
    await waitForContentContains('سؤال خاص بجيل 2009 التجريبي');
    ok(elements.examContent.innerHTML.indexOf('سؤال خاص بجيل 2009 التجريبي') !== -1, 'درس 2009 التجريبي يُحمَّل من مساره فقط');

    console.log('\n=== 8) الفصل الثاني: "قريباً" لكل جيل ===');

    r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف2') + '&generation=2009');
    ok(r.content.indexOf('الفصل الثاني قريباً') !== -1, 'جيل 2009: الفصل الثاني قريباً');
    r = await runExamPage('subject=' + encodeURIComponent('الرياضيات') + '&semester=' + encodeURIComponent('ف2') + '&generation=2010');
    ok(r.content.indexOf('الفصل الثاني قريباً') !== -1, 'جيل 2010: الفصل الثاني قريباً (مستقل)');

    console.log('\n=== 9) روابط الصفحات تمرر الجيل ===');

    function verifyLinks(page, expectGen) {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      const lines = html.split('\n');
      const urls = lines.filter(l => l.indexOf('exam.html?') !== -1);
      ok(urls.length > 0, page + ': فيه روابط exam.html (' + urls.length + ')');
      const noParam = urls.filter(l => l.indexOf('generation=') === -1);
      ok(noParam.length === 0, page + ': كل روابط الامتحان تمرر generation=' + expectGen +
        (noParam.length ? ' :: أسطر ناقصة: ' + noParam.map(b => b.trim().slice(0, 60)).join(' | ') : ''));
      const bodyYear = html.match(/<body[^>]*data-year="([^"]+)"/);
      ok(!!bodyYear && bodyYear[1] === expectGen, page + ': سمة data-year = ' + expectGen +
        (bodyYear ? ' (الموجودة: "' + bodyYear[1] + '")' : ' (غير موجودة)'));
      const yearDef = html.indexOf("const YEAR = document.body.dataset.year || '" + expectGen + "';") !== -1;
      ok(yearDef, page + ': YEAR يُقرأ من data-year مع بديل ' + expectGen);
    }

    for (const page of ['engineering.html', 'health.html', 'business.html', 'languages.html']) {
      verifyLinks('2009/' + page, '2009');
    }
    verifyLinks('2010/index.html', '2010');
    const h2010 = fs.readFileSync(path.join(ROOT, '2010', 'index.html'), 'utf8');
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
