/* ============================================================
   مكتبة مدارك — طبقة البيانات (Store)
   ------------------------------------------------------------
   طبقة معزولة تماماً عن الواجهة؛ كل القراءة والكتابة تمر من هنا.

   الوضع الحي (Live): يتصل بـ Supabase عبر js/supabase-config.js
                     ويستخدم الجداول والدوال الجاهزة في migration.
   الوضع التجريبي (Trial): LocalStorage + ذاكرة الجلسة فقط.
   يُختار الوضع تلقائياً: إن وُجد عميل supabase-js ومفتاح حي
   نعمل بالوضع المباشر، وإلا نقع على النسخة التجريبية.

   الدوال المكتوبة للتجربة تحافظ على أسمائها في الوضعين حتى لا
   تُعدَّل الواجهة سوى بتغييرات موضعية (async حيث يلزم).
   ============================================================ */

const MaktabetStore = (function () {
  'use strict';

  const CFG = window.MAKTABET_CONFIG;
  const KEYS = CFG.storageKeys;
  const SUP = window.MAKTABET_SUPABASE || null;

  /** ذاكرة الجلسة فقط: محتوى الملفات المرفوعة في وضع التجربة.
   *  في الوضع الحي لا تُستخدم (الملف يذهب فعلياً إلى الـ Storage). */
  const sessionBlobs = new Map();

  let state = {
    files: [],
    admin: false,
    enabled: true, // مفتاح تفعيل المكتبة (library_enabled)
    mode: 'unknown', // 'live' | 'trial'
    error: null,
    missingRpc: false,
  };
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

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function readLocal() {
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

  /* ---------- تطبيع البيانات (محلي + قاعدة) ---------- */
  function normalize(f) {
    const isSample = f.sample != null ? !!f.sample : !!f.is_sample;
    return {
      id: String(f.id || genId()),
      title: String(f.title || '').trim(),
      description: String(f.description || '').trim(),
      year: String(f.year || ''),
      subject: String(f.subject || ''),
      term: String(f.term || ''),
      type: String(f.type || ''),
      ext: String(f.ext || '').toLowerCase(),
      size: Number(f.size != null ? f.size : f.size_bytes) || 0,
      uploader: String(f.uploader || 'مستخدم مجهول').trim(),
      uploadedAt: f.uploadedAt || f.created_at || nowISO(),
      downloads: Number(f.downloads) || 0,
      status: ['approved', 'pending', 'rejected'].includes(f.status) ? f.status : 'pending',
      sample: isSample,
      note: f.note ? String(f.note) : '',
      storagePath: f.storage_path || null,
      hasRealFile: !!f.storage_path && !isSample,
    };
  }

  /* ============================================================
     الوضع الحي — Supabase
     ============================================================ */
  let sb = null;

  function makeClient() {
    if (!SUP || !SUP.url || !SUP.publishableKey) return null;
    const windowSupabase = window.supabase;
    if (!windowSupabase) return null;
    // حزمة CDN تُصدّر `window.supabase` ككائن فيه createClient،
    // وربما كدالة في صيغ أخرى — نقبل الحالتين.
    const factory =
      typeof windowSupabase === 'function' ? windowSupabase : windowSupabase.createClient;
    if (typeof factory !== 'function') return null;
    return factory(SUP.url, SUP.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  function client() {
    if (!sb) sb = makeClient();
    return sb;
  }

  function liveReady() {
    return !!(client() && SUP && SUP.storageBucket);
  }

  /** شبكة محصّنة: تُحسم بلا نتيجة بعد مهلة بدل التعليق للأبد. */
  function timeoutRace(promise, ms) {
    return new Promise((resolve) => {
      let done = false;
      const timer = window.setTimeout(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      }, ms);
      Promise.resolve(promise).then(
        (v) => {
          if (!done) {
            done = true;
            window.clearTimeout(timer);
            resolve(v);
          }
        },
        (e) => {
          if (!done) {
            done = true;
            window.clearTimeout(timer);
            resolve(null);
          }
        }
      );
    });
  }

  async function ensureAnonSession() {
    const c = client();
    if (!c) return null;
    try {
      const { data: exists } = await c.auth.getSession();
      if (exists && exists.session && exists.session.user) return exists.session.user;
      const { data: anon, error } = await c.auth.signInAnonymously();
      if (error || !anon || !anon.user) return null;
      return anon.user;
    } catch (e) {
      return null;
    }
  }

  async function fetchSettings() {
    const c = client();
    const res = await timeoutRace(
      c.from('maktabet_library_settings').select('library_enabled').eq('id', 1).maybeSingle(),
      6000
    );
    if (!res || res.error) return null;
    return res.data;
  }

  async function fetchAllFiles() {
    const c = client();
    const res = await timeoutRace(
      c.from('maktabet_library_files').select('*').order('created_at', { ascending: false }).limit(1000),
      6000
    );
    if (!res || res.error) throw (res && res.error) || new Error('timeout');
    return res.data || [];
  }

  async function checkAdmin() {
    const c = client();
    if (!c) {
      state.admin = false;
      return;
    }
    const res = await timeoutRace(c.rpc('maktabet_is_admin'), 6000);
    if (res === null) {
      // المهلة انتهت — لا نثق بأي حالة أدمن قديمة.
      state.admin = false;
      return;
    }
    const { data, error } = res;
    if (error) {
      // دالة جديدة لم تُشغَّل بعد تحديث SQL أو مشكلة أخرى.
      state.admin = false;
      state.missingRpc = /does not exist|maktabet_is_admin/i.test(String(error.message));
    } else {
      state.admin = !!data;
      state.missingRpc = false;
    }
    if (!state.admin) writeAdmin(false);
  }

  async function refreshLive() {
    const c = client();
    if (!c) return;
    try {
      const [rows, settings] = await Promise.all([fetchAllFiles(), fetchSettings()]);
      if (settings) state.enabled = !!settings.library_enabled;
      state.files = rows.map(normalize);
      state.error = null;
      await checkAdmin();
      emit();
    } catch (e) {
      state.error = e && e.message ? String(e.message) : String(e);
      console.warn('[مكتبة مدارك] لم نتمكن من جلب البيانات من القاعدة:', e);
    }
  }

  /* ---------- الكتابة في الوضع الحي ---------- */
  async function addLive(meta, opts) {
    const c = client();
    const blob = opts && opts.file ? opts.file : null;
    const onProgress = opts && typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const ext = String(meta.ext || '').toLowerCase();
    let storagePath = null;

    if (blob) {
      const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const safeSubject = String(meta.subject || 'other').replace(/[^a-z0-9-]/gi, '');
      storagePath = [String(meta.year || '2009'), safeSubject, stamp + '.' + ext].join('/');

      const upOpts = {
        cacheControl: '3600',
        upsert: false,
      };
      if (onProgress) {
        upOpts.onUploadProgress = (p) => {
          const pct = Math.round(((p.loaded || 0) / (p.total || 1)) * 72);
          onProgress(Math.max(2, Math.min(72, pct)));
        };
      }
      const upRes = await timeoutRace(
        c.storage.from(SUP.storageBucket).upload(storagePath, blob, upOpts),
        30000
      );
      if (upRes === null) {
        const e = new Error('استغرق رفع الملف وقتاً طويلاً — حاول مجدداً.');
        e.friendly = true;
        throw e;
      }
      const upErr = upRes.error;
      if (upErr) {
        let msg = 'فشل رفع الملف إلى خادم المكتبة.';
        if (/size_limit_exceeded|413|payload too large/i.test(String(upErr.message || upErr.error || ''))) {
          msg = 'الملف أكبر من الحد المسموح (10MB).';
        }
        const err = new Error(msg);
        err.friendly = true;
        throw err;
      }
      if (onProgress) onProgress(80);
    }

    const rpcRes = await timeoutRace(
      c.rpc('maktabet_add_file', {
        p_title: meta.title,
        p_description: meta.description || '',
        p_year: Number(meta.year),
        p_subject: meta.subject,
        p_term: Number(meta.term),
        p_type: meta.type,
        p_ext: ext,
        p_size_bytes: Number(meta.size) || 0,
        p_uploader: meta.uploader || 'مستخدم مجهول',
        p_storage_path: storagePath,
      }),
      15000
    );

    if (rpcRes === null || rpcRes.error || !rpcRes.data) {
      if (storagePath) {
        try {
          await c.storage.from(SUP.storageBucket).remove([storagePath]);
        } catch (e) {
          /* تجاهل تنظيف */
        }
      }
      const err = new Error('تعذّر حفظ الملف في قاعدة البيانات.');
      err.friendly = true;
      throw err;
    }

    if (onProgress) onProgress(92);
    await refreshLive();
    if (onProgress) onProgress(100);

    const created = state.files.find((x) => x.id === String(rpcRes.data)) || null;
    return created ? clone(created) : null;
  }

  /* ============================================================
     الواجهة العامة
     ============================================================ */
  const api = {
    /* -- التهيئة -- */
    async init() {
      if (liveReady()) {
        state.mode = 'live';
        state.enabled = false; // احترازي حتى تتأكد الإعدادات من القاعدة
        await ensureAnonSession(); // لا تُلزم أحداً؛ مفيدة للإدارة فقط
        await refreshLive();
      } else {
        state.mode = 'trial';
        const stored = readLocal();
        if (stored) {
          state.files = stored.map(normalize);
        } else {
          state.files = window.MAKTABET_SEED.map(normalize);
          writeLocal();
        }
        state.admin = readAdmin();
        state.enabled = true;
        emit();
      }
      return api;
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /* -- الحالة والوضع -- */
    mode() {
      return state.mode;
    },
    isLive() {
      return state.mode === 'live';
    },
    isEnabled() {
      return state.enabled;
    },
    getError() {
      return state.error;
    },
    isMissingRpc() {
      return state.missingRpc;
    },

    /* -- قراءة (متزامنة على الكاش) -- */
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
        return new Date(b.uploadedAt) - new Date(a.uploadedAt);
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
    async addFile(meta, opts) {
      if (this.isLive()) return addLive(meta, opts || {});
      const file = normalize({
        ...meta,
        id: genId(),
        status: 'pending',
        downloads: 0,
        uploadedAt: nowISO(),
        sample: false,
      });
      state.files.unshift(file);
      writeLocal();
      emit();
      return clone(file);
    },

    /** محتوى ملف في ذاكرة الجلسة فقط (وضع التجربة). */
    attachSessionBlob(id, blob) {
      sessionBlobs.set(id, blob);
    },
    getSessionBlob(id) {
      return sessionBlobs.get(id) || null;
    },
    hasSessionBlob(id) {
      return sessionBlobs.has(id);
    },

    async updateStatus(id, status, note) {
      if (!['approved', 'pending', 'rejected'].includes(status)) return null;
      if (this.isLive()) {
        const c = client();
        const res = await timeoutRace(
          c.rpc('maktabet_set_status', {
            p_file_id: id,
            p_status: status,
            p_note: note == null ? null : String(note),
          }),
          8000
        );
        if (res === null || res.error) {
          console.warn('[مكتبة مدارك] فشل تحديث الحالة:', res && res.error);
          return null;
        }
        await refreshLive();
        const f = state.files.find((x) => x.id === id);
        return f ? clone(f) : null;
      }
      const f = state.files.find((x) => x.id === id);
      if (!f) return null;
      f.status = status;
      f.note = note != null ? String(note) : f.note || '';
      writeLocal();
      emit();
      return clone(f);
    },

    async removeFile(id) {
      if (this.isLive()) {
        const c = client();
        const res = await timeoutRace(c.rpc('maktabet_delete_file', { p_file_id: id }), 8000);
        if (res === null || res.error) {
          console.warn('[مكتبة مدارك] فشل الحذف:', res && res.error);
          return false;
        }
        await refreshLive();
        return true;
      }
      const i = state.files.findIndex((x) => x.id === id);
      if (i === -1) return false;
      state.files.splice(i, 1);
      sessionBlobs.delete(id);
      writeLocal();
      emit();
      return true;
    },

    async incrementDownload(id) {
      if (this.isLive()) {
        const c = client();
        const res = await timeoutRace(c.rpc('maktabet_increment_download', { p_file_id: id }), 8000);
        if (!(res === null || res.error)) await refreshLive();
        const f = state.files.find((x) => x.id === id);
        return f ? clone(f) : null;
      }
      const f = state.files.find((x) => x.id === id);
      if (!f) return null;
      f.downloads += 1;
      writeLocal();
      emit();
      return clone(f);
    },

    /** إعادة التهيئة: متاحة في التجربة فقط (حماية لقاعدة البيانات الحقيقية). */
    async reset() {
      if (this.isLive()) return false;
      state.files = window.MAKTABET_SEED.map(normalize);
      sessionBlobs.clear();
      writeLocal();
      emit();
      return true;
    },

    async clearAll() {
      if (this.isLive()) return false;
      state.files = [];
      sessionBlobs.clear();
      writeLocal();
      emit();
      return true;
    },

    exportJSON() {
      return JSON.stringify(
        {
          generatedAt: nowISO(),
          kind: this.isLive() ? 'maktabet-madarek-live' : 'maktabet-madarek-trial',
          mode: this.isLive() ? 'live' : 'trial',
          files: state.files,
        },
        null,
        2,
      );
    },

    /* -- جلسة الإدارة -- */
    async loginAdmin(code) {
      if (this.isLive()) {
        const user = await timeoutRace(ensureAnonSession(), 10000);
        if (!user) {
          const err = new Error('ANON_DISABLED');
          err.friendly = true;
          throw err;
        }
        const c = client();
        const res = await timeoutRace(
          c.rpc('maktabet_login_admin', { p_code: String(code || '') }),
          10000
        );
        if (res === null) return false;
        if (res.error) {
          if (/does not exist/i.test(String(res.error.message))) {
            const err2 = new Error('MISSING_RPC');
            err2.friendly = true;
            throw err2;
          }
          return false;
        }
        if (res.data !== true) return false;
        state.admin = true;
        writeAdmin(true);
        await refreshLive();
        return true;
      }
      const ok = window.maktabetCheckAdminCode(code);
      if (ok) {
        state.admin = true;
        writeAdmin(true);
        emit();
      }
      return ok;
    },

    async logoutAdmin() {
      state.admin = false;
      writeAdmin(false);
      if (this.isLive()) await refreshLive();
      else emit();
      return true;
    },

    /* -- البلاغات -- */
    async reportFile(id, reason) {
      if (this.isLive()) {
        const c = client();
        const res = await timeoutRace(
          c.from('maktabet_library_reports').insert({ file_id: id, reason: String(reason || '') }),
          8000
        );
        return !(res === null || (res && res.error));
      }
      return true;
    },

    /* -- الإعدادات الحي -- */
    async fetchRealBlob(file) {
      if (!this.isLive() || !file || !file.storagePath) return null;
      const c = client();
      const res = await timeoutRace(
        c.storage.from(SUP.storageBucket).download(file.storagePath),
        20000
      );
      if (res === null || res.error || !res.data) return null;
      return res.data;
    },

    async setLibraryEnabled(enabled) {
      if (!this.isLive()) {
        state.enabled = true;
        return true;
      }
      const c = client();
      const res = await timeoutRace(
        c.from('maktabet_library_settings').update({ library_enabled: !!enabled }).eq('id', 1),
        8000
      );
      if (res === null || (res && res.error)) return false;
      state.enabled = !!enabled;
      await refreshLive();
      return true;
    },
  };

  return api;
})();

window.MaktabetStore = MaktabetStore;