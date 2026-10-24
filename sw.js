// Nate Bloom offline cache.
// The app page is network-first (so updates arrive when you're online, with the cached copy as the
// offline fallback). Sound library files are cache-first: once heard, they work offline.
const CACHE = "nate-bloom-v3";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  // old caches go, including the vocal-separation model and engine files from before that feature was removed
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => caches.open(CACHE)).then(c => c.keys().then(reqs => Promise.all(reqs.filter(r => r.url.includes("onnxruntime-web")).map(r => c.delete(r)))))
    .catch(() => {}).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isLibrary = url.hostname === "surikov.github.io" || (sameOrigin && url.pathname.includes("/snd/"));
  if (req.mode === "navigate" || (sameOrigin && /\/(index\.html)?$/.test(url.pathname))) {
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
