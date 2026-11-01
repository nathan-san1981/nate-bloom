// Flight recorder for the Report button: taps, setting changes, errors, slow moments, app switches.
(() => {
  const L = window.__nbLog = [];
  const add = window.__nbAdd = (k, d) => { L.push([Math.round(performance.now()), k, String(d == null ? "" : d).slice(0, 400)]); if (L.length > 1200) L.splice(0, 300); };
  const desc = t => (t.id ? "#" + t.id : (t.getAttribute && (t.getAttribute("data-engine") || t.getAttribute("data-stem") || t.getAttribute("data-style"))) || String(t.className || t.tagName).split(" ")[0]) + (t.textContent && t.textContent.trim() ? ' "' + t.textContent.trim().replace(/\s+/g, " ").slice(0, 28) + '"' : "");
  addEventListener("error", e => add("error", (e.message || e.type) + " @" + String(e.filename || (e.target && (e.target.src || e.target.tagName)) || "").split("/").pop() + ":" + (e.lineno || "")), true);
  addEventListener("unhandledrejection", e => add("reject", e.reason && (e.reason.stack || e.reason.message) || e.reason));
  document.addEventListener("pointerdown", e => { const t = e.target && e.target.closest && e.target.closest("button, select, input, a, .w, .b, .kpad, .pad, canvas, .dj-song, .slot, [data-engine]"); add("tap", t ? desc(t) : String(e.target && e.target.tagName)); }, true);
  document.addEventListener("change", e => { const t = e.target; add("set", (t.id || t.getAttribute("aria-label") || t.tagName) + " = " + (t.type === "checkbox" ? t.checked : t.value)); }, true);
  // (146) some Android keyboards repeat a held key as fresh presses (repeat = false): a key already down is a repeat
  // (a key that's been quiet for 0.7 s counts as pressed again, in case its release went missing)
  { const down = new Map();
    window.addEventListener("keydown", e => { const c = e.code; if (!c) return; const now = performance.now(), last = down.get(c);
      if (!e.repeat && last != null && now - last < 700) { try { Object.defineProperty(e, "repeat", { value: true }); } catch (x) {} }
      down.set(c, now); }, true);
    window.addEventListener("keyup", e => { down.delete(e.code); }, true);
    window.addEventListener("blur", () => down.clear()); document.addEventListener("visibilitychange", () => { if (document.hidden) down.clear(); }); }
  document.addEventListener("keydown", e => { if (!e.repeat) add("key", e.key); }, true);
  document.addEventListener("visibilitychange", () => add("visible", !document.hidden));
  addEventListener("pagehide", () => add("pagehide", "")); addEventListener("pageshow", e => add("pageshow", e.persisted ? "from cache" : ""));
  ["error", "warn"].forEach(k => { const o = console[k]; console[k] = function (...a) { try { add("console." + k, a.map(x => x && x.stack || x).join(" ")); } catch (e) {} return o.apply(this, a); }; });
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 150) add("slow", Math.round(e.duration) + " ms (screen frozen)"); }).observe({ type: "longtask", buffered: true }); } catch (e) {}
  add("load", location.href.split("?")[0]);
})();
