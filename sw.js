// Nate Bloom offline cache.
// The app page is network-first (so updates arrive when you're online, with the cached copy as the
// offline fallback). Sound library files are cache-first: once heard, they work offline.
const CACHE = "nate-bloom-v3";
const KEEP = ["nate-bloom-models"];   // the AI separation model lives in its own cache
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.includes("/models/")) return;   // the page caches the model itself
  const isLibrary = url.hostname === "surikov.github.io" || (sameOrigin && url.pathname.includes("/snd/")) || (url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("onnxruntime-web"));
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
