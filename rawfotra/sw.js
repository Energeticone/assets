/* RAWFOTRA service worker — makes the app installable and usable offline.
 *
 * Strategy: the shell is precached atomically (addAll) and re-validated as a
 * group on every online launch, so the cache never holds a mixed-version set
 * and updates reach users on the first online load. Requests are answered
 * network-first, but when a cached copy exists the network gets only a short
 * head start — on dead-but-connected networks the app still starts instantly
 * from cache instead of hanging. Cross-origin requests (the Anthropic API)
 * are never intercepted, and only this app's own caches (rawfotra-*) are
 * ever touched: CacheStorage is shared origin-wide with the other apps on
 * this Pages site.
 */
var CACHE = "rawfotra-shell-v12";
var NETWORK_HEAD_START_MS = 3500;
var SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "bg.js",
  "data/freemasonry-circle.js",
  "data/expert-packs.js",
  "manifest.webmanifest",
  "assets/cosmos.webp",
  "assets/council.webp",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png",
];

// no-cache: always revalidate against the server (cheap 304s via ETag), so a
// CDN/browser-cache staleness window after a deploy can't freeze old files in.
function shellRequests() {
  return SHELL.map(function (u) { return new Request(u, { cache: "no-cache" }); });
}

// addAll is atomic: the shell updates as a complete set or not at all.
function refreshShell() {
  return caches.open(CACHE).then(function (cache) {
    return cache.addAll(shellRequests());
  }).catch(function () { /* offline or mid-deploy — keep the current set */ });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(shellRequests()); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        // Only this app's own old caches — never siblings like travelnow-*.
        if (k !== CACHE && k.indexOf("rawfotra-") === 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) return res;
        if (cached) return cached;
        return res;
      });
      if (!cached) {
        return network.catch(function () {
          if (req.mode === "navigate") return caches.match("index.html");
          return Response.error();
        });
      }
      var fallback = new Promise(function (resolve) {
        setTimeout(function () { resolve(cached); }, NETWORK_HEAD_START_MS);
      });
      return Promise.race([network.catch(function () { return cached; }), fallback]);
    })
  );

  // Each visit re-validates the whole shell as one atomic group.
  if (req.mode === "navigate") event.waitUntil(refreshShell());
});
