#!/usr/bin/env python3
"""Nate Bloom Lite: built from the full app's index.html on every update, for low-power machines (Acer Chromebook Spin
311 class: a low-power Celeron / MediaTek chip, 4 GB, 1366x768 touchscreen). Everything stays; the costly parts are
turned down.

Used by ../../build.py (make_lite(), manifest_text(), sw_text()); also runs on its own:
  python3 make_lite.py <full index.html> <lite dir>
Writes <lite dir>/index.html, manifest.webmanifest, sw.js and sim.html (copied from ../lite/sim.html)."""
import sys, os, json

HERE = os.path.dirname(os.path.abspath(__file__))


def make_lite(s, sim_js):
    """s: the full site page (text). sim_js: the contents of sim_head.js. Returns the Lite page text."""
    def one(old, new):
        nonlocal s
        n = s.count(old); assert n == 1, f"lite: expected 1 of {old[:90]!r}, found {n}"
        s = s.replace(old, new)

    # ---- who it is ----
    one("<title>Nate Bloom Synth</title>", "<title>Nate Bloom Lite</title>")
    one('<meta name="apple-mobile-web-app-title" content="Nate Bloom">', '<meta name="apple-mobile-web-app-title" content="NB Lite">')
    one("<h1>Nate <span>Bloom</span></h1>", '<h1>Nate <span>Bloom</span> <small class="lite-tag">Lite</small></h1>')
    one("<h2>Nate Bloom</h2>", "<h2>Nate Bloom Lite</h2>")
    one('<p class="start-sub">Synths, drums, samples, a sequencer, DJ decks and a drum machine.</p>',
        '<p class="start-sub">Synths, drums, samples, a sequencer, DJ decks and a drum machine, tuned for Chromebooks and older devices.</p>')
    one('const r = { app: "Nate Bloom", made:', 'const r = { app: "Nate Bloom Lite", made:')
    # the install sheet speaks Lite and starts with Chromebooks
    one('<button class="btn primary" id="inGo" style="height:44px" hidden>Install Nate Bloom</button>', '<button class="btn primary" id="inGo" style="height:44px" hidden>Install Nate Bloom Lite</button>')
    one('<div class="sp-lab"><span>Android tablet (Chrome)</span></div>', '<div class="sp-lab"><span>Chromebook (Chrome)</span></div>\n    <ol class="in-steps"><li>Click <b>Install Nate Bloom Lite</b> above, or the install icon at the right end of the address bar, or ⋮ → <b>Cast, save and share</b> → <b>Install Nate Bloom Lite</b>.</li><li>It opens in its own window and appears in the launcher; right-click its shelf icon → <b>Pin</b> to keep it there.</li></ol>\n    <div class="sp-lab"><span>Android tablet (Chrome)</span></div>')
    one('"Tap Install to add Nate Bloom to your home screen. It then opens full screen and keeps working offline."', '"Click Install to add Nate Bloom Lite as an app. It then opens in its own window and keeps working offline."')
    one("<body>", "<body class=\"lite\">\n<script>window.NB_LITE = true;</script>")
    # the virtual Chromebook (sim.html loads the app with ?sim): nothing changes without it
    one("<script>window.NB_LITE = true;</script>", "<script>window.NB_LITE = true;</script>\n<script>\n" + sim_js + "\n</script>")
    one("  more3Ready = true;", """  // virtual Chromebook: each voice's sound sources are tagged with its engine, so the simulated sound load follows them
  if (window.NB_SIM) { const mv0 = makeVoice; makeVoice = function () { const S = window.NB_SIM, r = S.beginVoice(arguments[1]); try { return mv0.apply(this, arguments); } finally { S.endBuild(r); } }; }
  more3Ready = true;""")

    # ---- the audio engine ----
    # a bigger audio buffer: a little more delay, far fewer crackles when the processor is busy
    one('ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });',
        'ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "balanced" });')
    # six voices at once instead of eight
    one("const MAX_VOICES = 8;", "const MAX_VOICES = 6;")
    # the supersaw with five saws instead of seven (the same width, a little thinner)
    one("""      const offsets = [-1, -0.62, -0.28, 0, 0.28, 0.62, 1];
      const gC = ctx.createGain(), gS = ctx.createGain(); gC.gain.value = 0.16; gS.gain.value = 0.11; gC.connect(filt); gS.connect(filt);
      offsets.forEach((o, i) => {
        const osc = ctx.createOscillator(); osc.type = "sawtooth";
        osc.frequency.value = f; osc.detune.value = o * spread;
        osc.connect(i === 3 ? gC : gS);""", """      const offsets = [-1, -0.45, 0, 0.45, 1];
      const gC = ctx.createGain(), gS = ctx.createGain(); gC.gain.value = 0.16; gS.gain.value = 0.135; gC.connect(filt); gS.connect(filt);
      offsets.forEach((o, i) => {
        const osc = ctx.createOscillator(); osc.type = "sawtooth";
        osc.frequency.value = f; osc.detune.value = o * spread;
        osc.connect(o === 0 ? gC : gS);""")
    # shorter reverbs: the space reverb 2.5 s instead of 5.5 s, the FX Lab hall at most 8 s instead of 24 s
    one("fx.impulse = makeImpulse(5.5)", "fx.impulse = makeImpulse(2.5)")
    if "const NB_IR_MAX = NB_MOBILE ? 8 : 24;" in s: one("const NB_IR_MAX = NB_MOBILE ? 8 : 24;", "const NB_IR_MAX = 8;")
    else: one("const len = Math.min(Math.floor(rate * (decay * 1.15 + pre + 0.1)), rate * 24);", "const len = Math.min(Math.floor(rate * (decay * 1.15 + pre + 0.1)), rate * 8);")
    # DJ key lock: a narrower, sparser search for where the next grain fits (about a quarter of the work)
    one("this.OV = 512; this.SR = 360;", "this.OV = 512; this.SR = 200;")
    one("for (let i = 0; i < OV; i += 2) { const q = Math.floor(i * P)", "for (let i = 0; i < OV; i += 4) { const q = Math.floor(i * P)")
    one("        scan(3, -SR, SR); const d0 = bestD; scan(1, d0 - 2, d0 + 2);", "        scan(4, -SR, SR); const d0 = bestD; scan(1, d0 - 3, d0 + 3);")
    # reading songs for Smart mix: every 8th sample instead of every 4th
    one("const D = 4, dt = D / sr, aLo", "const D = 8, dt = D / sr, aLo")

    # ---- the screen ----
    # the scope: one point per ~5 px instead of ~2
    one("const n = wave.length / 2, stp = Math.max(1, Math.floor(n / Math.max(64, w / 2)));", "const n = wave.length / 2, stp = Math.max(1, Math.floor(n / Math.max(48, w / 5)));   // Lite: one point per ~5 px")
    # the DJ's waveforms, beat strip and sync dial redraw 10 times a second (the beat dots stay at 20)
    one("""    DJ.raf = 0; if (djEl.hidden) return;
    DJ.decks.forEach(djDrawWave); djDrawAlign(); djDrawDial();""", """    DJ.raf = 0; if (djEl.hidden) return;
    DJ.liteF = (DJ.liteF || 0) + 1;
    if (DJ.liteF % 2 === 0) { DJ.decks.forEach(djDrawWave); djDrawAlign(); djDrawDial(); }""")
    # the beat strip draws a bar every 4 px instead of every 2
    one("for (let x = 0; x < w; x += 2) { const t = pos + (x / w - 0.5) * win * sp, i = Math.floor(t * er); const v = i >= 0 && i < E.length ? E[i] : 0; const bh = v * hh; c.fillRect(x, y0 + (hh - bh) / 2, 2, Math.max(1, bh)); }",
        "for (let x = 0; x < w; x += 4) { const t = pos + (x / w - 0.5) * win * sp, i = Math.floor(t * er); const v = i >= 0 && i < E.length ? E[i] : 0; const bh = v * hh; c.fillRect(x, y0 + (hh - bh) / 2, 3, Math.max(1, bh)); }")
    # meters, scope, decks and playheads redraw 20 times a second instead of 30
    one("const MIN = 1000 / 30 - 3;", "const MIN = 1000 / 20 - 3;")
    one("@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }", """/* ---------- Lite ---------- */
.lite-tag { font: 600 0.6rem/1 var(--font-mono); color: var(--panel); background: var(--lilac); border-radius: 5px; padding: 3px 5px; vertical-align: 3px; margin-left: 4px; letter-spacing: 0.04em; }
body.lite *, body.lite *::before, body.lite *::after { transition-duration: 0s !important; }
body.lite .pwr[aria-pressed="true"], body.lite .tabwrap.eng .tab.playing:not([aria-pressed="true"]) { box-shadow: none !important; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }""")
    return s


