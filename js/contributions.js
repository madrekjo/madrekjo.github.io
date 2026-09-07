(function () {
  'use strict';

  var SUPABASE_URL = 'https://njdvogvquzofnqqwyvyl.supabase.co';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZHZvZ3ZxdXpvZm5xcXd5dnlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxOTIyODQsImV4cCI6MjEwMzc2ODI4NH0.a0zbP1xm8rFuoTFSvbscdWo7HPZR2a9Dq3DEtZf_ua4';
  var TOKEN_KEY = 'ajr_author_token';

  var container = document.getElementById('ajrContributions');
  if (!container) return;

  var params = new URLSearchParams(window.location.search);
  var fieldName = (document.body.dataset && document.body.dataset.field) || '';
  var elective = params.get('elective');
  var major = params.get('major');

  var STYLE = '\n' +
    '.ajr-widget{box-sizing:border-box;width:min(92vw,760px);margin:10px auto 56px;background:var(--surface,#0f1a2e);border:1px solid var(--border,rgba(38,198,218,.18));border-radius:18px;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.35);direction:rtl;text-align:right;font-family:"Cairo","Tajawal",sans-serif;color:var(--text,#e0edf5)}\n' +
    '.ajr-widget *{box-sizing:border-box}\n' +
    '.ajr-title{font-size:1.25rem;font-weight:900;color:var(--gold,#26c6da);display:flex;align-items:center;gap:8px}\n' +
    '.ajr-sub{font-size:.85rem;color:var(--muted,#7a9aaa);margin:4px 0 14px;line-height:1.8}\n' +
    '.ajr-context{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}\n' +
    '.ajr-ctx-pill{font-size:.72rem;padding:3px 10px;border-radius:999px;background:var(--field-accent-dim,rgba(38,198,218,.1));border:1px solid var(--field-accent-border,rgba(38,198,218,.25));color:var(--gold,#26c6da)}\n' +
    '.ajr-tabs{display:flex;gap:8px;margin-bottom:10px}\n' +
    '.ajr-tab{flex:1;padding:9px;border-radius:12px;border:1px solid var(--border,rgba(38,198,218,.2));background:rgba(255,255,255,.02);color:var(--muted,#7a9aaa);font-family:inherit;font-size:.9rem;font-weight:700;cursor:pointer;transition:all .15s}\n' +
    '.ajr-tab.active{background:var(--field-accent-dim,rgba(38,198,218,.14));border-color:var(--gold,#26c6da);color:var(--gold,#26c6da)}\n' +
    '.ajr-row{display:flex;gap:8px;margin-bottom:10px}\n' +
    '.ajr-name{flex:1;min-width:0;padding:10px 12px;border-radius:12px;border:1px solid var(--border,rgba(38,198,218,.2));background:rgba(255,255,255,.03);color:var(--text,#e0edf5);font-family:inherit;font-size:.9rem;outline:none}\n' +
    '.ajr-name:focus,.ajr-content:focus{border-color:var(--gold,#26c6da)}\n' +
    '.ajr-content{width:100%;min-height:96px;padding:12px;border-radius:12px;border:1px solid var(--border,rgba(38,198,218,.2));background:rgba(255,255,255,.03);color:var(--text,#e0edf5);font-family:inherit;font-size:.95rem;line-height:1.9;resize:vertical;outline:none}\n' +
    '.ajr-submit{padding:0 20px;border-radius:12px;border:none;background:var(--gold,#26c6da);background:linear-gradient(135deg,var(--gold,#26c6da),var(--gold-dark,#00acc1));;color:#0a1420;color:#081018;font-family:inherit;font-weight:900;font-size:.9rem;cursor:pointer;white-space:nowrap}\n' +
    '.ajr-submit:disabled{opacity:.5;cursor:not-allowed}\n' +
    '.ajr-status{font-size:.82rem;margin-top:8px;min-height:1em;color:var(--accent,#69f0ae)}\n' +
    '.ajr-status.err{color:#ff6b6b}\n' +
    '.ajr-feed-title{font-size:.95rem;font-weight:800;margin:20px 0 12px;display:flex;align-items:center;gap:6px}\n' +
    '.ajr-feed{display:flex;flex-direction:column;gap:10px}\n' +
    '.ajr-item{background:rgba(255,255,255,.03);border:1px solid var(--border,rgba(38,198,218,.14));border-radius:14px;padding:14px 16px}\n' +
    '.ajr-item-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap}\n' +
    '.ajr-item-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n' +
    '.ajr-badge{font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:999px}\n' +
    '.ajr-badge.dua{background:var(--field-accent-dim,rgba(38,198,218,.12));color:var(--gold,#26c6da);border:1px solid var(--field-accent-border,rgba(38,198,218,.3))}\n' +
    '.ajr-badge.ayah{background:rgba(255,255,255,.12);background:rgba(201,168,76,.12);color:#C9A84C;border:1px solid rgba(201,168,76,.3)}\n' +
    '.ajr-item-name{font-size:.78rem;color:var(--muted,#7a9aaa)}\n' +
    '.ajr-item-time{font-size:.7rem;color:var(--muted,#7a9aaa);opacity:.75}\n' +
    '.ajr-copy{font-size:.72rem;padding:4px 12px;border-radius:999px;border:1px solid var(--field-accent-border,rgba(38,198,218,.3));background:transparent;color:var(--gold,#26c6da);cursor:pointer;font-family:inherit;font-weight:700}\n' +
    '.ajr-copy.done{color:#69f0ae;border-color:rgba(105,240,174,.4)}\n' +
    '.ajr-item-content{white-space:pre-wrap;word-break:break-word;font-size:.98rem;line-height:2;color:var(--text,#e0edf5)}\n' +
    '.ajr-item.ayah .ajr-item-content{font-size:1.15rem;line-height:2.2}\n' +
    '.ajr-my{box-shadow:inset 0 0 0 1px var(--gold,#26c6da)}\n' +
    '.ajr-pinned{box-shadow:inset 0 0 0 1px var(--gold,#26c6da);position:relative}\n' +
    '.ajr-pin-label{position:absolute;top:-1px;right:12px;background:var(--gold,#26c6da);color:#081018;font-size:.65rem;font-weight:900;padding:1px 8px;border-radius:0 0 8px 8px}\n' +
    '.ajr-empty{text-align:center;color:var(--muted,#7a9aaa);font-size:.85rem;padding:18px 0}\n' +
    '.ajr-loading{text-align:center;color:var(--muted,#7a9aaa);font-size:.85rem;padding:12px 0}\n' +
    '.ajr-admin-bar{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:12px;padding:8px 12px;background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.25);border-radius:12px;font-size:.78rem}\n' +
    '.ajr-admin-bar.hidden{display:none}\n' +
    '.ajr-admin-bar .ajr-admin-label{color:#C9A84C;font-weight:800}\n' +
    '.ajr-admin-btn{padding:4px 12px;border-radius:8px;border:1px solid rgba(201,168,76,.35);background:transparent;color:#C9A84C;cursor:pointer;font-family:inherit;font-size:.75rem;font-weight:700;transition:all .15s}\n' +
    '.ajr-admin-btn:hover{background:rgba(201,168,76,.15)}\n' +
    '.ajr-admin-btn.danger{color:#ff6b6b;border-color:rgba(255,107,107,.35)}\n' +
    '.ajr-admin-btn.danger:hover{background:rgba(255,107,107,.15)}\n' +
    '.ajr-admin-btn:disabled{opacity:.4;cursor:not-allowed}\n' +
    '.ajr-admin-actions{display:flex;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border,rgba(38,198,218,.12));flex-wrap:wrap}\n' +
    '.ajr-admin-login{display:none;flex-direction:column;gap:8px;padding:14px;background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.2);border-radius:12px;margin-bottom:12px}\n' +
    '.ajr-admin-login.show{display:flex}\n' +
    '.ajr-admin-login input{padding:8px 12px;border-radius:8px;border:1px solid rgba(38,198,218,.2);background:rgba(255,255,255,.03);color:var(--text,#e0edf5);font-family:inherit;font-size:.85rem;direction:ltr;text-align:left;outline:none}\n' +
    '.ajr-admin-login input:focus{border-color:var(--gold,#26c6da)}\n' +
    '.ajr-admin-login .ajr-admin-submit{padding:8px;border-radius:8px;border:none;background:#C9A84C;color:#081018;font-family:inherit;font-weight:800;font-size:.85rem;cursor:pointer}\n' +
    '.ajr-admin-login .ajr-admin-submit:disabled{opacity:.5;cursor:not-allowed}\n' +
    '@media(max-width:520px){.ajr-row{flex-direction:column}.ajr-submit{width:100%;padding:11px}}';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getToken() {
    var k = localStorage.getItem(TOKEN_KEY);
    if (k) return k;
    k = 'ajr-' + Date.now().toString(36) + '-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
    try { localStorage.setItem(TOKEN_KEY, k); } catch (e) {}
    return k;
  }

  function timeAgo(iso) {
    if (!iso) return '';
    var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'الآن';
    var m = Math.floor(s / 60);
    if (m < 60) return 'منذ ' + m + ' دقيقة';
    var h = Math.floor(m / 60);
    if (h < 24) return 'منذ ' + h + ' ساعة';
    var d = Math.floor(h / 24);
    if (d < 30) return 'منذ ' + d + ' يوم';
    if (d < 365) return 'منذ ' + Math.floor(d / 30) + ' شهر';
    return 'منذ ' + Math.floor(d / 365) + ' سنة';
  }

  var el = {};
  var type = 'dua';
  var isAdmin = false;
  var adminAccessToken = null;

  function build() {
    var st = document.createElement('style');
    st.textContent = STYLE;
    document.head.appendChild(st);

    container.innerHTML =
      '<div class="ajr-widget">' +
        '<div class="ajr-title">' +
          '<span>🤲 مساهماتكم</span>' +
          '<span style="flex:1"></span>' +
          '<button type="button" class="ajr-admin-btn" id="ajrAdminToggle">🔑 دخول الأدمن</button>' +
        '</div>' +
        '<div class="ajr-admin-login" id="ajrAdminLogin">' +
          '<input type="email" id="ajrAdminEmail" placeholder="البريد الإلكتروني" dir="ltr">' +
          '<input type="password" id="ajrAdminPass" placeholder="كلمة السر" dir="ltr">' +
          '<div style="display:flex;gap:6px">' +
            '<button type="button" class="ajr-admin-submit" id="ajrAdminSubmit">دخول</button>' +
            '<button type="button" class="ajr-admin-btn" id="ajrAdminCancel">إلغاء</button>' +
          '</div>' +
          '<div class="ajr-status" id="ajrAdminStatus"></div>' +
        '</div>' +
        '<div class="ajr-admin-bar hidden" id="ajrAdminBar">' +
          '<span class="ajr-admin-label">👑 وضع الإدارة مفعّل</span>' +
          '<span style="flex:1"></span>' +
          '<button type="button" class="ajr-admin-btn" id="ajrAdminLogout">خروج الأدمن</button>' +
        '</div>' +
        '<div class="ajr-sub">شارك معنا دعاءً أو آيةً لتعمّ الفائدة — بدون تسجيل دخول، والاسم اختياري.</div>' +
        '<div class="ajr-context"></div>' +
        '<div class="ajr-tabs">' +
          '<button type="button" class="ajr-tab active" data-type="dua">🤲 دعاء</button>' +
          '<button type="button" class="ajr-tab" data-type="ayah">📖 آية</button>' +
        '</div>' +
        '<div class="ajr-row">' +
          '<input class="ajr-name" maxlength="80" placeholder="اسمك (اختياري)">' +
          '<button type="button" class="ajr-submit">انشر</button>' +
        '</div>' +
        '<textarea class="ajr-content" maxlength="2000" placeholder="اكتب دعاءً تثاب عليه..."></textarea>' +
        '<div class="ajr-status"></div>' +
        '<div class="ajr-feed-title">📜 أحدث المساهمات</div>' +
        '<div class="ajr-feed"></div>' +
      '</div>';

    el.name = container.querySelector('.ajr-name');
    el.content = container.querySelector('.ajr-content');
    el.submit = container.querySelector('.ajr-submit');
    el.status = container.querySelector('.ajr-status');
    el.feed = container.querySelector('.ajr-feed');
    el.context = container.querySelector('.ajr-context');
    el.adminToggle = container.querySelector('#ajrAdminToggle');
    el.adminLogin = container.querySelector('#ajrAdminLogin');
    el.adminEmail = container.querySelector('#ajrAdminEmail');
    el.adminPass = container.querySelector('#ajrAdminPass');
    el.adminSubmitBtn = container.querySelector('#ajrAdminSubmit');
    el.adminCancelBtn = container.querySelector('#ajrAdminCancel');
    el.adminStatus = container.querySelector('#ajrAdminStatus');
    el.adminBar = container.querySelector('#ajrAdminBar');
    el.adminLogoutBtn = container.querySelector('#ajrAdminLogout');

    var savedName = params.get('name') || 'زائر';
    if (savedName && savedName !== 'زائر') {
      try { localStorage.setItem('ajr_author_name', savedName); } catch (e) {}
      el.name.value = savedName;
    } else {
      var prev = localStorage.getItem('ajr_author_name');
      if (prev) el.name.value = prev;
    }

    var ctx = [];
    if (fieldName) ctx.push('🗂️ ' + fieldName);
    if (elective) ctx.push('🎯 ' + elective);
    if (major) ctx.push('🏫 ' + major);
    el.context.innerHTML = ctx.map(function (c) { return '<span class="ajr-ctx-pill">' + esc(c) + '</span>'; }).join('');

    container.querySelectorAll('.ajr-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        type = btn.dataset.type;
        container.querySelectorAll('.ajr-tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
        el.content.placeholder = type === 'ayah' ? 'اكتب آية كريمة مع رقم سورتها...' : 'اكتب دعاءً تثاب عليه...';
      });
    });

    el.submit.addEventListener('click', submit);
    el.adminToggle.addEventListener('click', toggleAdminLogin);
    el.adminCancelBtn.addEventListener('click', function () { el.adminLogin.classList.remove('show'); });
    el.adminSubmitBtn.addEventListener('click', adminLogin);
    el.adminLogoutBtn.addEventListener('click', adminLogout);
    el.adminPass.addEventListener('keydown', function (e) { if (e.key === 'Enter') adminLogin(); });

    checkExistingSession();
    loadFeed();
  }

  function toggleAdminLogin() {
    el.adminLogin.classList.toggle('show');
    if (el.adminLogin.classList.contains('show')) {
      el.adminEmail.focus();
    }
  }

  function headers() {
    var h = {
      'apikey': ANON_KEY,
      'Authorization': 'Bearer ' + ANON_KEY,
      'Accept': 'application/json'
    };
    return h;
  }

  function adminHeaders() {
    var h = headers();
    if (adminAccessToken) {
      h['Authorization'] = 'Bearer ' + adminAccessToken;
    }
    return h;
  }

  function setAdminStatus(msg, isErr) {
    el.adminStatus.textContent = msg || '';
    el.adminStatus.className = 'ajr-status' + (isErr ? ' err' : '');
  }

  function checkExistingSession() {
    var savedToken = localStorage.getItem('ajr_admin_token');
    var savedExpiry = localStorage.getItem('ajr_admin_expiry');
    if (savedToken && savedExpiry && Date.now() < parseInt(savedExpiry, 10)) {
      adminAccessToken = savedToken;
      verifyAdmin();
    }
  }

  function verifyAdmin() {
    fetch(SUPABASE_URL + '/rest/v1/rpc/is_ajr_admin', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, adminHeaders()),
      body: JSON.stringify({})
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data === true) {
          enterAdminMode();
        } else {
          exitAdminMode();
        }
      })
      .catch(function () {
        exitAdminMode();
      });
  }

  function enterAdminMode() {
    isAdmin = true;
    el.adminBar.classList.remove('hidden');
    el.adminToggle.textContent = '🔑 تم الدخول ✓';
    el.adminToggle.style.background = 'rgba(201,168,76,.15)';
    el.adminToggle.style.borderColor = '#C9A84C';
    el.adminLogin.classList.remove('show');
    loadFeed();
  }

  function exitAdminMode() {
    isAdmin = false;
    adminAccessToken = null;
    el.adminBar.classList.add('hidden');
    el.adminToggle.textContent = '🔑 دخول الأدمن';
    el.adminToggle.style.background = '';
    el.adminToggle.style.borderColor = '';
    try {
      localStorage.removeItem('ajr_admin_token');
      localStorage.removeItem('ajr_admin_expiry');
    } catch (e) {}
    loadFeed();
  }

  function adminLogin() {
    var email = el.adminEmail.value.trim();
    var pass = el.adminPass.value;
    if (!email || !pass) return;
    el.adminSubmitBtn.disabled = true;
    setAdminStatus('⏳ جاري تسجيل الدخول...');

    fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: email, password: pass })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.access_token) {
          adminAccessToken = data.access_token;
          var expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
          try {
            localStorage.setItem('ajr_admin_token', adminAccessToken);
            localStorage.setItem('ajr_admin_expiry', String(expiresAt));
          } catch (e) {}
          return verifyAdmin();
        } else {
          setAdminStatus(data.error_description || 'بيانات الدخول غير صحيحة', true);
        }
      })
      .catch(function () {
        setAdminStatus('فشل الاتصال بالخادم', true);
      })
      .finally(function () {
        el.adminSubmitBtn.disabled = false;
      });
  }

  function adminLogout() {
    if (adminAccessToken) {
      fetch(SUPABASE_URL + '/auth/v1/logout', {
        method: 'POST',
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + adminAccessToken }
      }).catch(function () {});
    }
    exitAdminMode();
  }

  function setStatus(msg, isErr) {
    el.status.textContent = msg || '';
    el.status.className = 'ajr-status' + (isErr ? ' err' : '');
  }

  function loadFeed() {
    el.feed.innerHTML = '<div class="ajr-loading">⏳ جاري التحميل...</div>';
    var orderParam = '&order=is_pinned.desc,created_at.desc';
    fetch(SUPABASE_URL + '/rest/v1/ajr_contributions?select=id,type,content,name,created_at,is_pinned' + orderParam + '&limit=30', {
      headers: headers()
    })
      .then(function (r) { return r.json(); })
      .then(function (items) {
        if (!Array.isArray(items)) throw new Error('bad response');
        render(items);
      })
      .catch(function (err) {
        el.feed.innerHTML = '<div class="ajr-empty">تعذر تحميل المساهمات حالياً.</div>';
      });
  }

  function render(items) {
    if (!items.length) {
      el.feed.innerHTML = '<div class="ajr-empty">لا توجد مساهمات بعد — كن أول من يشارك 🌟</div>';
      return;
    }
    var token = getToken();
    el.feed.innerHTML = items.map(function (it) {
      var isMine = it.author_token && it.author_token === token;
      var label = it.type === 'ayah' ? '📖 آية' : '🤲 دعاء';
      var badgeCls = it.type === 'ayah' ? 'ayah' : 'dua';
      var name = it.name || 'مساهم مجهول';
      var contentCls = it.type === 'ayah' ? 'ayah' : '';
      var pinCls = it.is_pinned ? ' ajr-pinned' : '';
      var pinLabel = it.is_pinned ? '<div class="ajr-pin-label">📌 مثبّت</div>' : '';

      var adminActions = '';
      if (isAdmin) {
        var pinBtnLabel = it.is_pinned ? '📌 إلغاء التثبيت' : '📌 تثبيت';
        adminActions =
          '<div class="ajr-admin-actions">' +
            '<button type="button" class="ajr-admin-btn ajr-pin-btn" data-id="' + esc(it.id) + '">' + pinBtnLabel + '</button>' +
            '<button type="button" class="ajr-admin-btn danger ajr-del-btn" data-id="' + esc(it.id) + '">🗑️ حذف</button>' +
            '<button type="button" class="ajr-admin-btn danger ajr-ban-btn" data-id="' + esc(it.id) + '">⛔ حظر الجهاز</button>' +
            '<button type="button" class="ajr-admin-btn danger ajr-ban-name-btn" data-name="' + esc(it.name || '') + '">🚫 حظر الاسم</button>' +
          '</div>';
      }

      return '<div class="ajr-item ' + contentCls + (isMine ? ' ajr-my' : '') + pinCls + '">' +
        pinLabel +
        '<div class="ajr-item-head">' +
          '<div class="ajr-item-left">' +
            '<span class="ajr-badge ' + badgeCls + '">' + label + '</span>' +
            '<span class="ajr-item-name">' + esc(name) + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<button type="button" class="ajr-copy" data-copy="' + esc(it.id) + '">نسخ</button>' +
            '<span class="ajr-item-time">' + timeAgo(it.created_at) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="ajr-item-content">' + esc(it.content) + '</div>' +
        adminActions +
      '</div>';
    }).join('');

    el.feed.querySelectorAll('.ajr-copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = items.filter(function (it) { return String(it.id) === btn.dataset.copy; })[0];
        if (!item) return;
        var copyText = (item.type === 'ayah' ? 'آية: ' : 'دعاء: ') + item.content + (item.name ? '\n— ' + item.name : '');
        var done = function () {
          btn.classList.add('done');
          btn.textContent = '✓ تم';
          setTimeout(function () { btn.classList.remove('done'); btn.textContent = 'نسخ'; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(copyText).then(done, done);
        } else {
          var ta = document.createElement('textarea');
          ta.value = copyText;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(ta);
          done();
        }
      });
    });

    if (isAdmin) {
      el.feed.querySelectorAll('.ajr-pin-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { adminPin(btn.dataset.id); });
      });
      el.feed.querySelectorAll('.ajr-del-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { adminDelete(btn.dataset.id); });
      });
      el.feed.querySelectorAll('.ajr-ban-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { adminBanAuthor(btn.dataset.id); });
      });
      el.feed.querySelectorAll('.ajr-ban-name-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { adminBanName(btn.dataset.name); });
      });
    }
  }

  function adminRpc(rpcName, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + rpcName, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, adminHeaders()),
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  function adminPin(id) {
    adminRpc('admin_toggle_pin', { p_id: id })
      .then(function (res) {
        if (Array.isArray(res) && res[0]) {
          if (res[0].success) { loadFeed(); }
          else { alert(res[0].message || 'فشلت العملية'); }
        }
      })
      .catch(function () { alert('فشلت العملية'); });
  }

  function adminDelete(id) {
    if (!confirm('هل تريد حذف هذه المساهمة نهائياً؟')) return;
    adminRpc('admin_delete_contribution', { p_id: id })
      .then(function (res) {
        if (Array.isArray(res) && res[0]) {
          if (res[0].success) { loadFeed(); }
          else { alert(res[0].message || 'فشلت العملية'); }
        }
      })
      .catch(function () { alert('فشلت العملية'); });
  }

  function adminBanAuthor(id) {
    if (!confirm('حظر جهاز هذا المرسل؟ لن يستطيع النشر بعد الآن.')) return;
    adminRpc('admin_ban_author_of', { p_id: id })
      .then(function (res) {
        if (Array.isArray(res) && res[0]) {
          alert(res[0].message || (res[0].success ? 'تم الحظر' : 'فشلت العملية'));
          if (res[0].success) loadFeed();
        }
      })
      .catch(function () { alert('فشلت العملية'); });
  }

  function adminBanName(name) {
    if (!name || !name.trim()) { alert('هذه المساهمة بدون اسم'); return; }
    if (!confirm('حظر الاسم «' + name.trim() + '» من النشر؟')) return;
    adminRpc('admin_ban_name', { p_name: name.trim() })
      .then(function (res) {
        if (Array.isArray(res) && res[0]) {
          alert(res[0].message || (res[0].success ? 'تم حظر الاسم' : 'فشلت العملية'));
        }
      })
      .catch(function () { alert('فشلت العملية'); });
  }

  function submit() {
    var content = el.content.value.trim();
    if (!content) { setStatus('اكتب شيئاً أولاً 🙂', true); return; }
    el.submit.disabled = true;
    setStatus('⏳ جاري النشر...');
    fetch(SUPABASE_URL + '/rest/v1/rpc/submit_ajr_contribution', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
      body: JSON.stringify({
        p_type: type,
        p_content: content,
        p_name: el.name.value.trim() || null,
        p_author_token: getToken()
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!Array.isArray(res) || !res[0]) throw new Error('bad rpc');
        var out = res[0];
        if (out.success) {
          setStatus('✅ ' + (out.message || 'تم نشر مشاركتك'));
          el.content.value = '';
          loadFeed();
          window.scrollTo({ top: container.getBoundingClientRect().top + window.pageYOffset - 90, behavior: 'smooth' });
        } else {
          setStatus(out.message || 'تعذر النشر', true);
        }
      })
      .catch(function (err) {
        setStatus('تعذر النشر حالياً، حاول مرة أخرى', true);
      })
      .finally(function () {
        el.submit.disabled = false;
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
