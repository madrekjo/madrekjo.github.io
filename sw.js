/* ========================================
   مدارك جو — Service Worker
   ======================================== */
const CACHE = 'madrekjo-v24';
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

  if (url.origin === location.origin) {
    // طلب /chat/index.html القادم من حاجز 404.html (طلب عادي وليس تنقلاً):
    // شبكة أولاً حتى لا تُخدَّم نسخة قديمة من تطبيق الدردشة.
    if (url.pathname === '/chat/index.html' || url.pathname === '/chat/') {
      e.respondWith(
        fetch(req).then(function(res) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
          return res;
        }).catch(function() {
          return caches.match(req).then(function(hit) {
            return hit || caches.match('/chat/index.html') || caches.match('/');
          });
        })
      );
      return;
    }

    // تنقّل داخل تطبيق /chat (SPA): مسارات مثل /chat/auth أو /chat/chat
    // ليست ملفات حقيقية، فتصرف إلى /chat/index.html دائماً.
    if (url.pathname.indexOf('/chat/') === 0 && req.mode === 'navigate') {
      e.respondWith(
        caches.match('/chat/index.html').then(function(hit) {
          if (hit) return hit;
          return fetch('/chat/index.html').then(function(res) {
            var copy = res.clone();
            caches.open(CACHE).then(function(c) { c.put('/chat/index.html', copy); });
            return res;
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

  // طلبات من نطاقات خارجية: مرّر دائماً للشبكة مباشرة دون أي كاش أو تحويل.
  // (يشمل واجهات API مثل supabase.co/function، Cloudinary، والصور الخارجية)
  // لا نستجيب لها أبداً حتى لا يكسر كاش/تحويل أخطاء الطلبات الحيوية.
  e.respondWith((function () {
    return fetch(req).then(function (res) {
      if (res && res.ok) {
        try {
          var cc = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, cc); });
        } catch (err) { /* ignore */ }
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || Response.error(); });
    });
  })());
});