MANIFEST = {
    "id": "./", "name": "Nate Bloom Lite", "short_name": "NB Lite",
    "description": "Nate Bloom, tuned for Chromebooks and older devices: synths, drums, sampler, sequencer, DJ and more.",
    "start_url": "./", "scope": "./", "display": "standalone", "orientation": "any",
    "background_color": "#13111b", "theme_color": "#13111b",
    "icons": [{"src": "../icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
              {"src": "../icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]
}


def manifest_text():
    return json.dumps(MANIFEST, indent=2)


SW_JS = '''// Nate Bloom Lite offline cache (its own, next to the full app's).
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
  if (req.mode === "navigate" || (sameOrigin && /\\/lite\\/(index\\.html)?$/.test(url.pathname))) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("./index.html", copy)); return r; })
      .catch(() => caches.match("./index.html")));
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
'''


def sw_text():
    return SW_JS


def _read(p):
    with open(p, encoding="utf-8", newline="") as f: return f.read()


def _write(p, s):
    with open(p, "w", encoding="utf-8", newline="") as f: f.write(s)


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    s = make_lite(_read(src), _read(os.path.join(HERE, "sim_head.js")))
    os.makedirs(outdir, exist_ok=True)
    import shutil; shutil.copyfile(os.path.join(HERE, "..", "lite", "sim.html"), os.path.join(outdir, "sim.html"))
    _write(os.path.join(outdir, "index.html"), s)
    _write(os.path.join(outdir, "manifest.webmanifest"), manifest_text())
    _write(os.path.join(outdir, "sw.js"), sw_text())
    print("lite ok", outdir, len(s))


if __name__ == "__main__":
    main()
