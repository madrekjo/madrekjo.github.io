// ========================================
// الملف الرئيسي — مدارك جو
// ========================================

// Stars
(function() {
  const c = document.getElementById('starsContainer');
  if (!c) return;
  const count = window.matchMedia && window.matchMedia('(max-width: 640px)').matches ? 25 : 60;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const sz = Math.random() * 2.5 + 0.5;
    s.style.cssText = `width:${sz}px;height:${sz}px;top:${Math.random()*100}%;left:${Math.random()*100}%;--d:${(Math.random()*4+2).toFixed(1)}s;--delay:${(Math.random()*5).toFixed(1)}s`;
    c.appendChild(s);
  }
})();

// Detect mode
const IS_LANDING = !!document.getElementById('landing');

// ---------- FAQ ----------
function toggleFaq(el) { el.classList.toggle('open'); }

// ---------- Modals ----------
function showVisionModal() { const m = document.getElementById('visionModal'); if (m) m.classList.add('show'); }
function closeVisionModal() { const m = document.getElementById('visionModal'); if (m) m.classList.remove('show'); }
function showTeamModal() { const m = document.getElementById('teamModal'); if (m) m.classList.add('show'); }
function closeTeamModal() { const m = document.getElementById('teamModal'); if (m) m.classList.remove('show'); }

// ---------- Scroll ----------
function scrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// ---------- Copy email ----------
function copyEmail() {
  navigator.clipboard.writeText('madrekjo@gmail.com').then(() => alert('تم نسخ البريد الإلكتروني ✓'));
}

// ========== PAGE-SPECIFIC (field/2010 pages) ==========

