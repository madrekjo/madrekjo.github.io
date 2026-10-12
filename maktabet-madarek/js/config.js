/* ============================================================
   مكتبة مدارك — إعدادات النسخة التجريبية المستقلة
   ------------------------------------------------------------
   ملاحظة: هذا الملف لا يتصل بأي خادم ولا بـ Supabase.
   كل القيم ثابتة لخدمة الواجهة التجريبية فقط.
   ============================================================ */

const MAKTABET_CONFIG = {
  // السنة الدراسية
  years: [
    { id: '2009', label: 'جيل 2009' },
    { id: '2010', label: 'جيل 2010' },
  ],

  // المواد الدراسية (المعرّف، الاسم، الأيقونة، اللون المميز)
  subjects: [
    { id: 'math', label: 'الرياضيات', icon: '📐', color: '#2563eb' },
    { id: 'physics', label: 'الفيزياء', icon: '⚛️', color: '#7c3aed' },
    { id: 'chemistry', label: 'الكيمياء', icon: '🧪', color: '#0d9488' },
    { id: 'biology', label: 'الأحياء', icon: '🧬', color: '#16a34a' },
    { id: 'arabic', label: 'اللغة العربية', icon: '📗', color: '#b45309' },
    { id: 'english', label: 'اللغة الإنجليزية', icon: '🔤', color: '#0369a1' },
    { id: 'islamic', label: 'التربية الإسلامية', icon: '🕌', color: '#0f766e' },
    { id: 'history', label: 'تاريخ الأردن', icon: '🏛️', color: '#92400e' },
    { id: 'earth', label: 'علوم الأرض', icon: '🌍', color: '#15803d' },
    { id: 'cs', label: 'الحاسوب وتكنولوجيا المعلومات', icon: '💻', color: '#4f46e5' },
    { id: 'social', label: 'الدراسات الاجتماعية', icon: '🗺️', color: '#be123c' },
  ],

  // الفصل الدراسي
  terms: [
    { id: '1', label: 'الفصل الأول' },
    { id: '2', label: 'الفصل الثاني' },
  ],

  // أنواع الملفات
  types: [
    { id: 'summary', label: 'ملخص', icon: '📝' },
    { id: 'exam', label: 'امتحان', icon: '🧾' },
    { id: 'ministerial', label: 'أسئلة وزارية', icon: '🏛️' },
    { id: 'worksheet', label: 'أوراق عمل', icon: '✏️' },
    { id: 'solutions', label: 'حلول', icon: '✅' },
    { id: 'mindmap', label: 'خرائط ذهنية', icon: '🧠' },
    { id: 'other', label: 'ملفات أخرى', icon: '📎' },
  ],

  // حالات الملف داخل المكتبة
  statuses: {
    approved: { label: 'معتمد', className: 'is-approved' },
    pending: { label: 'قيد المراجعة', className: 'is-pending' },
    rejected: { label: 'مرفوض', className: 'is-rejected' },
  },

  // قيود الرفع التجريبية
  upload: {
    maxBytes: 10 * 1024 * 1024, // 10 ميغابايت (حد تجريبي — مطابق لحد القاعدة)
    allowedExt: ['pdf', 'jpg', 'jpeg', 'png'],
    allowedMime: ['application/pdf', 'image/jpeg', 'image/png'],
  },

  // مفاتيح التخزين المحلي التجريبي
  storageKeys: {
    files: 'maktabet_madarek_files_v1',
    admin: 'maktabet_madarek_admin_v1',
    downloads: 'maktabet_madarek_downloads_v1',
  },

  // اسم ملف النسخ الاحتياطي/التصدير
  exportName: 'maktabet-madarek-trial-data.json',
};

/* ------------------------------------------------------------
   رمز الإدارة التجريبي (3330116)
   مخزّن بصيغة مرمّزة حتى لا يظهر كنص مباشر على الشاشة أو في
   بيانات الملفات. هذا ليس أماناً حقيقياً — هو مجرد حماية شكلية
   للنسخة التجريبية، وسيُستبدل بمصادقة حقيقية عند ربط Supabase.
   ------------------------------------------------------------ */
const MAKTABET_ADMIN_HASH = (function () {
  // الرمز مخزّن مفكّكاً إلى قيم رقمية (وليس نصاً واحداً واضحاً)،
  // حتى لا يظهر كلمح نصوص عادي في البيانات. ليس هذا حماية حقيقية
  // — النسخة تجريبية فقط وستستبدل بمصادقة حقيقية عند ربط Supabase.
  const parts = [3, 3, 3, 0, 1, 1, 6]; // قيم أرقام رمز الإدارة مفكّكة
  return parts;
})();

/**
 * يتحقق من رمز الإدارة التجريبي.
 * @param {string} input
 * @returns {boolean}
 */
function maktabetCheckAdminCode(input) {
  const clean = String(input || '').replace(/\s+/g, '');
  if (clean.length !== MAKTABET_ADMIN_HASH.length) return false;
  return clean
    .split('')
    .every((ch, i) => ch.charCodeAt(0) - 48 === MAKTABET_ADMIN_HASH[i]);
}

/* مساعدات عامة */
function mjSubject(id) {
  return MAKTABET_CONFIG.subjects.find((s) => s.id === id) || null;
}
function mjTerm(id) {
  return MAKTABET_CONFIG.terms.find((t) => t.id === id) || null;
}
function mjType(id) {
  return MAKTABET_CONFIG.types.find((t) => t.id === id) || null;
}
function mjYear(id) {
  return MAKTABET_CONFIG.years.find((y) => y.id === id) || null;
}

// إتاحة للاستخدام في المتصفح
window.MAKTABET_CONFIG = MAKTABET_CONFIG;
window.maktabetCheckAdminCode = maktabetCheckAdminCode;
window.mjSubject = mjSubject;
window.mjTerm = mjTerm;
window.mjType = mjType;
window.mjYear = mjYear;
