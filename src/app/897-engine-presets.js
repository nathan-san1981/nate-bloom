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

  // ======================================================================
  // (208) The engine side panel. When the window is wide enough, the empty space right of the page holds every engine
  // and plugin as a list: tap one to open its presets under it, tap a preset to play it. The engine that's playing is
  // open and marked. (The Presets strip under the Quick row is for narrow windows, where there's no room beside.)
  // ======================================================================
  {
    const EB = () => window.__eb, appEl = document.querySelector(".app");
    const es = document.createElement("aside"); es.className = "es"; es.id = "engSide"; es.setAttribute("aria-label", "Engines and their presets"); es.hidden = true;
    document.body.appendChild(es);
    const esOpen = new Set(); let esKey = "", esLastEng = null, esShown = false;
    const catL = () => (window.__nbw && window.__nbw.CAT) || [];

    function esFits() {
      if (!appEl || !qkVisible() || document.body.classList.contains("live-on")) return null;
      const r = appEl.getBoundingClientRect(), gap = innerWidth - r.right;
      if (gap < 250) return null;
      const strip = document.getElementById("miniStrip"), bars = [document.getElementById("shell"), document.getElementById("buildBar"), strip];
      let top = 0; bars.forEach(b => { if (b && b.offsetHeight && getComputedStyle(b).position === "fixed") { const br = b.getBoundingClientRect(); if (br.height && br.bottom > top && br.top < 200) top = br.bottom; } });
      return { left: Math.round(r.right + 10), top: Math.round(top + 10), width: Math.min(420, Math.round(gap - 22)) };
    }
    function qkVisible() { const q = document.getElementById("qk"); if (!q) return false; const r = q.getBoundingClientRect(); return !!(q.offsetParent && r.width > 0); }

    function esRow(cls, name, sub, on, onClick, extra) {
      const b = document.createElement("button"); b.className = cls + (on ? " on" : "");
      const t = document.createElement("span"); t.className = "es-t";
      const n = document.createElement("b"); n.textContent = name; t.appendChild(n);
      if (sub) { const sm = document.createElement("small"); sm.textContent = sub; t.appendChild(sm); }
      b.appendChild(t); if (extra) b.appendChild(extra);
      b.addEventListener("click", onClick); return b;
    }
    function esSection(title) { const h = document.createElement("div"); h.className = "es-sec"; h.textContent = title; es.appendChild(h); }
    function esPick(fn) { return async ev => { const b = ev.currentTarget; es.querySelectorAll(".es-p.on").forEach(x => x.classList.remove("on")); b.classList.add("on"); try { await fn(); } catch (e) {} esPaint(true); }; }

    function esEngine(id, cur, curEng) {
      const E = ENGINES[id]; if (!E) return;
      const k = "e:" + id, L = EB().presetsOf(id), open = esOpen.has(k), playing = curEng === k;
      const wrap = document.createElement("div"); wrap.className = "es-e" + (open ? " open" : "") + (playing ? " playing" : "");
      const cnt = document.createElement("i"); cnt.className = "es-n"; cnt.textContent = L.length ? String(L.length) : "";
      wrap.appendChild(esRow("es-h", E.short || E.name, (E.short && E.short !== E.name ? E.name + " · " : "") + (E.after || ""), false, () => { open ? esOpen.delete(k) : esOpen.add(k); esPaint(true); }, cnt));
      if (open) {
        const box = document.createElement("div"); box.className = "es-ps";
        const plain = { id: k, name: E.name, sub: "the engine as it is", cat: "engines" };
        box.appendChild(esRow("es-p", "As it is", "no preset", cur === k, esPick(() => chooseEntry(plain, true))));
        const by = new Map(allEntries().map(e => [e.id, e]));
        L.forEach(([p, i]) => {
          const eid = "n:" + i, e = by.get(eid) || { id: eid, name: p[0], sub: "", cat: "nb" }, st = EB().engOfPreset(i);
          const sub = st.length > 1 ? "+ " + st.filter(x => x !== id).map(x => ENGINES[x] ? ENGINES[x].short || ENGINES[x].name : x).join(" + ") : "";
          box.appendChild(esRow("es-p", p[0], sub, cur === eid, esPick(() => chooseEntry(e, true))));
        });
        wrap.appendChild(box);
      }
      es.appendChild(wrap);
    }
    function esPlugin(c, cur, curEng) {
      const k = "w:" + c.key, open = esOpen.has(k), playing = curEng === k, m = EB().plugPresets ? null : null;
      const wrap = document.createElement("div"); wrap.className = "es-e" + (open ? " open" : "") + (playing ? " playing" : "");
      wrap.appendChild(esRow("es-h", c.name, c.vendor === "Nathan" ? "your plugin" : (c.vendor || "plugin"), false, () => { open ? esOpen.delete(k) : esOpen.add(k); esPaint(true); }));
      if (open) {
        const box = document.createElement("div"); box.className = "es-ps"; wrap.appendChild(box);
        const plainE = { id: "w:wam:" + c.key, name: c.name, sub: "plugin", cat: "plugins", sus: 1 };
        box.appendChild(esRow("es-p", "As it is", c.native ? "its presets are in its own window" : "its default sound", cur === plainE.id, esPick(() => chooseEntry(plainE, false))));
        const note = document.createElement("p"); note.className = "es-none"; note.textContent = "Loading its presets…"; box.appendChild(note);
        EB().plugPresets(c.key).then(m => {
          note.remove();
          if (!m || !m.list || !m.list.length) { if (!c.native) { note.textContent = "No preset list: its sounds come from its own controls."; box.appendChild(note); } return; }
          m.list.forEach((pr, i) => box.appendChild(esRow("es-p", pr.name, "", cur === "pp:" + c.key + "#" + i, esPick(() => EB().choosePlugPreset(c, pr, i)))));
          if (playing) { const on = box.querySelector(".es-p.on"); if (on) on.scrollIntoView({ block: "nearest" }); }
        });
      }
      es.appendChild(wrap);
    }
    function esPaint(force) {
      const eb = EB(); if (!eb) return;
      let curEng = null; try { curEng = eb.engineOfCur(); } catch (e) {}
      if (curEng !== esLastEng) { if (curEng) esOpen.add(curEng); esLastEng = curEng; force = true; }
      const cur = state.cur && state.cur.id || "", key = cur + "|" + [...esOpen].join(",") + "|" + catL().length;
      if (!force && key === esKey) return; esKey = key;
      const st = es.scrollTop; es.innerHTML = "";
      const head = document.createElement("div"); head.className = "es-top";
      const ht = document.createElement("b"); ht.textContent = "Engines"; head.appendChild(ht);
      const hs = document.createElement("small"); hs.textContent = "tap one for its presets"; head.appendChild(hs);
      es.appendChild(head);
      let ids = []; try { ids = window.__qkLive.items().filter(q => q.eng).map(q => q.eng); } catch (e) {}
      if (!ids.length) ids = Object.keys(ENGINES).filter(id => ENGINES[id].short);
      ids.forEach(id => esEngine(id, cur, curEng));
      const P = catL().filter(c => c.kind === "instrument");
      const nb = P.filter(c => /^natebloom\//.test(c.url || "")), other = P.filter(c => !/^natebloom\//.test(c.url || ""));
      if (nb.length) { esSection("Nate Bloom plugins"); nb.forEach(c => esPlugin(c, cur, curEng)); }
      if (other.length) { esSection("Other plugins"); other.forEach(c => esPlugin(c, cur, curEng)); }
      const more = document.createElement("button"); more.className = "es-more"; more.textContent = "Drum kits and everything else…";
      more.addEventListener("click", () => { try { eb.open(null); } catch (e) {} }); es.appendChild(more);
      es.scrollTop = st;
      if (force && curEng) { const pw = es.querySelector(".es-e.playing .es-p.on") || es.querySelector(".es-e.playing"); if (pw) { const r = pw.getBoundingClientRect(), er = es.getBoundingClientRect(); if (r.top < er.top || r.bottom > er.bottom) pw.scrollIntoView({ block: "center" }); } }
    }
    function esPlace() {
      const f = esFits();
      if (!f) { if (esShown) { es.hidden = true; document.body.classList.remove("es-on"); esShown = false; } return; }
      es.style.left = f.left + "px"; es.style.top = f.top + "px"; es.style.width = f.width + "px";
      if (!esShown) { es.hidden = false; document.body.classList.add("es-on"); esShown = true; esPaint(true); }
      else esPaint(false);
    }
    addEventListener("resize", esPlace);
    { const st = setSoundText; setSoundText = function () { const r = st.apply(this, arguments); setTimeout(esPlace, 0); return r; }; }
    setInterval(() => { if (!document.hidden) esPlace(); }, 500);
    setTimeout(esPlace, 0);
    window.__es = { place: esPlace, paint: () => esPaint(true), open: esOpen };
  }
