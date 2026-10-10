// Lineup Lab no longer uses a service worker. Keep this script as a one-time
// cleanup for browsers that still have the legacy relay worker registered.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys
    .filter(key => key.startsWith('lineup-lab-runtime-') || key.startsWith('lineup-lab-connections-'))
    .map(key => caches.delete(key)));
  await self.clients.claim();
  await self.registration.unregister();
})()));
