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
    '.ajr-badge.ayah{background:rgba(38,198,218,.12);background:rgba(201,168,76,.12);color:#C9A84C;border:1px solid rgba(201,168,76,.3)}\n' +
    '.ajr-item-name{font-size:.78rem;color:var(--muted,#7a9aaa)}\n' +
    '.ajr-item-time{font-size:.7rem;color:var(--muted,#7a9aaa);opacity:.75}\n' +
    '.ajr-copy{font-size:.72rem;padding:4px 12px;border-radius:999px;border:1px solid var(--field-accent-border,rgba(38,198,218,.3));background:transparent;color:var(--gold,#26c6da);cursor:pointer;font-family:inherit;font-weight:700}\n' +
    '.ajr-copy.done{color:#69f0ae;border-color:rgba(105,240,174,.4)}\n' +
    '.ajr-item-content{white-space:pre-wrap;word-break:break-word;font-size:.98rem;line-height:2;color:var(--text,#e0edf5)}\n' +
    '.ajr-item.ayah .ajr-item-content{font-size:1.15rem;line-height:2.2}\n' +
    '.ajr-my{box-shadow:inset 0 0 0 1px var(--gold,#26c6da)}\n' +
    '.ajr-empty{text-align:center;color:var(--muted,#7a9aaa);font-size:.85rem;padding:18px 0}\n' +
    '.ajr-loading{text-align:center;color:var(--muted,#7a9aaa);font-size:.85rem;padding:12px 0}\n' +
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

  function build() {
    var st = document.createElement('style');
    st.textContent = STYLE;
    document.head.appendChild(st);

    container.innerHTML =
      '<div class="ajr-widget">' +
        '<div class="ajr-title">🤲 مساهماتكم</div>' +
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
    loadFeed();
  }

  function setStatus(msg, isErr) {
    el.status.textContent = msg || '';
    el.status.className = 'ajr-status' + (isErr ? ' err' : '');
  }

  function headers() {
    return {
      'apikey': ANON_KEY,
      'Authorization': 'Bearer ' + ANON_KEY,
      'Accept': 'application/json'
    };
  }

  function loadFeed() {
    el.feed.innerHTML = '<div class="ajr-loading">⏳ جاري التحميل...</div>';
    fetch(SUPABASE_URL + '/rest/v1/ajr_contributions?select=id,type,content,name,created_at&order=created_at.desc&limit=30', {
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
      return '<div class="ajr-item ' + contentCls + (isMine ? ' ajr-my' : '') + '">' +
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