// Nate Bloom offline cache (Nate Bloom Lite, under lite/, has its own).
// The app page is network-first (so updates arrive when you're online, with the cached copy as the
// offline fallback). Sound library files are cache-first: once heard, they work offline.
const CACHE = "nate-bloom-v3";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  // old caches go, including the vocal-separation model and engine files from before that feature was removed
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && !k.startsWith("nate-bloom-lite")).map(k => caches.delete(k))))
    .then(() => caches.open(CACHE)).then(c => c.keys().then(reqs => Promise.all(reqs.filter(r => r.url.includes("onnxruntime-web")).map(r => c.delete(r)))))
    .catch(() => {}).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.includes("/lite/") || url.pathname.includes("/brogue/")) return;   // Nate Bloom Lite and Brogue have their own offline caches
  const sameOrigin = url.origin === self.location.origin;
  const isLibrary = url.hostname === "surikov.github.io" || (sameOrigin && url.pathname.includes("/snd/"));
  const isAppPage = sameOrigin && /\/(index\.html)?$/.test(url.pathname);
  if (req.mode === "navigate" && !isAppPage) return;   // other pages on the site (the clocks) must not replace the cached app
  if (isAppPage) {
    // only a good copy replaces the offline one, and a server error falls back to it too: an error page
    // must never become the app
    e.respondWith(fetch(req).then(r => {
      if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put("./index.html", copy)); return r; }
      return caches.match("./index.html").then(hit => hit || r);
    }).catch(() => caches.match("./index.html")));
    return;
  }
  // plugins: the network first, so plugin updates arrive; the kept copy when offline
  if (sameOrigin && url.pathname.includes("/wam/")) {
    e.respondWith(fetch(req).then(r => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; }).catch(() => caches.match(req)));
    return;
  }
  if (isLibrary || sameOrigin) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r && (r.ok || r.type === "opaque")) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    })));
  }
});