if (!IS_LANDING) {

// ---------- Sidebar ----------
function renderSidebar() {
  const container = document.getElementById('sidebarContent');
  if (!container || !window.SIDEBAR_LINKS) return;
  let html = '';
  for (const group of window.SIDEBAR_LINKS) {
    html += `<div class="sidebar-group-title">${group.group}</div>`;
    if (group.items && group.items.length > 0) {
      for (const item of group.items) {
        const type = item.type || 'iframe';
        let attrs = `data-link-type="${type}"`;
        if (type === 'iframe') attrs += ` data-url="${item.url}" data-title="${item.title || item.text}"`;
        else if (type === 'external') attrs += ` data-url="${item.url}"`;
        else if (type === 'action') attrs += ` data-action="${item.action}"`;
        html += `<div class="sidebar-link" ${attrs}><span class="sidebar-link-icon">${item.icon}</span> ${item.text}</div>`;
      }
    } else {
      html += `<div class="sidebar-empty">📌 سيتم إضافة المحتوى قريباً</div>`;
    }
  }
  container.innerHTML = html;
}

function setupSidebar() {
  const sc = document.getElementById('sidebarContent');
  if (!sc) return;
  sc.addEventListener('click', function(e) {
    const link = e.target.closest('.sidebar-link');
    if (!link) return;
    const type = link.getAttribute('data-link-type');
    if (type === 'iframe') loadFrame(link);
    else if (type === 'external') openNewTabExternal(link);
    else if (type === 'action') {
      const act = link.getAttribute('data-action');
      if (act === 'showChatDisabled') showChatDisabledModal();
      else if (act === 'copyEmail') copyEmail();
      else if (act === 'scrollToElectives') {
        const el = document.querySelector('.electives-grid');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });
}

// ---------- Sidebar toggle ----------
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  const ov = document.getElementById('sidebarOverlay');
  if (ov) ov.classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  const ov = document.getElementById('sidebarOverlay');
  if (ov) ov.classList.remove('show');
}

// ---------- Chat disabled ----------
function showChatDisabledModal() {
  closeSidebar();
  const m = document.getElementById('chatDisabledModal');
  if (m) m.classList.add('show');
}
function closeChatDisabledModal() {
  const m = document.getElementById('chatDisabledModal');
  if (m) m.classList.remove('show');
}

// ---------- Viewer ----------
let currentLink = null, currentTimeout = null;
function loadFrame(linkEl) {
  const url = linkEl.getAttribute('data-url');
  if (!url) return;
  const title = linkEl.getAttribute('data-title') || 'محتوى';
  closeSidebar();
  if (currentLink) currentLink.classList.remove('active');
  linkEl.classList.add('active');
  currentLink = linkEl;

  const viewer = document.getElementById('fullViewer');
  const iframe = document.getElementById('mainIframe');
  const titleEl = document.getElementById('viewerTitle');
  const spinner = document.getElementById('viewerSpinner');
  const errorBox = document.getElementById('iframeError');

  titleEl.textContent = title;
  spinner.style.display = 'block';
  iframe.style.opacity = '0';
  errorBox.style.display = 'none';
  if (currentTimeout) clearTimeout(currentTimeout);
  iframe.onload = null;
  iframe.src = 'about:blank';
  setTimeout(() => { iframe.src = url; }, 10);
  viewer.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  currentTimeout = setTimeout(() => {
    if (iframe.style.opacity !== '1') {
      spinner.style.display = 'none';
      errorBox.style.display = 'flex';
      errorBox.dataset.url = url;
      errorBox.dataset.title = title;
      currentTimeout = null;
    }
  }, 5000);

  iframe.onload = function() {
    if (currentTimeout) clearTimeout(currentTimeout);
    currentTimeout = null;
    spinner.style.display = 'none';
    iframe.style.opacity = '1';
    errorBox.style.display = 'none';
  };
}

function openInNewTabFromError() {
  const err = document.getElementById('iframeError');
  if (err.dataset.url) window.open(err.dataset.url, '_blank', 'noopener,noreferrer');
}

// ---------- Back Button ----------
function goBack() {
  window.history.back();
}

function closeViewer() {
  if (currentTimeout) clearTimeout(currentTimeout);
  const viewer = document.getElementById('fullViewer');
  const iframe = document.getElementById('mainIframe');
  if (viewer) viewer.style.display = 'none';
  if (iframe) { iframe.src = 'about:blank'; iframe.style.opacity = '0'; iframe.onload = null; }
  const err = document.getElementById('iframeError');
  if (err) err.style.display = 'none';
  document.body.style.overflow = '';
  if (currentLink) { currentLink.classList.remove('active'); currentLink = null; }
}

function openNewTabExternal(linkEl) {
  const url = linkEl.getAttribute('data-url');
  if (url) { closeSidebar(); window.open(url, '_blank', 'noopener,noreferrer'); }
}

// ---------- Daily Advice ----------
const ADVICES = [
  { icon: '💡', text: 'النجاح يبدأ بخطوة، وما دمت تتعلم فأنت تتقدم' },
  { icon: '⏳', text: 'لا تؤجل عمل اليوم إلى الغد' },
  { icon: '📚', text: 'العلم نور والجهل ظلام' },
  { icon: '🌱', text: 'من جد وجد ومن زرع حصد' },
  { icon: '📖', text: 'اطلب العلم من المهد إلى اللحد' },
  { icon: '🏛️', text: 'بالعلم ترتفع الأمم' },
  { icon: '🚀', text: 'الطريق إلى النجاح مليء بالتحديات، والمثابرة تصنع المستحيل' },
  { icon: '✨', text: 'كل يوم هو فرصة جديدة لتحقيق أهدافك' },
  { icon: '🔑', text: 'المثابرة هي مفتاح النجاح' },
  { icon: '🌍', text: 'التعليم هو أقوى سلاح لتغيير العالم' },
  { icon: '👣', text: 'رحلة الألف ميل تبدأ بخطوة واحدة' },
  { icon: '💪', text: 'لا يوجد اختصار للنجاح، فقط العمل الجاد' },
  { icon: '⏰', text: 'الوقت كالسيف إن لم تقطعه قطعك' },
  { icon: '🌟', text: 'كن دائماً أفضل نسخة من نفسك' },
  { icon: '🔥', text: 'التحديات هي ما تجعل الحياة ممتعة' },
];
function showDailyAdvice() {
  const quoteEl = document.getElementById('dailyAdvice');
  const iconEl = document.getElementById('adviceIcon');
  if (!quoteEl) return;
  const i = Math.floor(Math.random() * ADVICES.length);
  if (iconEl) iconEl.textContent = ADVICES[i].icon;
  quoteEl.textContent = ADVICES[i].text;
}

// ---------- Field Particles ----------
function createFieldParticles(opts) {
  const old = document.getElementById('fieldParticles');
  if (old) old.remove();
  const c = document.createElement('div');
  c.id = 'fieldParticles';
  c.className = 'field-particles';
  document.body.prepend(c);
  for (let i = 0; i < opts.count; i++) {
    const p = document.createElement('span');
    p.className = 'fp-particle';
    p.textContent = opts.items[Math.floor(Math.random() * opts.items.length)];
    const dur = opts.minDur + Math.random() * (opts.maxDur - opts.minDur);
    const delay = Math.random() * opts.maxDelay;
    const size = opts.minSize + Math.random() * (opts.maxSize - opts.minSize);
    const x = Math.random() * 100;
    const drift = (Math.random() - 0.5) * opts.driftRange || 80;
    const rot = Math.random() * 360;
    p.style.cssText = `left:${x}%;font-size:${size}px;animation:${opts.anim} ${dur}s linear ${delay}s infinite;--dx:${drift};--r:${rot};${opts.color?'color:'+opts.color+';':''}${opts.extra||''}`;
    c.appendChild(p);
  }
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', function() {
  renderSidebar();
  setupSidebar();
  showDailyAdvice();

  // Prefetch
  const first = document.querySelector('#sidebarContent .sidebar-link[data-link-type="iframe"]');
  if (first && first.getAttribute('data-url')) {
    const preload = document.createElement('iframe');
    preload.style.display = 'none';
    preload.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-modals');
    document.body.appendChild(preload);
    preload.src = first.getAttribute('data-url');
  }
});

} // !IS_LANDING

