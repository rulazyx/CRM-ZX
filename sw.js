// L'appli des pros a déménagé sur pro.ocaz.re : ce fichier retire l'ancien service worker des téléphones qui l'avaient installé.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(cles => Promise.all(cles.map(c => caches.delete(c))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(fenetres => fenetres.forEach(f => f.navigate(f.url)))));
