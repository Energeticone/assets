/* TravelNow service worker — offline-first caching of the app shell + data. */
const CACHE = 'travelnow-v2';
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
    keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  if (e.request.method!=='GET') return;
  e.respondWith(
    caches.match(e.request).then(hit=> hit || fetch(e.request).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(()=>hit))
  );
});
