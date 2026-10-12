/* ============================================================
   المكتبة — إعدادات القسم
   ------------------------------------------------------------
   ملاحظة: هذا الملف لا يتصل بخادم ولا يحوي أي رمز إدارة.
   كل القيم تخدم الواجهة والتصنيفات وقيود الرفع.
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
    links: 'maktabet_madarek_links_v1',
    admin: 'maktabet_madarek_admin_v1',
    downloads: 'maktabet_madarek_downloads_v1',
  },

  // اسم ملف النسخ الاحتياطي/التصدير
  exportName: 'maktabet-madarek-trial-data.json',
};

/* ملاحظة أمان: رمز الإدارة غير موجود في هذا الملف إطلاقاً.
   في النسخة المباشرة يُتحقق منه داخل قاعدة البيانات (Supabase)
   عبر دالة maktabet_login_admin، ولا يُكتب في كود الصفحة أبداً. */

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
window.mjSubject = mjSubject;
window.mjTerm = mjTerm;
window.mjType = mjType;
window.mjYear = mjYear;
