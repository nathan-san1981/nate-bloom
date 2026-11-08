/* Nate Bloom Box — Jam along (box/apps/jam.js, served by the app as /box/jam.js).
   Music from the phone or the radio (Listen: Spotify Connect / AirPlay / YouTube; Radio) keeps playing under Nate Bloom, Keys and the home screen
   when "Keep playing" is on in Listen. This adds:
     - a now-playing chip in the page's top bar, only while something plays;
     - tap the chip: the Jam sheet (song, backing-track level, mute, stop);
     - while the sheet is open, a controller's level fader sets the backing track (MiniLab fader 4, KeyLab fader 9).
   Pages load it and call NBJam.mount({ bar: () => element, before: () => element|null }).
   Nothing here starts music or changes anything by itself: it reads, and acts only on a tap or a fader move. */
(() => {
  "use strict";
  const B = window.NBBox;
  if (!B || !B.listen || window.NBJam) return;
  const J = window.NBJam = { st: null, open: false, mounts: [], onState: [] };
  const css = `
.nbj-chip{display:inline-flex;align-items:center;gap:7px;height:32px;max-width:190px;padding:0 11px;border-radius:999px;border:0;cursor:pointer;
  background:#1e2a24;color:#9fe3bd;font:600 12.5px/1 Inter,system-ui,sans-serif;box-shadow:0 0 0 1.5px #7fdcae inset;white-space:nowrap;flex:none}
.nbj-chip span{overflow:hidden;text-overflow:ellipsis}
.nbj-chip i{width:9px;height:9px;border-radius:50%;background:#7fdcae;flex:none}
.nbj-chip.paused{color:#a4a7ae;background:#22252c;box-shadow:0 0 0 1.5px #3a3d45 inset}.nbj-chip.paused i{background:#74777e}
.nbj-back{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:none}
.nbj-back.on{display:block}
.nbj-sheet{position:absolute;right:0;top:0;bottom:0;width:380px;max-width:92vw;background:#15171b;border-left:1px solid #2c2f37;color:#f2efe8;
  padding:16px 18px;box-sizing:border-box;font-family:Inter,system-ui,sans-serif;overflow:auto}
.nbj-sheet .k{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8a8d94;font-weight:650}
.nbj-sheet .song{font-size:27px;font-weight:750;margin:6px 0 2px;line-height:1.1;letter-spacing:-.01em}
.nbj-sheet .art{font-size:14.5px;color:#a4a7ae}
.nbj-sheet .stt{margin-top:8px;color:#7fdcae;font-size:13px;font-weight:600}
.nbj-sheet h4{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8a8d94;margin:22px 0 8px;font-weight:650}
.nbj-sl{position:relative;height:48px;border-radius:12px;background:#1f2228;overflow:hidden;touch-action:none;cursor:pointer}
.nbj-sl b{position:absolute;left:0;top:0;bottom:0;background:#2f6b54}
.nbj-sl span{position:absolute;left:14px;top:15px;font-size:14.5px;font-weight:600;pointer-events:none}
.nbj-sl em{position:absolute;right:14px;top:15px;font-size:13.5px;color:#cfe9db;font-style:normal;pointer-events:none}
.nbj-row{display:flex;gap:10px;margin-top:12px}
.nbj-btn{flex:1;height:46px;border-radius:12px;border:0;background:#22252c;color:#f2efe8;font:600 15px Inter,system-ui,sans-serif;cursor:pointer}
.nbj-btn.on{background:#c9b6ff;color:#17181c}.nbj-btn.red{color:#ff9b8a}
.nbj-hint{font-size:12.5px;color:#8a8d94;margin-top:16px;line-height:1.45}
.nbj-x{position:absolute;right:12px;top:10px;width:44px;height:44px;border-radius:12px;border:0;background:#22252c;color:#f2efe8;font-size:20px;cursor:pointer}`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const playing = s => !!(s && (s.spotify || s.airplay || s.youtube || s.radio) && s.now && s.now.state && s.now.state !== "idle" && s.now.state !== "stopped");
  J.playing = () => playing(J.st);
  const db = v => v <= 0.001 ? "−∞" : (20 * Math.log10(v)).toFixed(0) + " dB";

  /* ---- the sheet ---- */
  const back = document.createElement("div"); back.className = "nbj-back";
  back.innerHTML = `<div class="nbj-sheet" role="dialog" aria-label="Music from your phone">
    <button class="nbj-x" aria-label="Close">✕</button>
    <div class="k nbj-src">Playing from your phone</div><div class="song nbj-song"></div><div class="art nbj-art"></div><div class="stt nbj-stt"></div>
    <h4>Backing track level</h4>
    <div class="nbj-sl" role="slider" aria-label="Backing track level" tabindex="0"><b></b><span>Backing track</span><em></em></div>
    <div class="nbj-row"><button class="nbj-btn nbj-mute">Mute</button><button class="nbj-btn red nbj-stop">Stop Listen</button></div>
    <div class="nbj-row"><button class="nbj-btn nbj-open">Listen screen</button></div>
    <div class="nbj-hint">Play, pause and skip on the phone. While this is open, the controller's level fader (MiniLab fader 4, KeyLab fader 9) sets the backing track instead. Opening Stream, Media or Games stops the music.</div>
  </div>`;
  const q = s => back.querySelector(s);
  const attach = () => { if (!back.isConnected) document.body.appendChild(back); };
  J.openSheet = () => { attach(); J.open = true; back.classList.add("on"); paint(); };
  J.closeSheet = () => { J.open = false; back.classList.remove("on"); };
  back.addEventListener("click", e => { if (e.target === back) J.closeSheet(); });
  q(".nbj-x").onclick = J.closeSheet;
  addEventListener("keydown", e => { if (J.open && e.key === "Escape") { e.preventDefault(); J.closeSheet(); } }, true);
  let lvlT = 0, lvlWant = null;
  function setLevel(v) {
    v = Math.max(0, Math.min(1, v));
    if (J.st) J.st.level = v;
    paintLevel();
    lvlWant = v; if (lvlT) return;
    lvlT = setTimeout(async () => { const w = lvlWant; lvlT = 0; await B.listen("level", w).catch(() => {}); }, 60);
  }
  function paintLevel() {
    const v = J.st && J.st.level != null ? J.st.level : 1;
    q(".nbj-sl b").style.width = (v * 100) + "%";
    q(".nbj-sl em").textContent = J.st && J.st.muted ? "muted" : db(v);
  }
  (() => {
    const sl = q(".nbj-sl"); let drag = false;
    const at = e => { const r = sl.getBoundingClientRect(); setLevel((e.clientX - r.left) / r.width); };
    sl.addEventListener("pointerdown", e => { drag = true; sl.setPointerCapture(e.pointerId); at(e); });
    sl.addEventListener("pointermove", e => { if (drag) at(e); });
    ["pointerup", "pointercancel"].forEach(t => sl.addEventListener(t, () => { drag = false; }));
    sl.addEventListener("keydown", e => { const v = (J.st && J.st.level) || 0; if (e.key === "ArrowRight" || e.key === "ArrowUp") { setLevel(v + .05); e.preventDefault(); } if (e.key === "ArrowLeft" || e.key === "ArrowDown") { setLevel(v - .05); e.preventDefault(); } });
  })();
  q(".nbj-mute").onclick = async () => { const r = await B.listen("mute", !(J.st && J.st.muted)).catch(() => null); if (r) { J.st = r; paint(); } };
  q(".nbj-open").onclick = () => { J.closeSheet(); B.go && B.go("listen"); };
  q(".nbj-stop").onclick = async () => { const r = await B.listen("stop").catch(() => null); J.st = r; J.closeSheet(); paint(); };

  /* the level fader while the sheet is open (relative CCs aren't faders; these are absolute 0–127) */
  const LEVEL_CC = { 17: 1, 85: 1 };   // MiniLab fader 4 (Arturia program), KeyLab fader 9
  function fromMidi(data) {
    if (!J.open) return false;
    const [s, cc, v] = data;
    if ((s & 0xf0) !== 0xb0 || !LEVEL_CC[cc]) return false;
    setLevel(v / 127); return true;
  }
  // Nate Bloom's own MIDI handling asks first (window.__midiTap), so the fader moves the backing track, not the master
  const prevTap = window.__midiTap;
  window.__midiTap = e => fromMidi(e.data) || (prevTap ? prevTap(e) : false);
  // other pages (Keys, the home screen) don't route faders anywhere: listen directly
  if (!window.__nbAppMidi && navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(acc => {
    const hook = () => acc.inputs.forEach(i => i.addEventListener("midimessage", m => fromMidi(m.data)));
    hook(); acc.addEventListener("statechange", e => { if (e.port && e.port.type === "input" && e.port.state === "connected") e.port.addEventListener("midimessage", m => fromMidi(m.data)); });
  }).catch(() => {});

  /* ---- the chip ---- */
  function chipFor(m) {
    if (m.chip && m.chip.isConnected) return m.chip;
    const bar = m.bar(); if (!bar) return null;
    const c = document.createElement("button"); c.type = "button"; c.className = "nbj-chip"; c.hidden = true;
    c.setAttribute("aria-label", "Music from your phone: level and stop");
    c.innerHTML = "<i></i><span></span>";
    c.addEventListener("click", J.openSheet);
    const bf = m.before ? m.before() : null;
    bar.insertBefore(c, bf && bf.parentNode === bar ? bf : null);
    m.chip = c; return c;
  }
  J.mount = opt => { J.mounts.push({ bar: opt.bar, before: opt.before, chip: null }); paint(); };

  function paint() {
    const s = J.st, on = playing(s);
    for (const m of J.mounts) {
      const c = chipFor(m); if (!c) continue;
      c.hidden = !on;
      if (on) { c.classList.toggle("paused", s.now.state === "paused"); c.querySelector("span").textContent = [s.now.name || "Playing", s.now.artists].filter(Boolean).join(" · "); }
    }
    if (back.isConnected) {
      q(".nbj-src").textContent = "Playing from your phone" + (s && s.now && s.now.source ? " · " + s.now.source : "");
      q(".nbj-song").textContent = on ? (s.now.name || "Playing") : "Nothing playing";
      q(".nbj-art").textContent = on ? [s.now.artists, s.now.album].filter(Boolean).join(" · ") : "Pick “Nate Bloom Box” in Spotify, YouTube or AirPlay";
      q(".nbj-stt").textContent = on ? "● " + s.now.state : "";
      q(".nbj-mute").classList.toggle("on", !!(s && s.muted)); q(".nbj-mute").textContent = s && s.muted ? "Unmute" : "Mute";
      paintLevel();
    }
    J.onState.forEach(f => { try { f(s); } catch (e) {} });
  }
  async function poll() {
    const s = await B.listen("status").catch(() => null);
    if (s && lvlT && J.st) s.level = J.st.level;   // (a level change in flight wins)
    J.st = s; paint();
  }
  poll(); setInterval(poll, 2000);
  // pages that redraw their top bar (Keys) lose the chip: put it back
  setInterval(() => { if (J.mounts.some(m => !(m.chip && m.chip.isConnected))) paint(); }, 700);
})();
