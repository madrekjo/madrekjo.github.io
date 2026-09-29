/* ========================================
   مدارك جو — Service Worker
   ======================================== */

const CACHE = 'madrekjo-v34';

const CORE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css?v=5',
  '/css/chatbot.css?v=3',
  '/js/main.js?v=3',
  '/js/chatbot.js?v=3',
  '/exam.html',
  '/privacy.html',
  '/2009/index.html',
  '/2009/engineering.html',
  '/2009/health.html',
  '/2009/business.html',
  '/2009/languages.html',
  '/2010/index.html',
  '/assets/icons/icon-192.png?v=2',
  '/assets/icons/icon-512.png?v=2',
  '/assets/icons/icon-maskable-512.png?v=2',
  '/assets/images/logo.png?v=2'
];

function offlineResponse() {
  return new Response('', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c) {
        return c.addAll(CORE);
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(k) {
              return k !== CACHE;
            })
            .map(function(k) {
              return caches.delete(k);
            })
        );
      })
      .then(function() {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function(e) {
  var req = e.request;

  // لا نتعامل مع أي شيء غير GET
  if (req.method !== 'GET') {
    return;
  }

  var url = new URL(req.url);

  // لوحة MADARIK OPS:
  // لا كاش ولا إعادة توجيه ولا اعتراض للطلبات.
  if (req.url.indexOf('/k7-x9mz4-ops/') !== -1) {
    return;
  }

  // ========================================
  // طلبات من نفس النطاق
  // ========================================

  if (url.origin === location.origin) {

    // ----------------------------------------
    // /chat/index.html و /chat/
    // Network First
    // ----------------------------------------
    if (
      url.pathname === '/chat/index.html' ||
      url.pathname === '/chat/'
    ) {
      e.respondWith(
        fetch(req)
          .then(function(res) {
            var copy = res.clone();

            caches.open(CACHE).then(function(c) {
              c.put(req, copy);
            });

            return res;
          })
          .catch(function() {
            return caches.match(req)
              .then(function(hit) {
                return hit || caches.match('/chat/index.html');
              })
              .then(function(fallback) {
                return fallback || caches.match('/');
              })
              .then(function(fallback) {
                return fallback || offlineResponse();
              });
          })
      );

      return;
    }

    // ----------------------------------------
    // مسارات SPA الخاصة بالدردشة
    // مثل:
    // /chat/auth
    // /chat/chat
    // /chat/...
    //
    // Network First
    // ----------------------------------------
    if (
      url.pathname.indexOf('/chat/') === 0 &&
      req.mode === 'navigate'
    ) {
      var indexUrl = '/chat/index.html';

      // الحفاظ على query string
      // مثل ?ticket=...
      if (url.search) {
        indexUrl += url.search;
      }

      e.respondWith(
        fetch(indexUrl)
          .then(function(res) {
            var copy = res.clone();

            caches.open(CACHE).then(function(c) {
              c.put('/chat/index.html', copy);
            });

            return res;
          })
          .catch(function() {
            return caches.match('/chat/index.html')
              .then(function(hit) {
                return hit || caches.match('/');
              })
              .then(function(fallback) {
                return fallback || offlineResponse();
              });
          })
      );

      return;
    }

    // ----------------------------------------
    // تنقلات صفحات الموقع
    // Network First
    // ----------------------------------------
    if (req.mode === 'navigate') {
      e.respondWith(
        fetch(req)
          .then(function(res) {
            var copy = res.clone();

            caches.open(CACHE).then(function(c) {
              c.put(req, copy);
            });

            return res;
          })
          .catch(function() {
            return caches.match(req)
              .then(function(hit) {
                return hit || caches.match('/');
              })
              .then(function(fallback) {
                return fallback || offlineResponse();
              });
          })
      );

      return;
    }

    // ----------------------------------------
    // ملفات الأسئلة
    // Network First
    // ----------------------------------------
    if (url.pathname.indexOf('/questions/') === 0) {
      e.respondWith(
        fetch(req)
          .then(function(res) {
            var copy = res.clone();

            caches.open(CACHE).then(function(c) {
              c.put(req, copy);
            });

            return res;
          })
          .catch(function() {
            return caches.match(req)
              .then(function(hit) {
                return hit || offlineResponse();
              });
          })
      );

      return;
    }

    // ----------------------------------------
    // ملفات الدردشة
    // Network First
    // ----------------------------------------
    if (url.pathname.indexOf('/chat/assets/') === 0) {
      e.respondWith(
        fetch(req)
          .then(function(res) {
            var copy = res.clone();

            caches.open(CACHE).then(function(c) {
              c.put(req, copy);
            });

            return res;
          })
          .catch(function() {
            return caches.match(req)
              .then(function(hit) {
                return hit || offlineResponse();
              });
          })
      );

      return;
    }

    // ----------------------------------------
    // بقية طلبات نفس النطاق
    // Cache First → Network
    // ----------------------------------------
    e.respondWith(
      caches.match(req)
        .then(function(hit) {
          if (hit) {
            return hit;
          }

          return fetch(req)
            .then(function(res) {
              var copy = res.clone();

              caches.open(CACHE).then(function(c) {
                c.put(req, copy);
              });

              return res;
            });
        })
        .catch(function() {
          // مهم جداً:
          // respondWith يجب أن يحصل دائماً على Response
          return offlineResponse();
        })
    );

    return;
  }

  // ========================================
  // طلبات خارجية
  // ========================================
  //
  // لا نعترض الطلبات الخارجية إطلاقاً.
  // هذا مهم لـ:
  // Supabase
  // Auth
  // Cloudflare Worker
  // OAuth / SSO
  // وغيرها.
  //
  return;
});

