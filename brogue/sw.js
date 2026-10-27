// Brogue offline cache. The game page is network-first, so updates arrive when you're online,
// with the cached copy as the offline fallback. Saved games live in the page's own storage, not here.
const CACHE = "brogue-v1";
const CORE = ["./", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("brogue-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.includes("/brogue/")) return;
  if (req.mode === "navigate" || /\/brogue\/(index\.html)?$/.test(url.pathname)) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put("./", copy)); } return r; })
      .catch(() => caches.match("./")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
