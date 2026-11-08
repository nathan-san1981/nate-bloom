/* Nate Bloom Box — idle screen (box/apps/idle.js, served by the app as /box/idle.js).
   Off until switched on in the home screen's Settings. After the chosen minutes with no touch, key, knob, pad or
   controller input, the page is covered by a clock, the weather for the place set there (Open-Meteo, fetched by the app)
   and what's playing. Any input takes it away again (and does nothing else: the tap that wakes it isn't a tap on the
   page). Pages load it after jam.js; it changes nothing in the page and starts nothing by itself. */
(() => {
  "use strict";
  const B = window.NBBox;
  if (!B || !B.idle || window.NBIdle) return;
  const I = window.NBIdle = { on: false, cfg: { on: false, minutes: 5 }, last: Date.now() };
  const css = `
.nbi{position:fixed;inset:0;z-index:3000;background:#000;color:#f2efe8;font-family:Inter,system-ui,sans-serif;display:none;cursor:none;touch-action:none}
.nbi.on{display:block}
.nbi .in{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);padding:0 60px;transition:transform 1s}
.nbi .time{font-size:150px;font-weight:200;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums;color:#e8e4da}
.nbi .time small{font-size:36px;font-weight:400;color:#8a8d94;margin-left:12px;letter-spacing:0}
.nbi .date{font-size:24px;color:#a4a7ae;margin-top:10px}
.nbi .wx{position:absolute;right:60px;top:50%;transform:translateY(-50%);text-align:right;display:none}
.nbi .wx.on{display:block}
.nbi .wx .t{font-size:72px;font-weight:300;line-height:1;color:#e8e4da}
.nbi .wx .d{font-size:19px;color:#a4a7ae;margin-top:8px}
.nbi .wx .p{font-size:14px;color:#74777e;margin-top:4px}
.nbi .wx .days{display:flex;gap:18px;justify-content:flex-end;margin-top:18px}
.nbi .wx .days div{font-size:13.5px;color:#8a8d94;text-align:center}
.nbi .wx .days b{display:block;color:#cfccc4;font-weight:600;font-size:14.5px;margin-top:2px}
.nbi .np{position:absolute;left:60px;right:60px;bottom:44px;display:none;align-items:center;gap:14px;color:#a4a7ae;font-size:17px}
.nbi .np.on{display:flex}
.nbi .np i{width:10px;height:10px;border-radius:50%;background:#7fdcae;flex:none}
.nbi .np b{color:#e8e4da;font-weight:600}`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
  const el = document.createElement("div"); el.className = "nbi"; el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="in"><div class="time"><span></span><small></small></div><div class="date"></div></div>
    <div class="wx"><div class="t"></div><div class="d"></div><div class="p"></div><div class="days"></div></div>
    <div class="np"><i></i><span></span></div>`;
  const attach = () => { if (!el.isConnected) document.body.appendChild(el); };
  const q = s => el.querySelector(s);

  /* activity */
  let swallow = 0;   // (the tap that wakes the screen: its click, which lands after the cover is gone, is not for the page)
  const wake = e => {
    I.last = Date.now();
    if (I.on) { hide(); if (e && e.cancelable) e.preventDefault(); if (e && e.stopPropagation) { e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation(); } if (e && /^(pointer|touch)/.test(e.type)) swallow = Date.now(); }
  };
  ["click", "pointerup", "touchend", "keyup"].forEach(t => addEventListener(t, e => { if (swallow && Date.now() - swallow < 900) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation(); if (t === "click") swallow = 0; } }, { capture: true, passive: false }));
  ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach(t => addEventListener(t, e => { if (I.on || t !== "pointermove") wake(e); else I.last = Date.now(); }, { capture: true, passive: false }));
  // MIDI: in Nate Bloom through its tap (never swallowing the note: a key both plays and wakes); elsewhere its own access
  const prevTap = window.__midiTap;
  window.__midiTap = e => { I.last = Date.now(); if (I.on) hide(); return prevTap ? prevTap(e) : false; };
  if (!window.__nbAppMidi && navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(acc => {
    const on = i => i.addEventListener("midimessage", () => { I.last = Date.now(); if (I.on) hide(); });
    acc.inputs.forEach(on); acc.addEventListener("statechange", ev => { if (ev.port && ev.port.type === "input" && ev.port.state === "connected") on(ev.port); });
  }).catch(() => {});
  // a controller: any button or stick movement
  let padSig = "";
  setInterval(() => {
    const g = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean); if (!g) return;
    const sig = g.buttons.map(b => b.pressed ? 1 : 0).join("") + g.axes.map(a => Math.round(a * 4)).join(",");
    if (sig !== padSig) { if (padSig) { I.last = Date.now(); if (I.on) hide(); } padSig = sig; }
  }, 150);

  /* the screen */
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const WMO = c => c === 0 ? "Clear" : c <= 2 ? "Partly cloudy" : c === 3 ? "Overcast" : c <= 48 ? "Fog" : c <= 57 ? "Drizzle" : c <= 67 ? "Rain" : c <= 77 ? "Snow" : c <= 82 ? "Showers" : c <= 86 ? "Snow showers" : "Thunderstorms";
  const SYM = c => c === 0 ? "☀" : c <= 2 ? "⛅" : c === 3 ? "☁" : c <= 48 ? "≡" : c <= 67 ? "☂" : c <= 77 ? "❄" : c <= 82 ? "☂" : c <= 86 ? "❄" : "⚡";
  let clockT = 0, wxT = 0, npT = 0, drift = 0;
  function clock() {
    const d = new Date(); let h = d.getHours(); const pm = h >= 12; h = h % 12 || 12;
    q(".time span").textContent = h + ":" + String(d.getMinutes()).padStart(2, "0"); q(".time small").textContent = pm ? "PM" : "AM";
    q(".date").textContent = DAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate();
    drift = (drift + 1) % 6; q(".in").style.transform = "translateY(" + (-50 + (drift - 2.5) * 1.2) + "%)";   // (a slow drift, kind to the panel)
  }
  async function weather() {
    const w = await B.idle("weather").catch(() => null); const box = q(".wx");
    if (!w || !w.ok) { box.classList.remove("on"); return; }
    box.classList.add("on");
    q(".wx .t").textContent = SYM(w.now.code) + " " + Math.round(w.now.temp) + "°";
    q(".wx .d").textContent = WMO(w.now.code) + " · wind " + Math.round(w.now.wind) + (w.unit === "c" ? " km/h" : " mph");
    q(".wx .p").textContent = w.place || "";
    q(".wx .days").innerHTML = (w.days || []).slice(0, 3).map((d, i) => { const dt = new Date(d.day + "T12:00:00"); return `<div>${i === 0 ? "Today" : DAYS[dt.getDay()]}<b>${Math.round(d.hi)}° / ${Math.round(d.lo)}°</b></div>`; }).join("");
  }
  async function np() {
    const s = await B.listen("status").catch(() => null); const box = q(".np");
    const on = !!(s && s.now && s.now.state && s.now.state !== "idle" && s.now.state !== "stopped");
    box.classList.toggle("on", on);
    if (on) box.querySelector("span").innerHTML = (s.now.state === "paused" ? "Paused · " : "") + "<b></b>" + (s.now.artists ? " · " + s.now.artists.replace(/[<>&]/g, "") : "") + (s.now.source ? " · " + s.now.source : ""), box.querySelector("b").textContent = s.now.name || "Playing";
  }
  function show() {
    if (I.on) return; attach(); I.on = true; el.classList.add("on");
    clock(); weather(); np();
    clockT = setInterval(clock, 10000); wxT = setInterval(weather, 15 * 60000); npT = setInterval(np, 4000);
  }
  function hide() {
    if (!I.on) return; I.on = false; el.classList.remove("on");
    clearInterval(clockT); clearInterval(wxT); clearInterval(npT);
  }
  el.addEventListener("pointerdown", wake, { capture: true });
  el.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); }, { capture: true });
  I.show = show; I.hide = hide;

  /* settings: re-read every minute, so a change in Settings applies without a restart */
  async function cfg() { const c = await B.idle("get").catch(() => null); if (c) I.cfg = c; if (!I.cfg.on && I.on) hide(); }
  cfg(); setInterval(cfg, 60000);
  setInterval(() => { if (I.cfg.on && !I.on && document.visibilityState !== "hidden" && Date.now() - I.last > (I.cfg.minutes || 5) * 60000) show(); }, 5000);
})();
