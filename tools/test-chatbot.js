const fs = require('fs');
const path = require('path');

function stubEl() {
  return {
    style: {}, classList: { add(){}, remove(){}, toggle(){} },
    setAttribute(){}, appendChild(){}, addEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    focus(){}, remove(){}, scrollTop: 0, scrollHeight: 0, textContent: '',
  };
}

let ctxAttrs = { 'data-year': '2009', 'data-field': 'engineering' };
let currentScript = 'js/chatbot.js';

global.window = global;
global.document = {
  readyState: 'complete',
  addEventListener() {},
  currentScript: { src: currentScript },
  getElementById: () => stubEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { getAttribute: (a) => ctxAttrs[a] || '' },
  createElement: () => stubEl(),
  head: { appendChild(){} },
};
global.document.body.appendChild = () => {};

let code = fs.readFileSync(path.join(__dirname, '..', 'js', 'chatbot.js'), 'utf8');
code = code.replace(/\}\)\(\);\s*$/, 'global.__mk = { replyFor: replyFor, welcomeMessage: welcomeMessage, chipsFor: chipsFor, rewriteForAI: rewriteForAI, callAI: callAI };\n})();\n');

function loadModule() {
  eval(code);
  return global.__mk;
}

function runTests(label, tests, attrs) {
  ctxAttrs = attrs;
  global.__mk = loadModule();
  console.log('\n=== ' + label + ' ===');
  for (const [q, expected] of tests) {
    const got = global.__mk.replyFor(q);
    const hit = expected ? got.indexOf(expected) !== -1 : false;
    console.log((hit ? 'PASS' : 'FAIL') + '  [' + q + ']');
    if (!hit) console.log('      -> ' + got.slice(0, 120));
  }
}

// سياق: هندسي 2009
runTests('هندسي 2009', [
  ['شو مواد المسار؟', 'الإجبارية'],
  ['وين امتحانات الرياضيات؟', 'الرياضيات'],
  ['وين بلاقي امتحان الفيزياء؟', 'الفيزياء'],
  ['شو التخصصات الجامعية؟', 'الهندسة بمختلف فروعها'],
  ['وين امتحانات الكيمياء؟', 'الكيمياء'],
  ['المنصة ببلاش؟', 'مجانية'],
  ['شو هي منصة مدارك جو؟', 'مدارك جو'],
  ['شكرا', 'العفو'],
  ['وين امتحانات تاريخ الاردن؟', 'الامتحانات الوزارية'], // سؤال عام -> جواب عام
], { 'data-year': '2009', 'data-field': 'engineering' });

// سياق: 2010
runTests('2010', [
  ['شو مواد 2010؟', 'المشتركة'],
  ['وين امتحانات الرياضيات؟', 'الرياضيات'],
  ['وين المراجعة الختامية؟', 'المراجعة الختامية'],
  ['وين امتحانات العربي؟', 'العربي'],
  ['المنصة ببلاش؟', 'مجانية'],
], { 'data-year': '2010', 'data-field': '' });

// سياق: صفحة عامة (لا جيل ولا مسار)
runTests('عام', [
  ['شو هي منصة مدارك جو؟', 'مدارك جو'],
  ['هل الموقع مجاني؟', 'مجانية'],
  ['وين بلاقي الامتحانات الوزارية؟', 'الامتحانات'],
  ['كيف اسجل بالمنصة؟', 'تسجيل'],
  ['بدي أدخل لجيل 2009', '2009/index.html'],
  ['بدي أدخل ل 2010', '2010/index.html'],
  ['وين الدردشة الدراسية؟', 'الدردشة'],
  ['شو بتقدر تسوي؟', 'مُدرك يشرح لك الدرس'],
  ['سؤال عشوائي جدا ما اليه جواب', 'ما لقيت'],
  ['ما هو هدف الدردشة الدراسية؟', 'التعاون'],
  ['مين أسس مدارك جو؟', 'طالب من جيل 2009'],
  ['هل المنصة مخصصة للأردن؟', 'الطلاب الأردنيين'],
  ['وين بدي القى الامتحانات؟', 'الامتحانات الوزارية'],
  ['كيف أرفع مستواي الدراسي؟', 'الاختبارات'],
  ['هل فيه دردشة خاصة مع الأصدقاء؟', 'مساحة للتعاون'],
  ['ليش في دردشة دراسية؟', 'التعاون بين الطلاب'],
  ['وين بتلاقي الكتب الوزارية؟', 'الكتب الوزارية'],
  ['مُدرك شو هو؟', 'المساعد الذكي'],
  ['هل المنصة تعمل على الجوال؟', 'متصفح الهاتف'],
  ['في اشتراك مدفوع؟', 'مجانية'],
  ['بشو بتقدم المنصة؟', 'امتحانات'],
  ['شو هو مؤشر الإنجاز؟', 'مؤشر الإنجاز'],
  ['وين بدي القى المراجعة الختامية؟', 'المراجعة الختامية'],
  ['بدي أعيد الاختبار', 'إعادة الاختبار'],
  ['شو طلعت علامتي؟', 'نتيجتك فوراً'],
  ['وين تحديات السرعة؟', 'تحديات السرعة'],
  ['كيف أتواصل مع الفريق؟', 'وسائل التواصل'],
  ['هل في أمان وخصوصية؟', 'حماية'],
  ['بدي أتطوع بالمشروع', 'فرص المساهمة'],
  ['شو الأقسام المتوفرة؟', 'الأقسام'],
  ['أنا طالب جديد', 'سجل حسابك'],
  ['هل المنصة مخصصة لطلاب الأردن؟', 'خدمة الطلاب'],
  ['بدي أنظم جدولي', 'تنظيم الدراسة'],
  ['شو فائدة التسجيل؟', 'تسجيل'],
  ['هل في تنبيهات؟', 'الإشعارات'],
  ['وين أبحث داخل الموقع؟', 'خاصية البحث'],
  ['بدي أشارك مع زملائي', 'تتعاون'],
], { 'data-year': '', 'data-field': '' });

// طبقة الذكاء الاصطناعي: إعادة الصياغة وسلوك callAI بدون endpoint
runTests('إعادة صياغة', [
  ['وين امتحانات الرياضيات يا حبيبي؟', 'امتحانات الرياضيات'],
  ['بدي اعرف شو هي منصة مدارك جو من فضلك', 'مدارك جو'],
], { 'data-year': '2009', 'data-field': 'engineering' });

(async function () {
  const mk = global.__mk;
  const rw = mk.rewriteForAI('وين امتحانات الرياضيات يا حبيبي؟');
  const noFiller = rw.indexOf('حبيبي') === -1;
  const hasCtx = rw.indexOf('السياق') !== -1;
  console.log((noFiller ? 'PASS' : 'FAIL') + '  [حذف كلمات الحشو من السؤال]');
  console.log((hasCtx ? 'PASS' : 'FAIL') + '  [السؤال يتضمن السياق]');
  // محاكاة فشل الشبكة: callAI لازم ترجع null عشان خط الاحتياطي يشتغل
  const realFetch = global.fetch;
  global.fetch = () => Promise.reject(new Error('network down'));
  const res = await mk.callAI('أي سؤال');
  global.fetch = realFetch;
  console.log((res === null ? 'PASS' : 'FAIL') + '  [callAI عند فشل الشبكة يرجع null]');
})();