// ========== CLOSE MODAL ON OVERLAY CLICK ==========
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('info-modal')) {
    e.target.classList.remove('show');
  }
});

// ========== TOAST NOTIFICATIONS ==========
function ensureToastContainer() {
  let c = document.getElementById('toastContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastContainer';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

function showToast(message, type, duration, actions) {
  const c = ensureToastContainer();
  const t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'info');
  const icons = { info: '💡', success: '✅', warn: '⚠️', error: '❌', social: '📸' };
  let html = '<span class="toast-icon">' + (icons[type] || '💡') + '</span><span>' + message + '</span>';
  if (actions && actions.length) {
    html += '<span class="toast-actions">';
    for (let i = 0; i < actions.length; i++) {
      html += '<button class="toast-btn" data-i="' + i + '">' + actions[i].label + '</button>';
    }
    html += '</span>';
  }
  t.innerHTML = html;
  c.appendChild(t);

  if (actions && actions.length) {
    t.querySelectorAll('.toast-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const a = actions[parseInt(btn.getAttribute('data-i'))];
        if (a && a.onClick) a.onClick();
        t.classList.add('toast-out');
        setTimeout(function() { t.remove(); }, 350);
      });
    });
  }

  const dur = duration || 4000;
  setTimeout(function() { t.classList.add('toast-out'); }, dur - 350);
  setTimeout(function() { t.remove(); }, dur);
}

// ========== ONBOARDING GUIDE ==========
let onbState = null;

function onbCleanup() {
  const ov = document.getElementById('onbOverlay');
  if (ov) ov.remove();
  onbState = null;
}

