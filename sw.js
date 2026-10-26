// Service worker minimal : rend l'appli installable et l'ouvre même sans réseau.
// Toujours le réseau d'abord (pour avoir la dernière version), la copie locale seulement en secours.
const CACHE = 'crmzx-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    const copie = res.clone();
    caches.open(CACHE).then(c => c.put(req, copie));
    return res;
  }).catch(() => caches.match(req).then(r => r || caches.match('./'))));
});
