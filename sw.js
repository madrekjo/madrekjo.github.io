/* ========================================
   مدارك جو — Service Worker
   ======================================== */
const CACHE = 'madrekjo-v26';
const CORE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/css/chatbot.css',
  '/js/main.js',
  '/js/chatbot.js',
  '/exam.html',
  '/privacy.html',
  '/2009/index.html',
  '/2009/engineering.html',
  '/2009/health.html',
  '/2009/business.html',
  '/2009/languages.html',
  '/2010/index.html',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c) { return c.addAll(CORE); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys.filter(function(k) { return k !== CACHE; })
              .map(function(k) { return caches.delete(k); })
        );
      })
      .then(function() { return self.clients.claim(); })
  );
});

// يوفّر index.html لتطبيق/chat عند التنقل داخل مسارات SPA الخاصة به،
// حتى لا تُطلَب ملفات غير موجودة فعلياً (مثل /chat/auth) من GitHub Pages.
self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // لوحة MADARIK OPS: لا تعترض أي شيء تحت /k7-x9mz4-ops/ إطلاقاً
  // (لا كاش ولا إعادة توجيه) حتى لا يعطّل طلباته الخارجية (Supabase + Worker).
  if (req.url.indexOf('/k7-x9mz4-ops/') !== -1) return;

  if (url.origin === location.origin) {
    // طلب /chat/index.html القادم من حاجز 404.html (طلب عادي وليس تنقلاً):
    // شبكة أولاً دائماً — نحتاج أحدث كود دائماً لتجنب مشاكل القفل.
    if (url.pathname === '/chat/index.html' || url.pathname === '/chat/') {
      e.respondWith(
        fetch(req).then(function(res) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
          return res;
        }).catch(function() {
          return caches.match(req).then(function(hit) {
            return hit || caches.match('/');
          });
        })
      );
      return;
    }

    // تنقّل داخل تطبيق /chat (SPA): مسارات مثل /chat/auth أو /chat/chat
    // ليست ملفات حقيقية، ف network-first مع تحديث الكاش.
    // مهم: نحافظ على الـ query string الأصلي (?ticket=... لإتمام تدفق SSO)
    // ونضمن أن respondWith يستقبل Response صحيحاً دائماً (لا undefined).
    if (url.pathname.indexOf('/chat/') === 0 && req.mode === 'navigate') {
      var indexUrl = '/chat/index.html';
      if (url.search) indexUrl += url.search;
      e.respondWith(
        fetch(indexUrl).then(function(res) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put('/chat/index.html', copy); });
          return res;
        }).catch(function() {
          return caches.match('/chat/index.html').then(function(hit) {
            return hit || caches.match('/');
          }).then(function(fallback) {
            // إن لم يوجد احتياطي نعيد استجابة فارغة بدل undefined (يكسر respondWith).
            return fallback || new Response('<h1>غير متصل</h1>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          });
        })
      );
      return;
    }

    // تنقلات الصفحات (HTML) للأقسام الأخرى: شبكة أولاً — تعرض أحدث نسخة دائماً،
    // مع بقاء النسخة المخزنة كاحتياط عند انقطاع الإنترنت.
    if (req.mode === 'navigate') {
      e.respondWith(
        fetch(req).then(function(res) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
          return res;
        }).catch(function() {
          return caches.match(req).then(function(hit) {
            return hit || caches.match('/');
          }).then(function(fallback) {
            return fallback || new Response('<h1>غير متصل</h1>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          });
        })
      );
      return;
    }

    // ملفات الأسئلة (questions/): شبكة أولاً دائماً حتى تظهر أي تحديثات للمحتوى
    // فوراً دون الحاجة إلى تحديث يدوي من المستخدم.
    if (url.pathname.indexOf('/questions/') === 0) {
      e.respondWith(
        fetch(req).then(function(res) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
          return res;
        }).catch(function() {
          return caches.match(req);
        })
      );
      return;
    }

    // ملفات الدردشة (chat/assets/): شبكة أولاً دائماً حتى تظهر التحديثات الجديدة
    // (نظام النقاط/العداد) فوراً دون الحاجة إلى إبطال الكاش يدوياً.
    if (url.pathname.indexOf('/chat/assets/') === 0) {
      e.respondWith(
        fetch(req).then(function(res) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
          return res;
        }).catch(function() {
          return caches.match(req);
        })
      );
      return;
    }

    // بقية الطلبات من نفس النطاق: كاش أولاً، ثم شبكة، واحتياط للصفحة الرئيسية.
    e.respondWith(
      caches.match(req).then(function(hit) {
        if (hit) return hit;
        return fetch(req).then(function(res) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
          return res;
        }).catch(function() {
          if (req.mode === 'navigate') return caches.match('/');
        });
      })
    );
    return;
  }

  // طلبات من نطاقات خارجية: مرّر دائماً للشبكة مباشرة.
  // لا نخزن أي شيء في الكاش — لا نريد تخزين أخطاء Supabase أو تأخيرات.
  e.respondWith(fetch(req));
});
