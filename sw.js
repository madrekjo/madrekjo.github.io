/* ========================================
   مدارك جو — Service Worker
   ======================================== */
const CACHE = 'madrekjo-v3';
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

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.origin === location.origin) {
    // تنقلات الصفحات (HTML): شبكة أولاً — تعرض أحدث نسخة دائماً بعد أي تحديث،
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
    // طلب /chat/index.html القادم من حاجز 404.html (طلب عادي وليس تنقلاً):
    // شبكة أولاً حتى لا تُخدَّم نسخة قديمة من تطبيق الدردشة.
    if (url.pathname === '/chat/index.html') {
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
    // طلب /achievement/index.html القادم من حاجز 404.html (طلب عادي وليس تنقلاً):
    // شبكة أولاً حتى لا تُخدَّم نسخة قديمة من تطبيق الإنجاز.
    if (url.pathname === '/achievement/index.html') {
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

  e.respondWith(
    fetch(req).then(function(res) {
      var copy = res.clone();
      caches.open(CACHE).then(function(c) { c.put(req, copy); });
      return res;
    }).catch(function() {
      return caches.match(req);
    })
  );
});
