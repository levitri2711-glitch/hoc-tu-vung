// Service worker: lưu giao diện để mở được khi mất mạng; không lưu dữ liệu gọi máy chủ (POST) hay tài nguyên bên ngoài.
const VERSION = 'vol-shell-v6';
const SHELL = ['./', 'index.html', 'app.css', 'config.js', 'icon.svg', 'manifest.webmanifest',
  'js/parse.js', 'js/srs.js', 'js/lib.js', 'js/grading.js', 'js/legal.js', 'js/app.js', 'js/exercises.js', 'js/manage.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Mạng trước (luôn lấy bản mới khi có mạng), mất mạng thì dùng bản đã lưu.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api') || url.pathname.startsWith('/dev/')) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL('./#/review', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ('focus' in c) { c.navigate(target); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