function startOnboarding(steps, doneKey) {
  if (onbState) return;
  if (localStorage.getItem(doneKey)) return;
  onbState = { steps: steps, idx: 0, doneKey: doneKey, autoEl: null, ticking: false };

  const overlay = document.createElement('div');
  overlay.className = 'onb-overlay';
  overlay.id = 'onbOverlay';
  const ring = document.createElement('div');
  ring.className = 'onb-ring';
  ring.style.display = 'none';
  overlay.appendChild(ring);
  const tooltip = document.createElement('div');
  tooltip.className = 'onb-tooltip';
  tooltip.innerHTML = '<div class="onb-tooltip-arrow"></div>';
  overlay.appendChild(tooltip);
  document.body.appendChild(overlay);

  function currentStep() { return onbState.steps[onbState.idx]; }

  function positionTarget(target, step, animate) {
    if (!target) {
      ring.style.display = 'none';
      tooltip.style.left = '50%';
      tooltip.style.top = '50%';
      tooltip.style.transform = 'translate(-50%,-50%)';
      tooltip.setAttribute('data-arrow', 'none');
      return;
    }
    const r = target.getBoundingClientRect();
    ring.style.display = 'block';
    ring.style.left = (r.left - 4) + 'px';
    ring.style.top = (r.top - 4) + 'px';
    ring.style.width = (r.width + 8) + 'px';
    ring.style.height = (r.height + 8) + 'px';

    const pos = step.tooltipPos || 'bottom';
    let left, top, transform;
    if (pos === 'bottom') { left = r.left + r.width / 2; top = r.bottom + 16; transform = 'translateX(-50%)'; tooltip.setAttribute('data-arrow', 'top'); }
    else if (pos === 'top') { left = r.left + r.width / 2; top = r.top - 16; transform = 'translate(-50%,-100%)'; tooltip.setAttribute('data-arrow', 'bottom'); }
    else if (pos === 'right') { left = r.right + 16; top = r.top + r.height / 2; transform = 'translateY(-50%)'; tooltip.setAttribute('data-arrow', 'left'); }
    else { left = r.left - 16; top = r.top + r.height / 2; transform = 'translate(-100%,-50%)'; tooltip.setAttribute('data-arrow', 'right'); }

    left = Math.max(22, Math.min(window.innerWidth - 22, left));
    top = Math.max(22, Math.min(window.innerHeight - 22, top));
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.transform = transform;
  }

  function reposition() {
    if (!onbState) return;
    const step = currentStep();
    const target = step.target ? document.querySelector(step.target) : null;
    positionTarget(target, step, false);
    onbState.ticking = false;
  }

  function requestReposition() {
    if (!onbState || onbState.ticking) return;
    onbState.ticking = true;
    requestAnimationFrame(reposition);
  }

  function render() {
    const step = currentStep();
    const target = step.target ? document.querySelector(step.target) : null;

    overlay.classList.toggle('light', !!step.light);

    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function() { positionTarget(target, step, true); }, 380);

    const inner = document.createElement('div');
    inner.className = 'onb-tooltip-inner';
    const hasNext = onbState.idx < steps.length - 1;
    const dots = steps.map(function(_, j) {
      return '<span class="onb-dot' + (j === onbState.idx ? ' active' : '') + '"></span>';
    }).join('');
    let btns = '<button class="onb-skip">تخطي</button>';
    if (hasNext) btns += '<button class="onb-next">التالي ←</button>';
    else btns += '<button class="onb-next">ممتاز! ✓</button>';
    inner.innerHTML =
      '<div class="onb-tooltip-icon">' + (step.icon || '💡') + '</div>' +
      '<div class="onb-tooltip-title">' + step.title + '</div>' +
      '<div class="onb-tooltip-desc">' + step.desc + '</div>' +
      (step.extra || '') +
      '<div class="onb-dots">' + dots + '</div>' +
      '<div class="onb-btns">' + btns + '</div>';
    tooltip.innerHTML = '<div class="onb-tooltip-arrow"></div>';
    tooltip.appendChild(inner);

    inner.querySelector('.onb-skip').addEventListener('click', finishOnboarding);
    const nextBtn = inner.querySelector('.onb-next');
    if (nextBtn) nextBtn.addEventListener('click', nextStep);

    if (step.autoAdvance) {
      if (onbState.autoEl) onbState.autoEl.removeEventListener('click', onbState.autoHandler);
      const autoEl = document.querySelector(step.autoAdvance);
      if (autoEl) {
        onbState.autoEl = autoEl;
        onbState.autoHandler = function() { setTimeout(nextStep, 550); };
        autoEl.addEventListener('click', onbState.autoHandler);
      }
    }
  }

  function nextStep() {
    if (!onbState) return;
    if (onbState.idx < onbState.steps.length - 1) {
      var step = currentStep();
      onbState.idx++;
      if (step.openSidebarOnNext && typeof toggleSidebar === 'function') toggleSidebar();
      render();
    } else {
      finishOnboarding();
    }
  }

  function finishOnboarding() {
    if (onbState && onbState.autoEl && onbState.autoHandler) {
      onbState.autoEl.removeEventListener('click', onbState.autoHandler);
    }
    try { localStorage.setItem(onbState.doneKey, '1'); } catch(e) {}
    onbCleanup();
  }

  window.addEventListener('scroll', requestReposition, { passive: true });
  window.addEventListener('resize', requestReposition);

  render();
}

