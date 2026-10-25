// Nate Bloom Lite offline cache (its own, next to the full app's).
// The page is network-first (updates arrive when online, the cached copy is the offline fallback); sound library
// files are cache-first.
const CACHE = "nate-bloom-lite-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "../icon-192.png", "../icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  // only Lite's own old caches go; the full app's are left alone
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("nate-bloom-lite") && k !== CACHE).map(k => caches.delete(k))))
    .catch(() => {}).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isLibrary = url.hostname === "surikov.github.io" || (sameOrigin && url.pathname.includes("/snd/"));
  if (req.mode === "navigate" || (sameOrigin && /\/lite\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("./index.html", copy)); return r; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  if (isLibrary || sameOrigin) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r && (r.ok || r.type === "opaque")) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    })));
  }
});
