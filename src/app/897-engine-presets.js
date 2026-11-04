  // ======================================================================
  // (207) Presets right on the screen. The Quick row wraps so every engine shows at once, and under it a Presets
  // strip lists the presets of the engine that's playing: tap an engine, its presets appear; tap a preset, it plays.
  // A plugin shows its own presets (its preset list, or its Sound / Mode / Engine menu). "All engines…" opens the
  // sound browser's By engine view for the plugins and kits that aren't in the Quick row.
  // ======================================================================
  {
    const qk = document.getElementById("qk"), EB = () => window.__eb;
    const ep = document.createElement("div"); ep.className = "ep"; ep.id = "epStrip"; ep.setAttribute("role", "group"); ep.setAttribute("aria-label", "Presets");
    if (qk) qk.after(ep);
    let epKey = "", epOpen = {};   // epOpen[engine]: the long list is shown in full
    const EP_FOLD = 14;

    function epChip(name, sub, on, onPick, title) {
      const b = document.createElement("button"); b.className = "ep-c" + (on ? " on" : "");
      const n = document.createElement("b"); n.textContent = name; b.appendChild(n);
      if (sub) { const s = document.createElement("small"); s.textContent = sub; b.appendChild(s); }
      b.title = title || "Play " + name; b.setAttribute("aria-label", b.title); b.setAttribute("aria-pressed", on ? "true" : "false");
      b.addEventListener("click", async () => {
        ep.querySelectorAll(".ep-c.on").forEach(x => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
        b.classList.add("on"); b.setAttribute("aria-pressed", "true");
        try { await onPick(); } catch (e) {}
        epPaint(true);
      });
      return b;
    }
    function epHead(title, sub, eng) {
      const h = document.createElement("div"); h.className = "ep-h";
      const l = document.createElement("span"); l.className = "qk-lab"; l.textContent = "Presets"; h.appendChild(l);
      const t = document.createElement("b"); t.textContent = title; h.appendChild(t);
      if (sub) { const s = document.createElement("small"); s.textContent = sub; h.appendChild(s); }
      const more = document.createElement("button"); more.className = "ep-more"; more.textContent = "All engines & plugins…";
      more.title = "Every engine, plugin and kit, with their presets"; more.addEventListener("click", () => { try { EB().open(null); } catch (e) {} });
      h.appendChild(more);
      return h;
    }
    function epList(items, eng) {
      const g = document.createElement("div"); g.className = "ep-g";
      const long = items.length > EP_FOLD + 2 && !epOpen[eng];
      const onAt = items.findIndex(x => x.on);
      const shown = long ? items.filter((x, i) => i < EP_FOLD || i === onAt) : items;
      shown.forEach(x => g.appendChild(epChip(x.name, x.sub, x.on, x.pick, x.title)));
      if (long) { const m = document.createElement("button"); m.className = "ep-c ep-fold"; m.textContent = "+" + (items.length - shown.length) + " more"; m.addEventListener("click", () => { epOpen[eng] = true; epPaint(true); }); g.appendChild(m); }
      else if (epOpen[eng] && items.length > EP_FOLD + 2) { const m = document.createElement("button"); m.className = "ep-c ep-fold"; m.textContent = "Fewer"; m.addEventListener("click", () => { epOpen[eng] = false; epPaint(true); }); g.appendChild(m); }
      return g;
    }
    function epPaint(force) {
      const eb = EB(); if (!eb) return;
      let k = null; try { k = eb.engineOfCur(); } catch (e) {}
      const cur = state.cur && state.cur.id || "", key = k + "|" + cur + "|" + (epOpen[k] ? 1 : 0);
      if (!force && key === epKey) return; epKey = key;
      ep.innerHTML = "";
      if (!k) { ep.hidden = true; return; }
      ep.hidden = false;
      if (k.startsWith("e:")) {
        const id = k.slice(2), E = ENGINES[id]; if (!E) { ep.hidden = true; return; }
        ep.appendChild(epHead(E.short || E.name, (E.short && E.short !== E.name ? E.name + " · " : "") + (E.after || ""), k));
        const by = new Map(allEntries().map(e => [e.id, e])), items = [];
        const plain = { id: "e:" + id, name: E.name, sub: "the engine as it is", cat: "engines" };
        items.push({ name: "As it is", sub: "no preset", on: cur === plain.id, pick: () => chooseEntry(plain, true), title: E.name + " with its own settings" });
        eb.presetsOf(id).forEach(([p, i]) => {
          const eid = "n:" + i, e = by.get(eid) || { id: eid, name: p[0], sub: "", cat: "nb" }, stack = eb.engOfPreset(i);
          const sub = stack.length > 1 ? "+ " + stack.filter(x => x !== id).map(x => ENGINES[x] ? ENGINES[x].short || ENGINES[x].name : x).join(" + ") : "";
          items.push({ name: p[0], sub, on: cur === eid, pick: () => chooseEntry(e, true), title: "Play " + p[0] + (sub ? " (" + E.name + " " + sub + ")" : "") });
        });
        ep.appendChild(epList(items, k));
        if (items.length === 1) { const n = document.createElement("p"); n.className = "ep-none"; n.textContent = "No presets for " + E.name + " yet. Shape it with its knobs below, then ★ Save it."; ep.appendChild(n); }
        return;
      }
      // a plugin
      const pk = k.slice(2), c = ((window.__nbw && window.__nbw.CAT) || []).find(x => x.key === pk); if (!c) { ep.hidden = true; return; }
      ep.appendChild(epHead(c.name, c.vendor === "Nathan" ? "your plugin" : (c.vendor || "plugin"), k));
      const fill = m => {
        if (!m || !m.list || !m.list.length) {
          const n = document.createElement("p"); n.className = "ep-none";
          n.textContent = m === null ? "Loading its presets…" : c.native ? "This plugin keeps its presets in its own window: Controls on the Playing row." : "It has no preset list; its sounds come from its own controls.";
          ep.appendChild(n); return;
        }
        ep.appendChild(epList(m.list.map((pr, i) => ({ name: pr.name, sub: "", on: cur === "pp:" + pk + "#" + i, pick: () => eb.choosePlugPreset(c, pr, i) })), k));
      };
      eb.plugPresets(pk).then(m => { if (epKey === key) { const n = ep.querySelector(".ep-none"); if (n) n.remove(); fill(m); } });
    }
    { const st = setSoundText; setSoundText = function () { const r = st.apply(this, arguments); setTimeout(() => epPaint(false), 0); return r; }; }
    setInterval(() => { if (!document.hidden) epPaint(false); }, 600);
    setTimeout(() => epPaint(true), 0);
    window.__ep = { paint: () => epPaint(true) };
  }