// ========== INSTAGRAM FOLLOW PROMPT ==========
const IG_URL = 'https://www.instagram.com/madrekjo/';

document.addEventListener('click', function(e) {
  if (e.target && e.target.closest && e.target.closest('.ig-floating')) {
    try { localStorage.setItem('madrekjo_ig_clicked', '1'); } catch(err) {}
  }
});

function maybeShowIgPrompt() {
  if (localStorage.getItem('madrekjo_ig_clicked')) return;
  const guideDone = localStorage.getItem('madrekjo_guide_landing') || localStorage.getItem('madrekjo_guide_sections');
  if (!guideDone) return;
  try {
    if (sessionStorage.getItem('madrekjo_ig_prompted')) return;
    sessionStorage.setItem('madrekjo_ig_prompted', '1');
  } catch(e) {}
  setTimeout(function() {
    showToast(
      'تابع حساب مدارك جو على انستغرام لتعرف كل شيء جديد عن المنصة',
      'social',
      9000,
      [{
        label: '🔗 انضم إلينا',
        onClick: function() {
          try { localStorage.setItem('madrekjo_ig_clicked', '1'); } catch(err) {}
          window.open(IG_URL, '_blank', 'noopener,noreferrer');
        }
      }]
    );
  }, 6000);
}

// ========== ONBOARDING TRIGGERS ==========
document.addEventListener('DOMContentLoaded', function() {
  maybeShowIgPrompt();

  if (IS_LANDING) {
    if (localStorage.getItem('madrekjo_guide_landing')) return;
    setTimeout(function() {
      startOnboarding([
        {
          icon: '👋',
          title: 'أهلاً بك في مدارك جو!',
          desc: 'منصة تعليمية مجانية بالكامل — بدون حصص وبدون رسوم.',
          tooltipPos: 'center'
        },
        {
          icon: '🎯',
          title: 'اختر جيلك',
          desc: 'اختر جيلك (2009 أو 2010) لتدخل إلى منصتك.',
          target: '.year-section',
          tooltipPos: 'top',
          light: true
        }
      ], 'madrekjo_guide_landing');
    }, 2600);
  } else {
    if (localStorage.getItem('madrekjo_guide_sections')) return;
    if (!document.querySelector('.hamburger')) return;
    setTimeout(function() {
      showToast('👋 اضغط على زر القائمة (☰) بالأعلى لاستكشاف المنصة', 'info', 5000);
    }, 1100);
    setTimeout(function() {
      startOnboarding([
        {
          icon: '📂',
          title: 'افتح القائمة الجانبية',
          desc: 'اضغط على زر القائمة (☰) بالأعلى لفتح كل الأقسام والمواد.',
          target: '.hamburger',
          tooltipPos: 'bottom',
          autoAdvance: '.hamburger',
          openSidebarOnNext: true
        },
        {
          icon: '🗂️',
          title: 'كل شيء في مكان واحد',
          desc: 'ستجد في القائمة: المواد الدراسية لكل فصل، المراجعة الختامية، الدردشة، الإنجاز والمزيد. اختر أي قسم للبدء.',
          target: '.sidebar',
          tooltipPos: 'left',
          light: true
        }
      ], 'madrekjo_guide_sections');
    }, 2600);
  }
});
