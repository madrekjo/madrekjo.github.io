/* ============================================================
   مكتبة مدارك — منطق الواجهة
   ------------------------------------------------------------
   يدعم وضعين يعملان بنفس الواجهة:
   - وضع مباشر (Live):   البيانات عبر Supabase (رفع/تنزيل حقيقي).
   - وضع تجريبي (Trial): LocalStorage + ذاكرة الجلسة (احتياط).
   الوضع يُكتشف تلقائياً من طبقة Store.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.MAKTABET_CONFIG;
  const Store = window.MaktabetStore;

  /* ---------- أدوات عامة ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function formatNum(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function formatSize(bytes) {
    const b = Number(bytes) || 0;
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('ar-JO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (e) {
      return '—';
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const EXT_COLORS = { pdf: '#e11d48', jpg: '#f59e0b', jpeg: '#f59e0b', png: '#22c55e' };
  const EXT_ICONS = { pdf: '📕', jpg: '🖼️', jpeg: '🖼️', png: '🖼️' };

  function extStyle(f) {
    const key = (f.ext || '').toLowerCase();
    return {
      color: EXT_COLORS[key] || '#0d9488',
      icon: EXT_ICONS[key] || '📄',
      label: (f.ext || 'file').toUpperCase(),
    };
  }

  /* ---------- الإشعارات ---------- */
  function toast(msg, type = 'info') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'mj-toast toast-' + type;
    const icon = { success: '✅', error: '⛔', warn: '⚠️', info: 'ℹ️' }[type] || 'ℹ️';
    el.innerHTML = '<span>' + icon + '</span><span>' + escapeHtml(msg) + '</span>';
    box.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 300);
    }, 3600);
  }

  /* ---------- النوافذ المنبثقة ---------- */
  const modalIds = ['uploadModal', 'detailsModal', 'adminLoginModal', 'confirmModal'];

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
  function closeAllModals() {
    modalIds.forEach((id) => closeModal(id));
  }

  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) closeModal(closeBtn.getAttribute('data-close'));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#adminPanel').hidden) return;
      closeAllModals();
    }
  });

  modalIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) closeModal(id);
      });
    }
  });

  /* ---------- حالة الواجهة ---------- */
  const state = {
    q: '',
    year: '',
    subject: '',
    term: '',
    type: '',
    sort: 'newest',
    quick: 'all',
    adminStatus: 'any',
    adminQ: '',
  };

  let pendingDeleteId = null;

  /* ---------- تعبئة القوائم ---------- */
  function fillSelect(select, items, labelKey) {
    items.forEach((it) => {
      const opt = document.createElement('option');
      opt.value = it.id;
      opt.textContent = it[labelKey];
      select.appendChild(opt);
    });
  }

  function populateSelects() {
    fillSelect($('#filterYear'), CFG.years, 'label');
    fillSelect($('#filterSubject'), CFG.subjects, 'label');
    fillSelect($('#filterTerm'), CFG.terms, 'label');
    fillSelect($('#filterType'), CFG.types, 'label');

    fillSelect($('#upYear'), CFG.years, 'label');
    fillSelect($('#upSubject'), CFG.subjects, 'label');
    fillSelect($('#upTerm'), CFG.terms, 'label');
    fillSelect($('#upType'), CFG.types, 'label');
  }

  const mjSubject = (id) => CFG.subjects.find((s) => s.id === id) || null;
  const mjYear = (id) => CFG.years.find((s) => s.id === id) || null;
  const mjTerm = (id) => CFG.terms.find((s) => s.id === id) || null;
  const mjType = (id) => CFG.types.find((s) => s.id === id) || null;

  /* ---------- تصنيفات المواد ---------- */
  function renderSubjects() {
    const grid = $('#subjectsGrid');
    grid.innerHTML = '';
    CFG.subjects.forEach((s) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mj-subject-card' + (state.subject === s.id ? ' is-active' : '');
      card.setAttribute('data-subject', s.id);
      card.innerHTML =
        '<span class="mj-subject-icon" style="background:' + s.color + '">' + s.icon + '</span>' +
        '<span class="mj-subject-name">' + escapeHtml(s.label) + '</span>';
      card.addEventListener('click', () => {
        state.subject = state.subject === s.id ? '' : s.id;
        state.quick = 'all';
        $('#filterSubject').value = state.subject;
        $('#filterSort').value = state.sort;
        renderSubjects();
        renderStats();
        renderFiles();
        showToggleClearSubject();
        $('#filesSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      grid.appendChild(card);
    });
    showToggleClearSubject();
  }

  function showToggleClearSubject() {
    $('#clearSubjectBtn').hidden = !state.subject;
  }

  /* ---------- الإحصائيات ---------- */
  function renderStats() {
    const s = Store.stats();
    $('#statFiles').textContent = formatNum(s.total);
    $('#statSubjects').textContent = formatNum(s.subjects);
    $('#statApproved').textContent = formatNum(s.approved);
    $('#statDownloads').textContent = formatNum(s.downloads);
  }

  /* ---------- بطاقات الملفات (العرض العام) ---------- */
  function getPublicQuery() {
    return {
      q: state.q,
      year: state.year,
      subject: state.subject,
      term: state.term,
      type: state.type,
      sort: state.quick === 'all' ? state.sort : state.quick,
      status: 'approved',
    };
  }

  function fileCard(f) {
    const subj = mjSubject(f.subject);
    const term = mjTerm(f.term);
    const type = mjType(f.type);
    const year = mjYear(f.year);
    const st = CFG.statuses[f.status] || {};

    const stIcon = extStyle(f);

    return (
      '<article class="mj-file-card" data-id="' + escapeHtml(f.id) + '">' +
        '<div class="mj-file-top">' +
          '<span class="mj-file-ic" style="background:' + stIcon.color + '" title="' + escapeHtml(stIcon.label) + '">' + stIcon.icon + '</span>' +
          '<div class="mj-file-tags">' +
            (year ? '<span class="mj-tag year">' + escapeHtml(year.label) + '</span>' : '') +
            (term ? '<span class="mj-tag term">ف' + escapeHtml(term.id === '1' ? '١' : '٢') + '</span>' : '') +
            (type ? '<span class="mj-tag type">' + escapeHtml(type.label) + '</span>' : '') +
            '<span class="mj-file-status ' + (st.className || '') + '">' + escapeHtml(st.label || '') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="mj-file-body">' +
          '<h3 class="mj-file-title">' + escapeHtml(f.title) + '</h3>' +
          '<p class="mj-file-desc">' + escapeHtml(f.description) + '</p>' +
          '<div class="mj-file-meta">' +
            '<span>📚 ' + (subj ? escapeHtml(subj.label) : '—') + '</span>' +
            '<span>👤 ' + escapeHtml(f.uploader) + '</span>' +
            '<span>📅 ' + escapeHtml(formatDate(f.uploadedAt)) + '</span>' +
            '<span>⬇️ ' + formatNum(f.downloads) + '</span>' +
            '<span>🗎 ' + escapeHtml(stIcon.label) + ' · ' + escapeHtml(formatSize(f.size)) + '</span>' +
          '</div>' +
          '<div class="mj-file-actions">' +
            '<button type="button" class="mj-mini-btn" data-detail="' + escapeHtml(f.id) + '">👁️ تفاصيل</button>' +
            '<button type="button" class="mj-mini-btn primary" data-download="' + escapeHtml(f.id) + '">⬇️ تنزيل</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderFiles() {
    const grid = $('#filesGrid');
    const empty = $('#emptyState');
    const rows = Store.query(getPublicQuery());

    $('#resultCount').textContent = rows.length === 0 ? 'لا توجد نتائج' : formatNum(rows.length) + ' ملف';

    if (rows.length === 0) {
      grid.innerHTML = '';
      grid.hidden = true;
      empty.hidden = false;
      return;
    }
    grid.hidden = false;
    empty.hidden = true;
    grid.innerHTML = rows.map(fileCard).join('');
  }

  function bindFilesGrid() {
    const grid = $('#filesGrid');
    grid.addEventListener('click', (e) => {
      const detailBtn = e.target.closest('[data-detail]');
      const dlBtn = e.target.closest('[data-download]');
      if (detailBtn) openDetails(detailBtn.getAttribute('data-detail'));
      if (dlBtn) downloadFile(dlBtn.getAttribute('data-download'));
    });
  }

  /* ---------- فتح تفاصيل + تنزيل ---------- */
  function openDetails(id) {
    const f = Store.get(id);
    if (!f) {
      toast('الملف غير موجود بعد الآن', 'error');
      return;
    }
    const subj = mjSubject(f.subject);
    const term = mjTerm(f.term);
    const type = mjType(f.type);
    const year = mjYear(f.year);
    const stIcon = extStyle(f);
    const hasBlob = Store.hasSessionBlob(id);
    const canPreviewLive = Store.isLive() && f.hasRealFile;

    let previewBtn;
    if (canPreviewLive) {
      previewBtn = '<button type="button" class="mj-secondary-btn" data-preview-live="' + escapeHtml(id) + '" style="border-color:var(--mj-line);color:var(--mj-green-700)">🖥️ معاينة الملف الحقيقي</button>';
    } else if (!f.sample && hasBlob) {
      previewBtn = '<button type="button" class="mj-secondary-btn" data-preview-session="' + escapeHtml(id) + '" style="border-color:var(--mj-line);color:var(--mj-green-700)">🖥️ معاينة الملف المرفوع (هذه الجلسة)</button>';
    } else {
      previewBtn = '<button type="button" class="mj-secondary-btn" data-preview-note="' + escapeHtml(id) + '" style="border-color:var(--mj-line);color:var(--mj-muted)">👁️ معاينة</button>';
    }

    let trialNote;
    if (canPreviewLive) {
      trialNote = 'يمكنك معاينة وتنزيل هذا الملف الحقيقي من قاعدة البيانات.';
    } else if (Store.isLive()) {
      trialNote = 'هذا الملف وصفي بلا محتوى مرفوع في القاعدة حالياً — سيُولّد النظام نموذجاً نصياً عند التنزيل.';
    } else {
      trialNote = 'هذه نسخة تجريبية: الملفات الوصفية لا تحتوي محتوى حقيقياً قابلاً للتنزيل — سيولّد النظام ملفاً نصياً تجريبياً عند الضغط على التنزيل.';
    }

    $('#detailsTitle').textContent = 'تفاصيل الملف';
    $('#detailsBody').innerHTML =
      '<div class="mj-details-hero">' +
        '<span class="mj-file-ic" style="background:' + stIcon.color + '">' + stIcon.icon + '</span>' +
        '<div>' +
          '<h3 class="mj-details-title">' + escapeHtml(f.title) + '</h3>' +
          '<span class="mj-file-status ' + CFG.statuses[f.status].className + '">' + escapeHtml(CFG.statuses[f.status].label) + '</span>' +
        '</div>' +
      '</div>' +
      '<p class="mj-details-desc">' + escapeHtml(f.description || 'لا يوجد وصف.') + '</p>' +
      '<div class="mj-details-grid">' +
        detailItem('المادة', subj ? subj.icon + ' ' + subj.label : '—') +
        detailItem('السنة', year ? year.label : '—') +
        detailItem('الفصل', term ? term.label : '—') +
        detailItem('نوع الملف', type ? type.label : '—') +
        detailItem('الامتداد', stIcon.label) +
        detailItem('الحجم', formatSize(f.size)) +
        detailItem('رفعه', f.uploader) +
        detailItem('تاريخ الرفع', formatDate(f.uploadedAt)) +
        detailItem('التنزيلات', formatNum(f.downloads)) +
        detailItem('المراجعة', CFG.statuses[f.status].label) +
      '</div>' +
      (f.note ? '<p class="mj-note" style="border-color:#fecdd3;background:var(--mj-danger-bg);color:var(--mj-danger)">ملاحظة الإدارة: ' + escapeHtml(f.note) + '</p>' : '') +
      '<div class="mj-details-actions">' +
        '<button type="button" class="mj-upload-btn" data-download="' + escapeHtml(id) + '">⬇️ تنزيل الملف</button>' +
        previewBtn +
        '<button type="button" class="mj-mini-btn danger" data-report="' + escapeHtml(id) + '">🚩 الإبلاغ عن ملف</button>' +
      '</div>' +
      '<p class="mj-note" style="margin-top:14px">' + escapeHtml(trialNote) + '</p>';

    openModal('detailsModal');
  }

  function detailItem(label, value) {
    return '<div class="mj-details-item"><span>' + escapeHtml(label) + '</span><strong>' + (value === '—' ? '—' : value) + '</strong></div>';
  }

  const reportedIds = new Set();

  function bindDetailsBody() {
    $('#detailsBody').addEventListener('click', (e) => {
      const dl = e.target.closest('[data-download]');
      const preview = e.target.closest('[data-preview-session]');
      const previewLive = e.target.closest('[data-preview-live]');
      const previewNote = e.target.closest('[data-preview-note]');
      const report = e.target.closest('[data-report]');

      if (dl) downloadFile(dl.getAttribute('data-download'));
      if (previewLive) previewLiveFile(previewLive.getAttribute('data-preview-live'));
      if (preview) previewUploaded(preview.getAttribute('data-preview-session'));
      if (previewNote) {
        toast('لا يوجد محتوى فعلي للمعاينة — هذا الملف وصفي فقط.', 'warn');
      }
      if (report) {
        const id = report.getAttribute('data-report');
        if (reportedIds.has(id)) {
          toast('تم الإبلاغ عن هذا الملف مسبقاً في هذه الجلسة.', 'info');
          return;
        }
        reportedIds.add(id);
        Store.reportFile(id, 'بلاغ من زائر').then((ok) => {
          toast(ok ? 'تم استلام بلاغك وسيراجعه المشرف.' : 'تعذّر إرسال البلاغ إلى القاعدة.', ok ? 'success' : 'error');
        });
      }
    });
  }

  function previewUploaded(id) {
    const blob = Store.getSessionBlob(id);
    if (!blob) {
      toast('المحتوى غير متاح (يعمل فقط داخل نفس الجلسة).', 'warn');
      return;
    }
    openBlobInViewer(blob, 'application/pdf');
  }

  async function previewLiveFile(id) {
    const f = Store.get(id);
    if (!f || !f.hasRealFile) {
      toast('لا يوجد محتوى حقيقي للمعاينة.', 'warn');
      return;
    }
    const blob = await Store.fetchRealBlob(f);
    if (!blob) {
      toast('تعذّر جلب الملف من الخادم للمعاينة.', 'warn');
      return;
    }
    openBlobInViewer(blob, f.ext);
  }

  function openBlobInViewer(blob, ext) {
    const url = URL.createObjectURL(blob);
    const isPdf = (blob && blob.type === 'application/pdf') || String(ext) === 'pdf';
    if (isPdf) {
      window.open(url, '_blank');
    } else {
      const w = window.open('', '_blank');
      if (w) {
        w.document.write('<meta charset="utf-8"><title>معاينة — مكتبة مدارك</title><body style="margin:0;background:#f0fdfa"><img src="' + url + '" style="max-width:100%;height:auto;display:block;margin:0 auto"></body>');
      }
    }
  }

  /** توليد ملف نصي تجريبي واضح بدل الادعاء بوجود ملف قابل للتنزيل. */
  function makeTrialBlob(f) {
    const lines = [
      '==================================================',
      '  مكتبة مدارك — نموذج وصفي (لا يوجد محتوى حقيقي)',
      '==================================================',
      '',
      'العنوان : ' + f.title,
      'الوصف   : ' + f.description,
      'المادة  : ' + (mjSubject(f.subject) ? mjSubject(f.subject).label : '—'),
      'السنة   : ' + (mjYear(f.year) ? mjYear(f.year).label : '—'),
      'الفصل   : ' + (mjTerm(f.term) ? mjTerm(f.term).label : '—'),
      'النوع   : ' + (mjType(f.type) ? mjType(f.type).label : '—'),
      'رافعه   : ' + f.uploader,
      'الحالة  : ' + CFG.statuses[f.status].label,
      '',
      'ملاحظة: هذا الملف وصفي فقط ولا يحتوي محتوى دراسياً حقيقياً.',
      Store.isLive()
        ? 'المحتوى الحقيقي للملفات المرفوعة يُخزَّن في القاعدة ويُحمَّل مباشرة.'
        : 'انشئ داخل النسخة التجريبية — عند ربط القسم بقاعدة البيانات سيُرفق الملف الفعلي هنا.',
      '',
      'شكراً لتجربة مكتبة مدارك 💚',
    ];
    return new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function safeFilename(title, ext) {
    const base = String(title || 'ملف').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
    return base + '.' + (ext || 'txt');
  }

  async function downloadFile(id) {
    const f = Store.get(id);
    if (!f) {
      toast('الملف غير موجود.', 'error');
      return;
    }
    const path = f.storagePath;
    const real = f.hasRealFile;

    // تفعيل عدّاد التنزيل (يؤثر على القاعدة في الوضع الحي).
    try { await Store.incrementDownload(id); } catch (e) { /* العداد اختياري */ }
    renderStats();
    renderFiles();

    // ملف حقيقي في القاعدة — ننزّله فعلياً.
    if (Store.isLive() && real && path) {
      const fresh = Store.get(id);
      const blob = await Store.fetchRealBlob(fresh && fresh.storagePath ? fresh : f);
      if (blob) {
        downloadBlob(blob, safeFilename(f.title, f.ext));
        toast('تم تنزيل الملف الحقيقي من قاعدة البيانات ✅', 'success');
        return;
      }
      toast('تعذّر جلب الملف من الخادم.', 'warn');
    }

    // محتوى مرفوع في نفس الجلسة (وضع التجربة فقط).
    const sessionBlob = Store.getSessionBlob(id);
    if (!f.sample && sessionBlob) {
      downloadBlob(sessionBlob, safeFilename(f.title, f.ext));
      toast('تم تنزيل الملف المرفوع (نسخة هذه الجلسة).', 'success');
      return;
    }

    // ملف وصفي لا يحتوي محتوى — نموذج نصي بصراحة.
    downloadBlob(makeTrialBlob(f), safeFilename(f.title, 'txt'));
    toast(Store.isLive() ? 'هذا الملف وصفي بلا محتوى حقيقي في القاعدة.' : 'تم توليد ملف نصي تجريبي بدلاً من الملف الحقيقي.', 'info');
  }

  /* ---------- الفلاتر ---------- */
  function bindFilters() {
    $('#filterYear').addEventListener('change', (e) => { state.year = e.target.value; state.quick = 'all'; refreshQuickTabs(); renderFiltersView(); });
    $('#filterSubject').addEventListener('change', (e) => { state.subject = e.target.value; state.quick = 'all'; refreshQuickTabs(); renderSubjects(); });
    $('#filterTerm').addEventListener('change', (e) => { state.term = e.target.value; state.quick = 'all'; refreshQuickTabs(); renderFiltersView(); });
    $('#filterType').addEventListener('change', (e) => { state.type = e.target.value; state.quick = 'all'; refreshQuickTabs(); renderFiltersView(); });
    $('#filterSort').addEventListener('change', (e) => { state.sort = e.target.value; state.quick = 'all'; refreshQuickTabs(); renderFiltersView(); });

    $('#resetFilters').addEventListener('click', resetAllFilters);
    $('#emptyReset').addEventListener('click', resetAllFilters);
    $('#clearSubjectBtn').addEventListener('click', () => {
      state.subject = '';
      $('#filterSubject').value = '';
      renderSubjects();
      renderFiltersView();
    });

    $$('.mj-quick-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.quick = tab.getAttribute('data-quick');
        refreshQuickTabs();
        renderFiltersView();
      });
    });
  }

  function refreshQuickTabs() {
    $$('.mj-quick-tab').forEach((tab) => {
      tab.classList.toggle('is-active', tab.getAttribute('data-quick') === state.quick);
    });
  }

  function renderFiltersView() {
    renderStats();
    renderFiles();
  }

  function resetAllFilters() {
    state.q = '';
    state.year = '';
    state.subject = '';
    state.term = '';
    state.type = '';
    state.sort = 'newest';
    state.quick = 'all';
    $('#searchInput').value = '';
    $('#filterYear').value = '';
    $('#filterSubject').value = '';
    $('#filterTerm').value = '';
    $('#filterType').value = '';
    $('#filterSort').value = 'newest';
    refreshQuickTabs();
    renderSubjects();
    renderFiltersView();
    toast('تمت إعادة ضبط الفلاتر.', 'info');
  }

  /* ---------- البحث ---------- */
  function bindSearch() {
    $('#searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      state.q = $('#searchInput').value;
      state.quick = 'all';
      refreshQuickTabs();
      renderFiles();
      $('#filesSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------- الرفع ---------- */
  let selectedFile = null;

  function bindUpload() {
    $('#openUploadTop').addEventListener('click', openUploadModal);
    $('#openUploadHero').addEventListener('click', openUploadModal);

    const dropzone = $('#dropzone');
    const input = $('#fileInput');

    dropzone.addEventListener('click', () => input.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      if (e.dataTransfer.files.length) handleFileChoose(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => {
      if (input.files.length) handleFileChoose(input.files[0]);
      input.value = '';
    });

    $('#clearFileBtn').addEventListener('click', () => { selectedFile = null; renderSelectedFile(); });

    $('#uploadForm').addEventListener('submit', onSubmitUpload);
  }

  function openUploadModal() {
    selectedFile = null;
    $('#fileInput').value = '';
    $('#upTitle').value = '';
    $('#upDesc').value = '';
    $('#upYear').value = '';
    $('#upSubject').value = '';
    $('#upTerm').value = '';
    $('#upType').value = '';
    $('#upUploader').value = '';
    $('#uploadError').hidden = true;
    $('#uploadProgress').hidden = true;
    setProgress(0);
    $('#uploadSubmit').disabled = false;
    renderSelectedFile();
    openModal('uploadModal');
  }

  function handleFileChoose(file) {
    const err = validateFile(file);
    if (err) {
      selectedFile = null;
      renderSelectedFile();
      showUploadError(err);
      return;
    }
    hideUploadError();
    selectedFile = file;
    renderSelectedFile();
  }

  function validateFile(file) {
    if (!file) return 'الرجاء اختيار ملف أولاً.';
    const name = (file.name || '').toLowerCase();
    const ext = name.split('.').pop();
    const rules = CFG.upload;
    if (!rules.allowedExt.includes(ext)) {
      return 'الامتداد غير مسموح: .' + ext + ' — يُسمح فقط بملفات PDF و JPG و PNG.';
    }
    if (!rules.allowedMime.includes(file.type)) {
      return 'نوع الملف غير مدعوم (تم رفضه بصيغته الفعلية).';
    }
    if (file.size > rules.maxBytes) {
      return 'حجم الملف يتجاوز الحد المسموح (' + formatSize(CFG.upload.maxBytes) + ') — حجم الملف: ' + formatSize(file.size) + '.';
    }
    return null;
  }

  function renderSelectedFile() {
    const box = $('#selectedFile');
    if (!selectedFile) {
      box.hidden = true;
      $('#dropzoneText').textContent = 'اضغط لاختيار ملف أو اسحبه إلى هنا';
      return;
    }
    box.hidden = false;
    const ext = (selectedFile.name || '').split('.').pop().toLowerCase();
    $('#selectedIcon').textContent = EXT_ICONS[ext] || '📄';
    $('#selectedName').textContent = selectedFile.name;
    $('#selectedInfo').textContent = formatSize(selectedFile.size) + ' · ' + ext.toUpperCase();
    $('#dropzoneText').textContent = 'تم اختيار الملف ✅';
  }

  function showUploadError(msg) {
    const el = $('#uploadError');
    el.textContent = '⚠️ ' + msg;
    el.hidden = false;
  }
  function hideUploadError() {
    $('#uploadError').hidden = true;
  }

  function setProgress(pct) {
    $('#uploadProgressBar').style.width = pct + '%';
    $('#uploadProgressLabel').textContent = Math.round(pct) + '%';
  }

  function onSubmitUpload(e) {
    e.preventDefault();
    hideUploadError();

    const title = $('#upTitle').value.trim();
    const desc = $('#upDesc').value.trim();
    const year = $('#upYear').value;
    const subject = $('#upSubject').value;
    const term = $('#upTerm').value;
    const type = $('#upType').value;

    if (!selectedFile) { showUploadError('اختر ملفاً أولاً (PDF أو JPG أو PNG).'); return; }
    if (!title) { showUploadError('أدخل عنوان الملف.'); return; }
    if (!desc) { showUploadError('أدخل وصفاً مختصراً للملف.'); return; }
    if (!year) { showUploadError('اختر السنة الدراسية.'); return; }
    if (!subject) { showUploadError('اختر المادة.'); return; }
    if (!term) { showUploadError('اختر الفصل.'); return; }
    if (!type) { showUploadError('اختر نوع الملف.'); return; }

    const err = validateFile(selectedFile);
    if (err) { showUploadError(err); return; }

    const btn = $('#uploadSubmit');
    btn.disabled = true;

    const meta = {
      title,
      description: desc,
      year,
      subject,
      term,
      type,
      ext: (selectedFile.name || '').split('.').pop().toLowerCase(),
      size: selectedFile.size,
      uploader: $('#upUploader').value.trim() || 'مستخدم مجهول',
    };

    $('#uploadProgress').hidden = false;
    setProgress(2);

    if (Store.isLive()) {
      doLiveUpload(meta, btn);
    } else {
      doTrialUpload(meta, btn);
    }
  }

  async function doLiveUpload(meta, btn) {
    try {
      await Store.addFile(meta, {
        file: selectedFile,
        onProgress: setProgress,
      });
      setProgress(100);
      closeModal('uploadModal');
      toast('تم رفع الملف إلى القاعدة بنجاح ✅ — بانتظار مراجعة المشرف.', 'success');
      renderStats();
      renderFiles();
      selectedFile = null;
    } catch (upErr) {
      showUploadError(upErr && upErr.friendly ? upErr.message : 'تعذّر رفع الملف إلى القاعدة.');
    } finally {
      $('#uploadProgress').hidden = true;
      btn.disabled = false;
    }
  }

  function doTrialUpload(meta, btn) {
    const timer = setInterval(async () => {
      const bar = $('#uploadProgressBar');
      const cur = parseFloat(bar.style.width) || 0;
      const next = Math.min(cur + Math.random() * 22 + 6, 99);
      setProgress(next);
      if (next >= 99) {
        clearInterval(timer);
        const file = await Store.addFile(meta);
        Store.attachSessionBlob(file && file.id, selectedFile);
        setProgress(100);
        setTimeout(() => {
          closeModal('uploadModal');
          toast('تم إرسال الملف للمراجعة ✅ — سيظهر في لوحة الإدارة.', 'success');
          renderStats();
          renderFiles();
          selectedFile = null;
          btn.disabled = false;
          $('#uploadProgress').hidden = true;
        }, 350);
      }
    }, 120);
  }

  /* ---------- وضع النسخة (نصوص تتبدل حسب Live/Trial) ---------- */
  function applyModeCopy() {
    const live = Store.isLive();
    const set = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    if (live) {
      set('bannerText', Store.isEnabled()
        ? 'وضع مباشر — الملفات تُقرأ وتُرفع إلى قاعدة بيانات المكتبة، وتظهر بعد اعتماد المشرف.'
        : '⚠️ المكتبة غير مفعّلة: لا تظهر الملفات للزوار. فعّلها من لوحة الإدارة.');
      set('uploadNote', 'سيُرفع ملفك فوراً إلى قاعدة بيانات المكتبة بحالة «قيد المراجعة» حتى يعتمده المشرف. يُسمح فقط بـ PDF و JPG و PNG بحد أقصى 10MB.');
      set('adminNote', 'أدخل رمز الإدارة للوصول إلى اللوحة. الرمز الافتراضي 3330116 وهو مخزّن في قاعدة البيانات.');
      set('footerNote', 'النسخة المباشرة — البيانات مربوطة بقاعدة بيانات Supabase.');
      const adminBtn = $('#openAdmin');
      if (adminBtn) adminBtn.title = 'لوحة الإدارة';
    } else {
      set('bannerText', 'نسخة تجريبية محلية — الملفات والبيانات وهمية ولا تُرفع إلى أي خادم.');
      set('uploadNote', 'وضع تجريبي: يُسمح بملفات PDF و JPG و PNG فقط، بحد أقصى 10 ميغابايت. لن يُرفع الملف إلى أي خادم.');
      set('adminNote', 'أدخل رمز الإدارة التجريبي للوصول إلى لوحة التحكم. هذا الرمز تجريبي فقط وغير آمن للإنتاج.');
      set('footerNote', 'نسخة تجريبية محلية — غير مربوطة بقاعدة بيانات بعد.');
      const adminBtn = $('#openAdmin');
      if (adminBtn) adminBtn.title = 'لوحة الإدارة (تجريبي)';
    }

    const liveBar = $('#adminLiveBar');
    if (liveBar) liveBar.hidden = !live;
    const resetBtn = $('#adminReset');
    if (resetBtn) resetBtn.hidden = live;
    updateEnabledUI();
  }

  function updateEnabledUI() {
    const label = $('#liveModeLabel');
    const toggle = $('#adminToggleEnabled');
    if (!label || !toggle) return;
    const on = Store.isEnabled();
    if (on) {
      label.textContent = 'مفعّلة ✅ — الملفات المعتمدة ظاهرة للجميع';
      label.style.color = 'var(--mj-green-700, #14532d)';
      toggle.textContent = '⏸️ إيقاف التفعيل';
    } else {
      label.textContent = 'متوقفة ❌ — لا شيء ظاهر للزوار';
      label.style.color = 'var(--mj-danger, #b91c1c)';
      toggle.textContent = '▶️ تفعيل المكتبة للزوار';
    }
    toggle.disabled = !Store.isAdmin();
  }

  /* ---------- الإدارة ---------- */
  function bindAdmin() {
    $('#openAdmin').addEventListener('click', () => {
      if ($('#adminPanel').hidden === false) return;
      if (Store.isAdmin()) openAdminPanel();
      else openModal('adminLoginModal');
    });

    $('#adminLoginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = $('#adminCode').value;
      const errEl = $('#adminError');
      const btn = e.submitter || $('#adminLoginForm').querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        const ok = await Store.loginAdmin(code);
        if (ok) {
          errEl.hidden = true;
          $('#adminCode').value = '';
          closeModal('adminLoginModal');
          toast('مرحباً بك في لوحة الإدارة 🔑', 'success');
          openAdminPanel();
        } else {
          errEl.textContent = 'الرمز غير صحيح. حاول مجدداً.';
          errEl.hidden = false;
          toast('رمز الإدارة غير صحيح.', 'error');
        }
      } catch (err) {
        errEl.hidden = false;
        if (err && err.friendly && String(err.message) === 'ANON_DISABLED') {
          errEl.textContent = 'لا يمكن الدخول: فعّل «Allow anonymous sign-ins» من لوحة Supabase → Authentication → Sign In / Up، ثم أعد المحاولة.';
          toast('تسجيل الدخول المجهول معطّل في القاعدة.', 'error');
        } else {
          errEl.textContent = 'حدث خطأ أثناء الاتصال بقاعدة البيانات. حاول مجدداً.';
          toast('تعذّر الاتصال بقاعدة البيانات.', 'error');
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    $('#adminClose').addEventListener('click', () => {
      $('#adminPanel').hidden = true;
    });

    $('#adminLogout').addEventListener('click', async () => {
      await Store.logoutAdmin();
      $('#adminPanel').hidden = true;
      const openAdmin = $('#openAdmin');
      if (openAdmin) openAdmin.classList.remove('is-active');
      applyModeCopy();
      renderStats();
      renderFiles();
      toast('تم تسجيل الخروج من الإدارة.', 'info');
    });

    $('#adminSearch').addEventListener('input', (e) => {
      state.adminQ = e.target.value;
      renderAdminList();
    });

    $$('#adminStatusTabs .mj-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.adminStatus = chip.getAttribute('data-status');
        $$('#adminStatusTabs .mj-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
        renderAdminList();
        renderAdminStats();
      });
    });

    $('#adminReset').addEventListener('click', () => {
      askConfirm(
        'إعادة تهيئة البيانات التجريبية',
        'سيتم حذف كل ما رفعته محلياً واستعادة الملفات التجريبية الأصلية. متابعة؟',
        async () => {
          await Store.reset();
          renderAdmin();
          renderStats();
          renderFiles();
          toast('تمت إعادة تهيئة بيانات التجربة.', 'success');
        }
      );
    });

    $('#adminExport').addEventListener('click', () => {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, CFG.exportName);
      toast('تم تصدير بيانات المكتبة (JSON).', 'success');
    });

    const toggle = $('#adminToggleEnabled');
    if (toggle) {
      toggle.addEventListener('click', async () => {
        const target = !Store.isEnabled();
        const ok = await Store.setLibraryEnabled(target);
        if (ok) {
          toast(target ? 'تم تفعيل المكتبة — أصبحت الملفات المعتمدة ظاهرة للجميع.' : 'تم إيقاف المكتبة — المحتوى مخفي الآن.', 'success');
        } else {
          toast('تعذّر تغيير حالة المكتبة (تأكد أنك أدمن في النسخة المباشرة).', 'error');
        }
        applyModeCopy();
        renderAdmin();
        renderStats();
        renderFiles();
      });
    }
  }

  function openAdminPanel() {
    renderAdminStats();
    renderAdminList();
    updateEnabledUI();
    $('#adminPanel').hidden = false;
    const openAdmin = $('#openAdmin');
    if (openAdmin) openAdmin.classList.add('is-active');
  }

  function renderAdminStats() {
    const s = Store.stats();
    $('#adminStats').innerHTML =
      '<div class="mj-admin-stat total"><div class="num">' + formatNum(s.total) + '</div><div class="lbl">إجمالي الملفات</div></div>' +
      '<div class="mj-admin-stat pending"><div class="num">' + formatNum(s.pending) + '</div><div class="lbl">قيد المراجعة</div></div>' +
      '<div class="mj-admin-stat approved"><div class="num">' + formatNum(s.approved) + '</div><div class="lbl">معتمد</div></div>' +
      '<div class="mj-admin-stat rejected"><div class="num">' + formatNum(s.rejected) + '</div><div class="lbl">مرفوض</div></div>';
  }

  function adminRow(f) {
    const subj = mjSubject(f.subject);
    const stIcon = extStyle(f);
    const st = CFG.statuses[f.status];

    const buttons = [];
    if (f.status !== 'approved') {
      buttons.push('<button type="button" class="mj-mini-btn primary" data-admin-approve="' + escapeHtml(f.id) + '">✔️ اعتماد</button>');
    }
    if (f.status !== 'rejected') {
      buttons.push('<button type="button" class="mj-mini-btn" data-admin-reject="' + escapeHtml(f.id) + '" style="color:#b45309">📛 رفض</button>');
    }
    if (f.status === 'approved' || f.status === 'rejected') {
      buttons.push('<button type="button" class="mj-mini-btn" data-admin-pending="' + escapeHtml(f.id) + '">↩️ إعادة للمراجعة</button>');
    }
    buttons.push('<button type="button" class="mj-mini-btn danger" data-admin-delete="' + escapeHtml(f.id) + '">🗑️ حذف</button>');
    buttons.push('<button type="button" class="mj-mini-btn" data-admin-detail="' + escapeHtml(f.id) + '">👁️ عرض</button>');
    if (Store.isLive() && f.hasRealFile) {
      buttons.push('<button type="button" class="mj-mini-btn" data-admin-preview="' + escapeHtml(f.id) + '" style="color:var(--mj-green-700)">🖥️ معاينة</button>');
    }

    return (
      '<div class="mj-admin-row" data-id="' + escapeHtml(f.id) + '">' +
        '<span class="mj-file-ic" style="background:' + stIcon.color + '">' + stIcon.icon + '</span>' +
        '<div class="mj-admin-row-main">' +
          '<p class="mj-admin-row-title">' + escapeHtml(f.title) + '</p>' +
          '<div class="mj-admin-row-sub">' +
            '<span>' + (subj ? escapeHtml(subj.label) : '—') + '</span>' +
            '<span>' + escapeHtml((mjYear(f.year) || { label: '—' }).label) + ' · ' + escapeHtml((mjTerm(f.term) || { label: '—' }).label) + '</span>' +
            '<span>⬇️ ' + formatNum(f.downloads) + '</span>' +
            '<span>📅 ' + escapeHtml(formatDate(f.uploadedAt)) + '</span>' +
            '<span class="mj-file-status ' + st.className + '">' + escapeHtml(st.label) + '</span>' +
            (f.note ? '<span style="color:var(--mj-danger)">' + escapeHtml(f.note) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="mj-admin-row-actions">' + buttons.join('') + '</div>' +
      '</div>'
    );
  }

  function renderAdminList() {
    const list = $('#adminList');
    const q = state.adminQ.trim();
    const rows = Store.query({
      q: q,
      status: state.adminStatus,
      sort: 'newest',
    });

    if (rows.length === 0) {
      list.innerHTML =
        '<div class="mj-empty">' +
          '<div class="mj-empty-icon">📭</div>' +
          '<h3>لا توجد ملفات هنا</h3>' +
          '<p>جرّب تغيير البحث أو التصنيف، أو ارفع ملفات جديدة من المكتبة العامة.</p>' +
        '</div>';
      return;
    }
    list.innerHTML = rows.map(adminRow).join('');
  }

  function renderAdmin() {
    if ($('#adminPanel').hidden) return;
    renderAdminStats();
    renderAdminList();
    updateEnabledUI();
  }

  function bindAdminList() {
    $('#adminList').addEventListener('click', (e) => {
      const approve = e.target.closest('[data-admin-approve]');
      const reject = e.target.closest('[data-admin-reject]');
      const pending = e.target.closest('[data-admin-pending]');
      const del = e.target.closest('[data-admin-delete]');
      const detail = e.target.closest('[data-admin-detail]');
      const preview = e.target.closest('[data-admin-preview]');

      if (approve) adminSetStatus(approve.getAttribute('data-admin-approve'), 'approved');
      if (reject) adminSetStatus(reject.getAttribute('data-admin-reject'), 'rejected');
      if (pending) adminSetStatus(pending.getAttribute('data-admin-pending'), 'pending');
      if (del) adminAskDelete(del.getAttribute('data-admin-delete'));
      if (detail) openDetails(detail.getAttribute('data-admin-detail'));
      if (preview) previewLiveFile(preview.getAttribute('data-admin-preview'));
    });
  }

  async function adminSetStatus(id, status) {
    const file = Store.get(id);
    if (!file) { toast('الملف غير موجود.', 'error'); return; }
    const updated = await Store.updateStatus(id, status);
    const labels = { approved: 'اعتمد الملف', rejected: 'رُفض الملف', pending: 'أُعيد الملف للمراجعة' };
    if (updated) toast(labels[status] + ' ✅', 'success');
    else toast('تعذّر تحديث الحالة في القاعدة.', 'error');
    renderAdmin();
    renderStats();
    renderFiles();
  }

  function adminAskDelete(id) {
    const file = Store.get(id);
    if (!file) { toast('الملف غير موجود.', 'error'); return; }
    pendingDeleteId = id;
    $('#confirmTitle').textContent = 'تأكيد الحذف';
    $('#confirmText').textContent = 'هل تريد بالتأكيد حذف «' + file.title + '»؟ لا يمكن التراجع عن الحذف.';
    openModal('confirmModal');
  }

  /* ---------- تأكيد عام ---------- */
  let confirmAction = null;
  function askConfirm(title, text, fn) {
    confirmAction = fn;
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    openModal('confirmModal');
  }

  function bindConfirmGeneral() {
    $('#confirmDelete').addEventListener('click', async () => {
      if (pendingDeleteId) {
        const ok = await Store.removeFile(pendingDeleteId);
        pendingDeleteId = null;
        closeModal('confirmModal');
        toast(ok ? 'تم حذف الملف 🗑️' : 'تعذّر حذف الملف من القاعدة.', ok ? 'success' : 'error');
        renderAdmin();
        renderStats();
        renderFiles();
        return;
      }
      if (typeof confirmAction === 'function') {
        const fn = confirmAction;
        confirmAction = null;
        closeModal('confirmModal');
        fn();
      }
    });
  }

  /* ---------- أحداث عامة ---------- */
  function bindMisc() {
    $('#trialClose').addEventListener('click', () => {
      $('#trialClose').closest('.trial-banner').remove();
    });

    $('#scrollToFilesBtn').addEventListener('click', () => {
      $('#filesSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------- بدء التشغيل ---------- */
  async function init() {
    await Store.init();
    applyModeCopy();

    populateSelects();
    renderSubjects();
    renderStats();
    renderFiles();
    refreshQuickTabs();

    bindFilesGrid();
    bindDetailsBody();
    bindFilters();
    bindSearch();
    bindUpload();
    bindAdmin();
    bindAdminList();
    bindConfirmGeneral();
    bindMisc();

    const live = Store.isLive();
    if (live && Store.getError()) {
      setTimeout(() => {
        toast('تعذّر الوصول إلى قاعدة البيانات — تحقق من الاتصال أو من تنفيذ الـ migration.', 'error');
      }, 700);
    }
    if (live && Store.isMissingRpc()) {
      setTimeout(() => {
        toast('ينبغي تشغيل تحديث SQL الإضافي لمكتبة مدارك (دالة maktabet_is_admin) لدخول الإدارة.', 'warn');
      }, 1300);
    }

    setTimeout(() => {
      toast(live ? 'أهلاً بك في مكتبة مدارك — النسخة المباشرة 💚' : 'أهلاً بك في مكتبة مدارك — نسخة تجريبية محلية 💚', 'info');
      if (live && !Store.isEnabled()) {
        toast('المكتبة غير مفعّلة حالياً — المحتوى مخفي عن الزوار. فعّلها من لوحة الإدارة.', 'warn');
      }
    }, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();