  // ======================================================================
  // (206) Sounds by engine. In the sound browser, "Engines" is two steps: every engine and instrument plugin, grouped
  // (the synths, drums and samplers, your plugins, Nate Bloom's plugins, other plugins, plugins on this computer),
  // and tapping one shows its presets: the engine as it is, then every Nate Bloom and Classic Synths preset on it
  // (stacks under each engine in them), or a plugin's own presets (its preset list, or its Sound / Mode / Engine
  // menu). Tapping the sound name opens straight on the current engine's presets.
  // ======================================================================
  {
    // presets added to Classic Synths after it was folded into NB_PRESETS (the Alpha Juno's, the Sync Lead's) join it
    const syncClassic = () => { for (const p of CLASSIC_PRESETS) if (!NB_PRESETS.includes(p)) NB_PRESETS.push(p); };
    syncClassic(); setTimeout(syncClassic, 0);

    const ebL = () => document.getElementById("brList"), ebC = () => document.getElementById("brCats");   // (by id: other modules have their own brList)
    let ebEng = null;   // null: the list of engines; "e:<id>" a built-in engine; "w:<plugin key>" a plugin
    const ebMeta = new Map();   // plugin key -> its meta.json (null while loading, false if it has none)
    const EB_SUBS = ["sound", "mode", "engine"];

    const engOfPreset = i => { const p = NB_PRESETS[i]; return p ? (Array.isArray(p[1]) ? p[1] : [p[1]]) : []; };
    const presetsOf = id => NB_PRESETS.map((p, i) => [p, i]).filter(([p, i]) => engOfPreset(i).includes(id));
    const cat = () => (window.__nbw && window.__nbw.CAT) || [];
    const plugInsts = () => cat().filter(c => c.kind === "instrument");
    function engineOfCur() {
      const c = state.cur && state.cur.id; if (!c) return state.engine && ENGINES[state.engine] ? "e:" + state.engine : null;
      if (c.startsWith("n:")) { const s = engOfPreset(Number(c.slice(2))); return s.length ? "e:" + s[0] : null; }
      if (c.startsWith("e:") && ENGINES[c.slice(2)]) return c;
      if (c.startsWith("w:wam:")) return "w:" + c.slice(6).split("#")[0];
      if (c.startsWith("pp:")) return "w:" + c.slice(3).split("#")[0];
      return state.engine && ENGINES[state.engine] ? "e:" + state.engine : null;
    }
    // a plugin's presets: its own list, else the options of its Sound / Mode / Engine menu
    async function plugPresets(key) {
      if (ebMeta.has(key)) return ebMeta.get(key);
      const c = cat().find(x => x.key === key); ebMeta.set(key, null);
      if (c && c.native) { const d = await doorway(c); ebMeta.set(key, d || false); return d || false; }
      if (!c || !/^natebloom\//.test(c.url || "")) { ebMeta.set(key, false); return false; }
      try {
        const base = new URL((window.NB_LITE ? "../" : "") + "wam/", location.href).href;
        const r = await fetch(base + c.url.replace(/index\.js$/, "meta.json")); const M = await r.json();
        let list = (M.presets || []).map(p => ({ name: p.name, values: p.values, full: true }));
        if (!list.length) {
          const pm = EB_SUBS.map(id => (M.params || []).find(p => p.id === id && Array.isArray(p.menu))).find(Boolean);
          if (pm) list = pm.menu.map(([label, v]) => ({ name: label, values: { [pm.id]: v }, full: false })).filter(x => !/^custom$/i.test(x.name));
        }
        const out = { params: M.params || [], list }; ebMeta.set(key, out); return out;
      } catch (e) { ebMeta.set(key, false); return false; }
    }
    // (229) the doorways (Linux app): an installed plugin's own factory presets, read from its data folder. Surge XT's 637
    // factory patches (.fxp in ~/.local/share/surge-xt/patches_factory, put there by Get free plugins): each one is the
    // plugin's own state after the file's 60-byte header, so choosing one loads the real patch (checked in the store CI).
    const DOORS = [{ re: /^surge xt$/i, dir: "surge-xt/patches_factory", ext: /\.fxp$/i, skip: 60 }];
    async function doorway(c) {
      const NP = window.NBPlug, D = DOORS.find(d => d.re.test(c.name || "")); if (!NP || !NP.presets || !D || c.kind === "effect") return null;
      let rels = []; try { rels = await NP.presets(D.dir); } catch (e) {}
      rels = (rels || []).filter(r => D.ext.test(r)).sort();
      if (!rels.length) return null;
      const list = rels.map(r => { const parts = r.split("/"), name = parts.pop().replace(D.ext, ""), cat = parts.pop() || ""; return { name: name, cat: cat, rel: r, skip: D.skip, door: true, values: {} }; });
      return { params: [], list, door: true };
    }
    async function doorApply(W, c, pr) {
      const b64 = await window.NBPlug.preset(pr.rel); if (!b64) throw new Error("couldn't read " + pr.rel);
      const raw = atob(b64).slice(pr.skip || 0); let s = ""; for (let i = 0; i < raw.length; i += 0x8000) s += raw.slice(i, i + 0x8000);
      await W.node.setState({ nbplug: 1, fmt: c.fmt, uid: c.uid, state: btoa(s) });
    }
    async function plugApply(c, pr) {
      if (pr && pr.door) {
        const W = window.__nbw && window.__nbw.NBW && window.__nbw.NBW.parts.get("wam:" + c.key);
        if (W && W.node) { try { await doorApply(W, c, pr); } catch (er) { try { window.__nbAdd && window.__nbAdd("plug", "preset " + pr.name + ": " + er.message); } catch (e) {} } }
        return;
      }
      const W = window.__nbw && window.__nbw.NBW && window.__nbw.NBW.parts.get("wam:" + c.key);
      const meta = ebMeta.get(c.key);
      if (W && W.node && meta) {
        const vals = {};
        // a whole preset sets every control (the ones it doesn't name go to their defaults, as the plugin's own menu does)
        if (pr.full) meta.params.forEach(p => { vals[p.id] = { id: p.id, value: pr.values[p.id] != null ? pr.values[p.id] : p.init, normalized: false }; });
        else for (const k in pr.values) vals[k] = { id: k, value: pr.values[k], normalized: false };
        try { await W.node.setParameterValues(vals); } catch (er) {}
      }
    }
    async function choosePlugPreset(c, pr, i) {
      const e = { id: "w:wam:" + c.key, name: c.name, sub: "plugin", cat: "plugins", sus: 1 };
      await chooseEntry(e, false);
      await plugApply(c, pr); plugName(c, pr.name);
      state.cur = { id: "pp:" + c.key + "#" + i, cat: "engines" }; save();
      try { setSoundText(pr.name, c.name); } catch (er) {}
    }
    // (212) a plugin preset added to what's playing: the plugin joins (if it isn't playing already), then the preset is set on it
    async function plugTogether(c, pr) {
      const e = { id: "w:wam:" + c.key, name: c.name, sub: "plugin", cat: "plugins", sus: 1 };
      const have = window.__nbw && window.__nbw.NBW && window.__nbw.NBW.parts.get("wam:" + c.key);
      if (!have) { const ok = await window.__nbTogether(e); if (!ok) return false; }
      await plugPresets(c.key); await plugApply(c, pr); plugName(c, pr.name); save(); return true;
    }
    // (214) the Playing row shows the plugin's preset name over the plugin's
    function plugName(c, nm) { const pt = (state.lib.parts || []).find(p => p && p.id === "wam:" + c.key); if (pt) pt.pname = nm; try { window.__stk.paint(); } catch (e) {} }

    // ---------- drawing ----------
    function ebRow(name, sub, onPick, opts) {
      opts = opts || {};
      const row = document.createElement("div"); row.className = "br-row" + (opts.on ? " on" : "");
      if (opts.play) { const pl = document.createElement("button"); pl.className = "br-play"; pl.textContent = "▶"; pl.setAttribute("aria-label", "Hear " + name); pl.addEventListener("click", () => opts.play(pl)); row.append(pl); }
      const main = document.createElement("button"); main.className = "br-main";
      const nm = document.createElement("span"); nm.className = "br-name"; nm.textContent = name;
      const sb = document.createElement("span"); sb.className = "br-sub"; sb.textContent = sub || "";
      main.append(nm, sb); main.addEventListener("click", async () => {
        ebL().querySelectorAll(".br-row.on").forEach(r => r.classList.remove("on")); row.classList.add("on");
        const was = sb.textContent; if (opts.loading) sb.textContent = "Loading…";
        try { await onPick(); } catch (er) {} sb.textContent = was;
      });
      row.append(main);
      if (opts.fav) {
        const id = opts.fav, st = document.createElement("button"); st.className = "br-star"; const isF = favs.includes(id);
        st.textContent = isF ? "★" : "☆"; st.classList.toggle("fav", isF); st.setAttribute("aria-label", (isF ? "Remove " : "Add ") + name + (isF ? " from" : " to") + " favorites");
        st.addEventListener("click", () => { favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id]; saveFavs(); renderBrowser(false); });
        row.append(st);
      }
      return row;
    }
    function ebHead(text, sub) { const h = document.createElement("div"); h.className = "bt-style eb-head"; h.textContent = text; if (sub) { const s = document.createElement("small"); s.textContent = " · " + sub; h.appendChild(s); } return h; }
    function ebTile(key, name, sub, count) {
      const b = document.createElement("button"); b.className = "eb-tile" + (engineOfCur() === key ? " on" : ""); b.dataset.eng = key;
      b.innerHTML = "<b></b><small></small><i></i>"; b.querySelector("b").textContent = name; b.querySelector("small").textContent = sub || "";
      b.querySelector("i").textContent = count == null ? "" : count ? count + (count === 1 ? " preset" : " presets") : "";
      b.addEventListener("click", () => { ebEng = key; renderBrowser(true); });
      return b;
    }
    function ebOverview() {
      const grid = id => { const g = document.createElement("div"); g.className = "eb-grid"; g.id = id; return g; };
      ebL().appendChild(ebHead("Synths", "tap one for its sounds"));
      const g1 = grid("ebSynths"); ebL().appendChild(g1);
      Object.entries(ENGINES).forEach(([id, e]) => g1.appendChild(ebTile("e:" + id, e.name, e.after, presetsOf(id).length)));
      ebL().appendChild(ebHead("Drums & samplers"));
      const g2 = grid("ebDrums"); ebL().appendChild(g2);
      [["e:drum", "808 Drums", "after TR-808"], ["e:samp", "Sampler", "your samples"], ["e:pads", "Pads", "12 sample pads"]].forEach(([k, n, s]) => {
        const b = ebTile(k, n, s, null); b.addEventListener("click", e => { e.stopImmediatePropagation(); ebEng = null; const en = (allEntries().find(x => x.id === k)); if (en) chooseEntry(en); }, true); g2.appendChild(b);
      });
      const kitsB = ebTile("kits", "Drum kits", "sampled kits onto the Pads", CATALOG.kits.length); g2.appendChild(kitsB);
      const groups = [["Your plugins", c => c.vendor === "Nathan"], ["Nate Bloom's plugins", c => c.vendor === "Nate Bloom"], ["Other plugins", c => !c.native && c.vendor !== "Nathan" && c.vendor !== "Nate Bloom"], ["Plugins on this computer", c => !!c.native]];
      for (const [label, f] of groups) {
        const L = plugInsts().filter(f); if (!L.length) continue;
        ebL().appendChild(ebHead(label));
        const g = grid(""); ebL().appendChild(g);
        L.forEach(c => { const m = ebMeta.get(c.key); g.appendChild(ebTile("w:" + c.key, c.name, c.type || "", m && m.list ? m.list.length : null)); });
      }
      // the plugins' preset counts arrive as their lists load
      plugInsts().filter(c => !ebMeta.has(c.key) && !c.native).forEach(c => plugPresets(c.key).then(m => {
        const t = ebL().querySelector('.eb-tile[data-eng="' + CSS.escape("w:" + c.key) + '"] i'); if (t && m && m.list) t.textContent = m.list.length ? m.list.length + " presets" : "";
      }));
    }
    function ebBack(title, sub) {
      const bar = document.createElement("div"); bar.className = "eb-bar";
      const b = document.createElement("button"); b.className = "btn"; b.textContent = "‹ All engines"; b.addEventListener("click", () => { ebEng = null; renderBrowser(true); });
      const t = document.createElement("div"); t.className = "eb-title"; t.innerHTML = "<b></b><small></small>"; t.querySelector("b").textContent = title; t.querySelector("small").textContent = sub || "";
      bar.append(b, t); ebL().appendChild(bar);
    }
    function ebEngineView() {
      if (ebEng === "kits") {
        ebBack("Drum kits", "each loads onto Pads P1–P12");
        allEntries().filter(e => e.id.startsWith("k:")).forEach(e => ebL().appendChild(ebRow(e.name, e.sub, () => chooseEntry(e), { loading: true, fav: e.id, on: state.cur && state.cur.id === e.id, play: btn => previewEntry(e, btn) })));
        return;
      }
      if (ebEng.startsWith("e:")) {
        const id = ebEng.slice(2), E = ENGINES[id]; if (!E) { ebEng = null; return ebOverview(); }
        ebBack(E.name, E.after);
        const plain = { id: "e:" + id, name: E.name, sub: "the engine as it is", cat: "engines" };
        ebL().appendChild(ebRow(E.name + " · as it is", "its own settings, no preset", () => chooseEntry(plain), { fav: plain.id, on: state.cur && state.cur.id === plain.id, play: btn => previewEntry(plain, btn) }));
        const L = presetsOf(id);
        if (!L.length) { const p = document.createElement("p"); p.className = "br-empty"; p.textContent = "No presets for " + E.name + " yet: shape it with its knobs, then ★ Save it as a favorite."; ebL().appendChild(p); return; }
        const ents = allEntries(), by = new Map(ents.map(e => [e.id, e]));
        let sel = null;
        for (const [p, i] of L) {
          const eid = "n:" + i, e = by.get(eid) || { id: eid, name: p[0], sub: "", cat: "nb" }, stack = engOfPreset(i);
          const with_ = stack.length > 1 ? "with " + stack.filter(x => x !== id).map(x => ENGINES[x] ? ENGINES[x].short : x).join(" + ") + " · " : "";
          const sub = with_ + (e.cat === "classic" ? (e.sub || "Classic Synths") : e.cat === "wave" ? "Natewave" : (p[3] && p[3].sub) || "Nate Bloom");
          const on = state.cur && state.cur.id === eid;
          const r = ebRow(p[0], sub, () => chooseEntry(e), { fav: eid, on, play: btn => previewEntry(e, btn) }); if (on) sel = r;
          ebL().appendChild(r);
        }
        if (sel) sel.scrollIntoView({ block: "center" });
        return;
      }
      // a plugin
      const key = ebEng.slice(2), c = cat().find(x => x.key === key); if (!c) { ebEng = null; return ebOverview(); }
      ebBack(c.name, (c.vendor === "Nathan" ? "yours" : c.vendor) + " · " + (c.type || "instrument"));
      const plainE = { id: "w:wam:" + key, name: c.name, sub: "plugin", cat: "plugins", sus: 1 };
      ebL().appendChild(ebRow(c.name + " · as it is", c.native ? "its own presets are in its window: Controls once it's playing" : "its default sound", () => chooseEntry(plainE), { loading: true, fav: plainE.id, on: state.cur && state.cur.id === plainE.id }));
      const holder = document.createElement("div"); ebL().appendChild(holder);
      const fill = m => {
        holder.innerHTML = "";
        if (m === null) { const p = document.createElement("p"); p.className = "br-empty"; p.textContent = "Loading its presets…"; holder.appendChild(p); return; }
        if (!m || !m.list.length) { const p = document.createElement("p"); p.className = "br-empty"; p.textContent = c.native ? "A plugin on this computer keeps its presets in its own window." : "It has no preset list; its sounds come from its own controls."; holder.appendChild(p); return; }
        m.list.forEach((pr, i) => { const on = state.cur && state.cur.id === "pp:" + key + "#" + i; holder.appendChild(ebRow(pr.name, pr.door ? (pr.cat || "factory patch") : pr.full ? "preset" : "its " + (EB_SUBS.find(s => pr.values[s] != null) || "sound") + " setting", () => choosePlugPreset(c, pr, i), { loading: true, on })); });
      };
      fill(ebMeta.has(key) ? ebMeta.get(key) : null);
      if (!ebMeta.has(key) || ebMeta.get(key) === null) plugPresets(key).then(m => { if (ebEng === "w:" + key) fill(m); });
    }

    // ---------- into the browser ----------
    const engChip = ebC().querySelector('.chip[data-cat="engines"]');
    if (engChip) { engChip.textContent = "By engine"; const fav = ebC().querySelector('.chip[data-cat="fav"]'); if (fav) fav.after(engChip); engChip.addEventListener("click", () => { ebEng = null; }, true); }
    { const i = LIB_CATS.findIndex(c => c[0] === "engines"); if (i >= 0) LIB_CATS[i][1] = "By engine"; }
    { const rb = renderBrowser; renderBrowser = function (scrollToSel) {
        if (brCat !== "engines" || brSearch.value.trim() || pickFor != null) return rb.apply(this, arguments);
        ebC().querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cat === "engines")));
        ebL().innerHTML = "";
        try { if (ebEng) ebEngineView(); else ebOverview(); } catch (e) { ebEng = null; }
        if (scrollToSel && !ebL().querySelector(".br-row.on")) ebL().scrollTop = 0;
      }; }
    // the sound name opens on the current engine's presets
    { const ob = openBrowser; openBrowser = function () {
        const r = ob.apply(this, arguments);
        if (pickFor == null) { const k = engineOfCur(); if (k) { brCat = "engines"; ebEng = k; renderBrowser(true); } }
        return r;
      }; }
    // the plugins' presets can be searched once their lists have loaded
    { const ae = allEntries; allEntries = function () {
        const l = ae.apply(this, arguments);
        ebMeta.forEach((m, key) => { if (!m || !m.list) return; const c = cat().find(x => x.key === key); if (!c) return; m.list.forEach((pr, i) => l.push({ id: "pp:" + key + "#" + i, name: pr.name, sub: c.name + " · preset", cat: "engines" })); });
        return l;
      }; }
    { const ce = chooseEntry; chooseEntry = async function (e) {
        if (e && e.id && e.id.startsWith("pp:")) { const [key, i] = e.id.slice(3).split("#"), c = cat().find(x => x.key === key), m = await plugPresets(key); if (c && m && m.list[+i]) return choosePlugPreset(c, m.list[+i], +i); return; }
        return ce.apply(this, arguments);
      }; }
    window.__eb = { cache: k => ebMeta.has(k) ? ebMeta.get(k) : undefined, choosePlugPreset, plugTogether, engOfPreset, open: k => { brCat = "engines"; ebEng = k || null; openBrowser(); if (k) { ebEng = k; renderBrowser(true); } }, presetsOf, plugPresets, engineOfCur };
  }
