const CACHE_NAME = 'byte-back-shell-v1';
const SHELL = ['/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(fetch(request).catch(() => new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>오프라인</title><body><h1>오프라인 상태</h1><p>보호 자료는 오프라인에서 표시하지 않습니다. 인터넷에 연결한 뒤 다시 로그인하세요.</p></body></html>', {headers:{'Content-Type':'text/html; charset=utf-8'},status:503})));
  }
});
