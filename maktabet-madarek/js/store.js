/* ============================================================
   مكتبة مدارك — طبقة البيانات التجريبية (Store)
   ------------------------------------------------------------
   هذه الطبقة معزولة تماماً عن الواجهة. كل عمليات القراءة
   والكتابة تمر من هنا، لذلك يمكن لاحقاً استبدال التخزين
   المحلي بـ Supabase دون تعديل ملفات الواجهة.

   >>> نقطة الربط المستقبلية بـ Supabase:
   استبدل الدوال المعلَّمة بـ «TODO: Supabase» باستدعاءات
   supabase.from('library_files')... مع الإبقاء على نفس الأسماء.
   ============================================================ */

const MaktabetStore = (function () {
  const CFG = window.MAKTABET_CONFIG;
  const KEYS = CFG.storageKeys;

  /** ذاكرة مؤقتة للجلسة فقط: محتوى الملفات المرفوعة فعلياً.
   *  لا يُحفظ في LocalStorage (المحتوى الكبير لا يُخزَّن محلياً). */
  const sessionBlobs = new Map();

  let state = { files: [], admin: false };
  const listeners = new Set();

  /* ---------- أدوات داخلية ---------- */
  function nowISO() {
    return new Date().toISOString();
  }

  function genId() {
    return 'f-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function safeParse(raw, fallback) {
    try {
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function readLocal() {
    // ملاحظة: التخزين المحلي مؤقت للنسخة التجريبية فقط.
    try {
      const raw = localStorage.getItem(KEYS.files);
      if (raw == null) return null;
      const arr = safeParse(raw, null);
      return Array.isArray(arr) ? arr : null;
    } catch (e) {
      return null;
    }
  }

  function writeLocal() {
    try {
      localStorage.setItem(KEYS.files, JSON.stringify(state.files));
    } catch (e) {
      // في حال امتلاء التخزين نتجاهل بصمت ونكمل بالذاكرة.
      console.warn('[مكتبة مدارك] تعذّر الحفظ في التخزين المحلي:', e);
    }
  }

  function readAdmin() {
    try {
      return sessionStorage.getItem(KEYS.admin) === '1';
    } catch (e) {
      return false;
    }
  }

  function writeAdmin(v) {
    try {
      if (v) sessionStorage.setItem(KEYS.admin, '1');
      else sessionStorage.removeItem(KEYS.admin);
    } catch (e) {
      /* تجاهل */
    }
  }

  function emit() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
  }

  /** نسخة عميقة بسيطة كافية لبيانات وصفية مسطّحة. */
  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  /* ---------- تطبيع البيانات ---------- */
  function normalize(f) {
    return {
      id: f.id || genId(),
      title: String(f.title || '').trim(),
      description: String(f.description || '').trim(),
      year: String(f.year || ''),
      subject: String(f.subject || ''),
      term: String(f.term || ''),
      type: String(f.type || ''),
      ext: String(f.ext || '').toLowerCase(),
      size: Number(f.size) || 0,
      uploader: String(f.uploader || 'مستخدم مجهول').trim(),
      uploadedAt: f.uploadedAt || nowISO(),
      downloads: Number(f.downloads) || 0,
      status: ['approved', 'pending', 'rejected'].includes(f.status) ? f.status : 'pending',
      sample: !!f.sample,
      note: f.note ? String(f.note) : '',
    };
  }

  /* ---------- الواجهة العامة ---------- */
  const api = {
    /* -- التهيئة -- */
    init() {
      // TODO: Supabase — استبدل هذا بجلب الملفات من الجدول.
      const stored = readLocal();
      if (stored) {
        state.files = stored.map(normalize);
      } else {
        state.files = window.MAKTABET_SEED.map(normalize);
        writeLocal();
      }
      state.admin = readAdmin();
      return api;
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /* -- قراءة -- */
    all() {
      return clone(state.files);
    },

    get(id) {
      const f = state.files.find((x) => x.id === id);
      return f ? clone(f) : null;
    },

    isAdmin() {
      return state.admin;
    },

    /* -- تصفية وبحث وترتيب --
       filters: { q, year, subject, term, type, status, sort }
       status: 'approved' للعرض العام، أو 'any' للإدارة */
    query(filters = {}) {
      const f = filters;
      const q = (f.q || '').trim().toLowerCase();

      let rows = state.files.filter((file) => {
        if (f.status && f.status !== 'any' && file.status !== f.status) return false;
        if (f.year && file.year !== f.year) return false;
        if (f.subject && file.subject !== f.subject) return false;
        if (f.term && file.term !== f.term) return false;
        if (f.type && file.type !== f.type) return false;
        if (q) {
          const hay = (file.title + ' ' + file.description + ' ' + file.uploader).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      const sort = f.sort || 'newest';
      rows.sort((a, b) => {
        if (sort === 'downloads') return b.downloads - a.downloads;
        if (sort === 'oldest') return new Date(a.uploadedAt) - new Date(b.uploadedAt);
        if (sort === 'title') return a.title.localeCompare(b.title, 'ar');
        return new Date(b.uploadedAt) - new Date(a.uploadedAt); // newest
      });

      return clone(rows);
    },

    stats() {
      const s = state.files;
      const approved = s.filter((x) => x.status === 'approved').length;
      const pending = s.filter((x) => x.status === 'pending').length;
      const rejected = s.filter((x) => x.status === 'rejected').length;
      const subjects = new Set(s.map((x) => x.subject)).size;
      const downloads = s.reduce((sum, x) => sum + x.downloads, 0);
      return { total: s.length, approved, pending, rejected, subjects, downloads };
    },

    /* -- كتابة -- */
    addFile(meta) {
      // TODO: Supabase — أدرج صفاً جديداً + ارفع الملف إلى Storage.
      const file = normalize({ ...meta, id: genId(), status: 'pending', downloads: 0, uploadedAt: nowISO(), sample: false });
      state.files.unshift(file);
      writeLocal();
      emit();
      return clone(file);
    },

    /** يحفظ محتوى الملف في الذاكرة للجلسة الحالية فقط (لا يُخزَّن محلياً). */
    attachSessionBlob(id, blob) {
      sessionBlobs.set(id, blob);
    },

    getSessionBlob(id) {
      return sessionBlobs.get(id) || null;
    },

    hasSessionBlob(id) {
      return sessionBlobs.has(id);
    },

    updateStatus(id, status, note) {
      // TODO: Supabase — UPDATE library_files SET status = ...
      const f = state.files.find((x) => x.id === id);
      if (!f) return null;
      if (!['approved', 'pending', 'rejected'].includes(status)) return null;
      f.status = status;
      f.note = note != null ? String(note) : f.note || '';
      writeLocal();
      emit();
      return clone(f);
    },

    removeFile(id) {
      // TODO: Supabase — DELETE FROM library_files WHERE id = ...
      const i = state.files.findIndex((x) => x.id === id);
      if (i === -1) return false;
      state.files.splice(i, 1);
      sessionBlobs.delete(id);
      writeLocal();
      emit();
      return true;
    },

    incrementDownload(id) {
      // TODO: Supabase — RPC لزيادة عدّاد التنزيل (atomic).
      const f = state.files.find((x) => x.id === id);
      if (!f) return null;
      f.downloads += 1;
      writeLocal();
      emit();
      return clone(f);
    },

    /** إعادة تعيين بيانات التجربة إلى الحالة الأصلية. */
    reset() {
      state.files = window.MAKTABET_SEED.map(normalize);
      sessionBlobs.clear();
      writeLocal();
      emit();
      return true;
    },

    /** حذف كل الملفات (فراغ تام) — للاختبار. */
    clearAll() {
      state.files = [];
      sessionBlobs.clear();
      writeLocal();
      emit();
      return true;
    },

    exportJSON() {
      return JSON.stringify(
        { generatedAt: nowISO(), kind: 'maktabet-madarek-trial', files: state.files },
        null,
        2,
      );
    },

    /* -- جلسة الإدارة (تجريبية فقط) -- */
    loginAdmin(code) {
      // TODO: Supabase — استبدل برمز/مصادقة حقيقية عبر دالة آمنة.
      const ok = window.maktabetCheckAdminCode(code);
      if (ok) {
        state.admin = true;
        writeAdmin(true);
        emit();
      }
      return ok;
    },

    logoutAdmin() {
      state.admin = false;
      writeAdmin(false);
      emit();
      return true;
    },
  };

  return api;
})();

window.MaktabetStore = MaktabetStore;
