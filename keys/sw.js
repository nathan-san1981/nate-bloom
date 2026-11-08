// Keys offline cache. The app page is network-first (updates arrive when online, the cached copy is the offline fallback).
const CACHE = "keys-823b286f61";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("keys-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url); if (url.origin !== self.location.origin || !url.pathname.includes("/keys/")) return;
  e.respondWith(fetch(req).then(r => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req.mode === "navigate" ? "./index.html" : req, copy)); } return r; })
    .catch(() => caches.match(req.mode === "navigate" ? "./index.html" : req).then(h => h || caches.match("./index.html"))));
});
