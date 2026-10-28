// The control panel for Nate Bloom's own plugins: knobs that fit a phone or a tablet (they wrap rather than shrink),
// drag up/down to turn (Shift or two fingers for fine control), double-tap for the default, presets and Reset.
const CSS = `
:host { display: block; }
.p { --acc: #7fd6c2; font: 13px/1.3 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; color: #ece6fa; background: #17131f; border-radius: 10px; padding: 12px 12px 14px; }
.p.inst { --acc: #ffb65c; }
.top { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-bottom: 10px; }
.desc { flex: 1 1 260px; color: #a99fc0; font-size: 12px; }
select, button { font: inherit; font-size: 12.5px; color: #ece6fa; background: #262033; border: 1px solid #3a3249; border-radius: 8px; height: 30px; padding: 0 10px; }
select { max-width: 190px; }
button:active { transform: scale(0.97); }
.knobs { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 10px 6px; }
.k { display: flex; flex-direction: column; align-items: center; gap: 2px; touch-action: none; user-select: none; -webkit-user-select: none; cursor: ns-resize; outline: none; border-radius: 10px; padding: 4px 0; }
.k:focus-visible { box-shadow: 0 0 0 2px var(--acc); }
.k svg { width: 58px; height: 58px; display: block; }
.k .v { font: 600 11.5px/1.2 ui-monospace, Menlo, monospace; color: #fff; }
.k .l { font-size: 11.5px; color: #b9afd0; text-align: center; }
.k.drag .v { color: var(--acc); }
.menu { grid-column: span 2; display: flex; flex-direction: column; align-items: center; gap: 6px; justify-content: center; }
.menu .seg { display: flex; border: 1px solid #3a3249; border-radius: 8px; overflow: hidden; }
.menu .seg button { border: 0; border-radius: 0; background: #1f1a2a; height: 32px; min-width: 44px; }
.menu .seg button[aria-pressed="true"] { background: var(--acc); color: #17131f; font-weight: 700; }
.menu .l { font-size: 11.5px; color: #b9afd0; }
.g { grid-column: 1 / -1; font: 600 10.5px/1.2 ui-monospace, Menlo, monospace; letter-spacing: 0.08em; text-transform: uppercase; color: #8e86a6; margin: 8px 0 -2px; border-top: 1px solid #2f2840; padding-top: 8px; }
.g:first-child { border-top: 0; margin-top: 0; padding-top: 0; }
`;
const fmt = (p, v) => {
  if (p.texts) { const i = Math.round((v - p.min) / (p.max - p.min || 1) * 100); return p.texts[Math.max(0, Math.min(100, i))]; }
  if (p.disp) {   // a control stored 0..1 shown in its own units (the plugin's own curves)
    const d = p.disp, y = d.f === "exp" ? d.a * Math.pow(d.b, v) : d.f === "sq" ? d.a * v * v : d.f === "id" ? v : d.a + d.b * v, u = d.u || "";
    if (u === "Hz") return y >= 1000 ? (y / 1000).toFixed(y >= 10000 ? 1 : 2) + " kHz" : (y < 10 ? y.toFixed(2) : Math.round(y)) + " Hz";
    if (u === "s") return y < 1 ? Math.round(y * 1000) + " ms" : y.toFixed(y < 10 ? 2 : 1) + " s";
    return (d.sign && y > 0.0001 ? "+" : "") + y.toFixed(d.d ?? 2) + (u ? " " + u : "");
  }
  const u = p.unit || "";
  if (u === "Hz") return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + " kHz" : (v < 10 ? v.toFixed(2) : Math.round(v)) + " Hz";
  if (u === "ms") return (v < 10 ? v.toFixed(1) : Math.round(v)) + " ms";
  if (u === "s") return v.toFixed(1) + " s";
  if (u === "%") return Math.round(v) + "%";
  if (u === "dB") return (v > 0 ? "+" : "") + v.toFixed(1) + " dB";
  return p.step >= 1 ? String(Math.round(v)) : v.toFixed(2);
};
const isLog = p => p.scale === "log" && p.min > 0;
// skew: a control whose knob position x maps to min + (max − min)·x^(1/skew), as the original plugin's own range does
const toPos = (p, v) => isLog(p) ? Math.log(v / p.min) / Math.log(p.max / p.min) : p.skew ? Math.pow(Math.max(0, (v - p.min) / (p.max - p.min)), p.skew) : (v - p.min) / (p.max - p.min);
const fromPos = (p, x) => { x = Math.max(0, Math.min(1, x)); let v = isLog(p) ? p.min * Math.pow(p.max / p.min, x) : p.skew ? p.min + (p.max - p.min) * Math.pow(x, 1 / p.skew) : p.min + x * (p.max - p.min); if (p.step >= 1) v = Math.round(v / p.step) * p.step; return Math.max(p.min, Math.min(p.max, v)); };
const arc = (a0, a1, r) => { const c = 29, p = a => [c + r * Math.cos(a), c + r * Math.sin(a)], [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`; };
const A0 = Math.PI * 0.75, SPAN = Math.PI * 1.5;

export function panel(plugin, M) {
  const node = plugin.audioNode, host = document.createElement("div"), root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${CSS}</style><div class="p${M.kind === "instrument" ? " inst" : ""}"><div class="top"><span class="desc"></span></div><div class="knobs"></div></div>`;
  root.querySelector(".desc").textContent = M.blurb || M.description || "";
  const top = root.querySelector(".top"), grid = root.querySelector(".knobs"), vals = {}, views = {};
  let pend = null, raf = 0;
  const flush = () => { raf = 0; if (!pend) return; const o = pend; pend = null; node.setParameterValues(o); };
  const set = (p, v, now) => { vals[p.id] = v; (pend || (pend = {}))[p.id] = { id: p.id, value: v, normalized: false }; views[p.id] && views[p.id](); if (now) flush(); else if (!raf) raf = requestAnimationFrame(flush); };
  if (M.presets && M.presets.length) {
    const sel = document.createElement("select"); sel.setAttribute("aria-label", "Preset");
    sel.innerHTML = "<option value=''>Presets…</option>"; M.presets.forEach((pr, i) => { const o = document.createElement("option"); o.value = i; o.textContent = pr.name; sel.appendChild(o); });
    sel.addEventListener("change", () => { const pr = M.presets[+sel.value]; if (!pr) return; M.params.forEach(p => set(p, pr.values[p.id] ?? p.init)); flush(); });
    top.appendChild(sel);
  }
  const rs = document.createElement("button"); rs.textContent = "Reset"; rs.addEventListener("click", () => { M.params.forEach(p => set(p, p.init)); flush(); }); top.appendChild(rs);
  let group = null;
  for (const p of M.params) {
    vals[p.id] = p.init;
    if (p.hidden) { views[p.id] = () => {}; continue; }
    if (p.group && p.group !== group) { group = p.group; const g = document.createElement("div"); g.className = "g"; g.textContent = group.replace(/\//g, " · "); grid.appendChild(g); }
    if (p.menu) {
      const w = document.createElement("div"); w.className = "menu";
      const seg = document.createElement("div"); seg.className = "seg"; seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", p.label);
      const btns = p.menu.map(([lab, val]) => { const b = document.createElement("button"); b.textContent = lab; b.setAttribute("role", "radio"); b.addEventListener("click", () => set(p, val, true)); seg.appendChild(b); return [b, val]; });
      const l = document.createElement("span"); l.className = "l"; l.textContent = p.short || p.label;
      w.append(seg, l); grid.appendChild(w);
      views[p.id] = () => btns.forEach(([b, val]) => b.setAttribute("aria-pressed", String(Math.round(vals[p.id]) === val)));
      continue;
    }
    const k = document.createElement("div"); k.className = "k"; k.tabIndex = 0; k.setAttribute("role", "slider"); k.setAttribute("aria-label", p.label);
    k.innerHTML = `<svg viewBox="0 0 58 58"><path class="bg" fill="none" stroke="#2f2840" stroke-width="5" stroke-linecap="round"/><path class="fg" fill="none" stroke="var(--acc)" stroke-width="5" stroke-linecap="round"/><circle cx="29" cy="29" r="15" fill="#241e31" stroke="#3a3249"/><line class="ptr" x1="29" y1="29" x2="29" y2="17" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg><span class="v"></span><span class="l"></span>`;
    k.querySelector(".bg").setAttribute("d", arc(A0, A0 + SPAN, 24));
    k.querySelector(".l").textContent = p.short || p.label;
    const fg = k.querySelector(".fg"), ptr = k.querySelector(".ptr"), vt = k.querySelector(".v");
    views[p.id] = () => {
      const x = Math.max(0, Math.min(1, toPos(p, vals[p.id]))), a = A0 + SPAN * x;
      fg.setAttribute("d", x > 0.001 ? arc(A0, a, 24) : ""); ptr.setAttribute("transform", `rotate(${(a + Math.PI / 2) * 180 / Math.PI} 29 29)`);
      vt.textContent = fmt(p, vals[p.id]); k.setAttribute("aria-valuetext", vt.textContent);
    };
    let drag = null, lastTap = 0;
    k.addEventListener("pointerdown", e => {
      e.preventDefault(); k.focus({ preventScroll: true });
      const now = performance.now(); if (now - lastTap < 320) { set(p, p.init, true); lastTap = 0; return; } lastTap = now;
      drag = { id: e.pointerId, y: e.clientY, x0: toPos(p, vals[p.id]) }; k.setPointerCapture(e.pointerId); k.classList.add("drag");
    });
    k.addEventListener("pointermove", e => { if (!drag || e.pointerId !== drag.id) return; const fine = e.shiftKey ? 0.25 : 1; set(p, fromPos(p, drag.x0 + (drag.y - e.clientY) / 170 * fine)); });
    const end = e => { if (drag && e.pointerId === drag.id) { drag = null; k.classList.remove("drag"); flush(); } };
    k.addEventListener("pointerup", end); k.addEventListener("pointercancel", end);
    k.addEventListener("wheel", e => { e.preventDefault(); set(p, fromPos(p, toPos(p, vals[p.id]) - Math.sign(e.deltaY) * 0.02)); }, { passive: false });
    k.addEventListener("keydown", e => {
      const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return; e.preventDefault(); e.stopPropagation(); set(p, fromPos(p, toPos(p, vals[p.id]) + d * (e.shiftKey ? 0.01 : 0.04)), true);
    });
    grid.appendChild(k);
  }
  M.params.forEach(p => views[p.id]());
  // the plugin's current settings
  Promise.resolve(node.getParameterValues(false)).then(o => { if (!o) return; M.params.forEach(p => { if (o[p.id] && Number.isFinite(o[p.id].value)) { vals[p.id] = o[p.id].value; views[p.id](); } }); }).catch(() => {});
  host._nbStop = () => { if (raf) cancelAnimationFrame(raf); flush(); };
  return host;
}
