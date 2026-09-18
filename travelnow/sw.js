/* TravelNow service worker — offline-first caching of the app shell + data.
 *
 * This SW is registered at the Pages site root, so its scope also covers the
 * sibling apps under /rawfotra/ and /tipclip/. It must never answer for them
 * (they manage their own caching), and it must only ever delete its own
 * travelnow-* caches: CacheStorage is shared origin-wide across all apps on
 * this site.
 */
const CACHE = 'travelnow-v3';
const ASSETS = [
  './',
  './index.html',
  './app.html',
  './styles.css',
  './showcase.css',
  './app.js',
  './manifest.webmanifest',
  './data/world.json',
  './data/passports.json',
  './assets/shots/hero.png',
  './assets/shots/globe-usa.png',
  './assets/shots/globe-deu.png',
  './assets/shots/globe-bra.png',
  './assets/shots/map.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k!==CACHE && k.startsWith('travelnow-')).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  if (e.request.method!=='GET') return;
  const url = new URL(e.request.url);
  if (url.origin!==self.location.origin) return;
  // Hands off the sibling apps that share this scope.
  if (url.pathname.includes('/rawfotra/') || url.pathname.includes('/tipclip/')) return;
  e.respondWith(
    caches.match(e.request).then(hit=> hit || fetch(e.request).then(res=>{
      if (res && res.ok) {
        const copy=res.clone();
        e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request, copy)).catch(()=>{}));
      }
      return res;
    }).catch(()=>hit || Response.error()))
  );
});
