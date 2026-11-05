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
      ep.appendChild(epHead(c.name, c.vendor === "Nathan" ? (NB_YOURS ? "your plugin" : "by Nathan") : (c.vendor || "plugin"), k));
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
    const esOpen = new Set(); let esBusy = 0, esKey = "", esLastEng = null, esShown = false;
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

    // (224) hidden: sounds you hide never show while you scroll (nor in Find); they wait in the Hidden tab, one tap back
    const HIDK = "nightbloom-es-hidden"; let HID = {};
    try { HID = JSON.parse(localStorage.getItem(HIDK) || "{}") || {}; } catch (e) {}
    const hidSave = () => { try { localStorage.setItem(HIDK, JSON.stringify(HID)); } catch (e) {} };
    const ESH = { on: false };
    // (231) Classic: the older copies of a sound that has a newer or better one (the same instrument from a second or
    // third General MIDI library, a preset that is the engine itself, the classic Hoover since the Alpha Juno). Out of
    // the lists and Find, never deleted: they wait in the Classic tab, playable there, and any can come back.
    const CLSK = "nightbloom-classic-keep"; let CLK = {};
    try { CLK = JSON.parse(localStorage.getItem(CLSK) || "{}") || {}; } catch (e) {}
    const clkSave = () => { try { localStorage.setItem(CLSK, JSON.stringify(CLK)); } catch (e) {} };
    const SRC_RANK = [[/^w:wam:natebloom\//, 0], [/^w:nb-|^sp:/, 1], [/^e:/, 2], [/_(Acoustic_Guitar|Stratocaster|Gibson_Les_Paul|Soul_Ahhs)_sf2/, 3], [/_GeneralUserGS_sf2/, 4], [/^n:/, 5],   // (a real recording of an acoustic instrument over a synth imitation with its name)
       [/_FluidR3_GM_sf2/, 6], [/_JCLive_sf2/, 7], [/_Chaos_sf2/, 8]];
    const rankOf = id => { for (const [re, r] of SRC_RANK) if (re.test(id)) return r; return -1; };   // (-1: not part of this, e.g. a plugin's own preset bank)
    const SUPERSEDED = { "e:hoover": "Alpha Juno" };   // (engines kept for old projects, with a newer one in their place)
    let CLS = {}, clsSig = "";
    function clsBuild() {
      let all = []; try { all = allEntries(); } catch (e) { return CLS; }
      const sig = all.length + "|" + catL().length + "|" + Object.keys(CLK).length; if (sig === clsSig) return CLS; clsSig = sig;
      const plug = catL().filter(c => c.kind === "instrument" && /^natebloom\//.test(c.url || "")).map(c => ({ id: "w:wam:" + c.key, name: c.name }));
      const by = new Map(), norm = s => String(s).toLowerCase().replace(/\(classic\)|[^a-z0-9]/g, "");
      const ids = new Set();
      for (const e of all.concat(plug)) { if (ids.has(e.id)) continue; ids.add(e.id); const r = rankOf(e.id); if (r < 0) continue; const k = norm(e.name); if (!k) continue; if (!by.has(k)) by.set(k, []); by.get(k).push({ e, r, i: +(/^n:(\d+)/.exec(e.id) || [0, 0])[1] }); }
      const out = {};
      by.forEach((L, k) => {
        if (L.length < 2) return;
        L.sort((a, b) => a.r - b.r || b.i - a.i);   // (the best kind first; of two presets, the newer)
        const engOf = id => { const m = /^n:(\d+)/.exec(id), p = m && NB_PRESETS[+m[1]]; return p ? [].concat(p[1]).join("+") : null; };
        L.slice(1).forEach(({ e }) => {
          // a preset only copies an engine when it is that engine's own sound (a Natewave preset called Sync Lead isn't the Sync Lead engine)
          if (e.id.startsWith("n:") && L[0].e.id.startsWith("e:") && engOf(e.id) !== L[0].e.id.slice(2)) return;
          if (!CLK[e.id]) out[e.id] = { name: e.name, sub: e.sub || "", why: "older copy of " + L[0].e.name + (L[0].e.sub ? " (" + String(L[0].e.sub).split(" · ")[0] + ")" : "") }; });
      });
      for (const id in SUPERSEDED) if (!CLK[id] && !(id === "e:hoover" && !ENGINES.alpha)) {   /* (the classic Hoover stays where there is no Alpha Juno: the website, the Windows app) */ const e = all.find(x => x.id === id); if (e) out[id] = { name: e.name, sub: e.sub || "", why: "the " + SUPERSEDED[id] + " took its place" }; }
      CLS = out; return CLS;
    }
    const OFF = k => !!(HID[k] || clsBuild()[k]);
    window.__nbIsClassic = id => !!clsBuild()[id];
    window.__nbIsOff = id => OFF(id);
    const ESC = { on: false };
    const asideCount = () => { const c = es.querySelector(".es-hb"); if (c) c.textContent = "Set aside · " + (Object.keys(HID).length + Object.keys(clsBuild()).length); };
    function esClassicView(T = es) {
      const C = clsBuild(), ks = Object.keys(C);
      const h = document.createElement("div"); h.className = "es-sec"; h.textContent = ks.length + " classic sounds · older copies, kept for old projects · tap to play"; T.appendChild(h);
      const groups = [["Engines and presets", k => /^[en]:/.test(k)], ["Second library copies", k => /^w:\d/.test(k)], ["Other", k => !/^[en]:|^w:\d/.test(k)]];
      let all = []; try { all = allEntries(); } catch (e) {}
      groups.forEach(([title, f]) => {
        const g = ks.filter(f).sort((a, b) => C[a].name.localeCompare(C[b].name)); if (!g.length) return;
        const d = document.createElement("details"); d.className = "es-cls"; const sm = document.createElement("summary"); sm.textContent = title + " · " + g.length; d.appendChild(sm);
        g.forEach(k => {
          const x = C[k], e = all.find(y => y.id === k), r = document.createElement("div"); r.className = "es-pr";
          r.appendChild(esRow("es-p", x.name, (x.sub ? x.sub + " · " : "") + x.why, state.cur && state.cur.id === k, () => { if (e) chooseEntry(e, !k.startsWith("w:wam:")); }));
          const b = document.createElement("button"); b.className = "es-add es-back"; b.textContent = "Bring back"; b.title = "Back in the lists and Find";
          b.addEventListener("click", () => { CLK[k] = 1; clkSave(); clsSig = ""; r.remove(); asideCount(); });
          r.appendChild(b); d.appendChild(r);
        });
        T.appendChild(d);
      });
      if (Object.keys(CLK).length) { const rs = document.createElement("button"); rs.className = "es-more"; rs.textContent = "Send the ones I brought back to Classic again"; rs.addEventListener("click", () => { CLK = {}; clkSave(); clsSig = ""; esPaint(true, true); }); T.appendChild(rs); }
    }
    function esHideBtn(hk, name, sub, rowEl) {
      const h = document.createElement("button"); h.className = "es-hide"; h.textContent = "Hide"; h.title = "Hide " + name + " (it goes to the Hidden tab, not deleted)"; h.setAttribute("aria-label", h.title);
      h.addEventListener("click", ev => { ev.stopPropagation(); HID[hk] = { name, sub: sub || "", t: Date.now() }; hidSave(); if (rowEl) rowEl.remove(); asideCount(); });
      return h;
    }
    function esRow(cls, name, sub, on, onClick, extra) {
      const b = document.createElement("button"); b.className = cls + (on ? " on" : "");
      const t = document.createElement("span"); t.className = "es-t";
      const n = document.createElement("b"); n.textContent = name; t.appendChild(n);
      if (sub) { const sm = document.createElement("small"); sm.textContent = sub; t.appendChild(sm); }
      b.appendChild(t); if (extra) b.appendChild(extra);
      b.addEventListener("click", onClick); return b;
    }
    // (212) a preset row: tap the name to play it alone, + to play it together with what's playing
    function esPRow(name, sub, on, onPick, onAdd, tags, hk) {
      const r = document.createElement("div"); r.className = "es-pr";
      const b = esRow("es-p", name, sub, on, onPick); r.appendChild(b);
      if (hk) r.appendChild(esHideBtn(hk, name, sub, r));
      if (ESF.tags) { const tg = tags || esTagsFor(name, sub); if (tg.length) { const t = document.createElement("span"); t.className = "es-tags"; t.textContent = tg.join(" · "); b.querySelector(".es-t").appendChild(t); } }
      if (onAdd) {
        const a = document.createElement("button"); a.className = "es-add"; a.textContent = "+";
        a.title = "Play " + name + " together with what's playing"; a.setAttribute("aria-label", a.title);
        a.addEventListener("click", async ev => {
          ev.stopPropagation(); a.disabled = true; a.textContent = "…"; let ok = false;
          esBusy++; try { ok = await onAdd(); } catch (e) {} finally { esBusy--; }
          a.textContent = ok === false ? "+" : "✓"; a.classList.toggle("ok", ok !== false); a.disabled = false;
          setTimeout(() => { a.textContent = "+"; a.classList.remove("ok"); }, 1600);
          esSync();
        });
        r.appendChild(a);
      }
      return r;
    }
    const togE = e => () => window.__nbTogether(e);
    function esSection(title) { const h = document.createElement("div"); h.className = "es-sec"; h.textContent = title; es.appendChild(h); }
    // a tap in the panel plays the sound and marks it where it is: the panel isn't redrawn, so nothing moves under the pointer
    function esPick(fn) { return async ev => {
      const b = ev.currentTarget, w = b.closest(".es-e");
      es.querySelectorAll(".es-p.on").forEach(x => x.classList.remove("on")); b.classList.add("on");
      es.querySelectorAll(".es-e.playing").forEach(x => x.classList.remove("playing")); if (w) w.classList.add("playing");
      esBusy++; try { await fn(); } catch (e) {} finally { esBusy--; }
      esSync();
    }; }
    function esSync() {
      let ce = null; try { ce = EB().engineOfCur(); } catch (e) {}
      esLastEng = ce;
      esKey = esMode + "|" + (state.cur && state.cur.id || "") + "|" + [...esOpen].join(",") + "|" + catL().length + (esMode === "fx" ? "|" + fxSig() + "|" + fxPick : "");
    }

    function esEngine(id, cur, curEng) {
      const E = ENGINES[id]; if (!E) return;
      const k = "e:" + id; if (OFF(k)) return;
      const L = EB().presetsOf(id).filter(([, i]) => !OFF("n:" + i)), open = esOpen.has(k), playing = curEng === k;
      const wrap = document.createElement("div"); wrap.className = "es-e" + (open ? " open" : "") + (playing ? " playing" : ""); wrap.dataset.k = k;
      const cnt = document.createElement("i"); cnt.className = "es-n"; cnt.textContent = L.length ? String(L.length) : "";
      { const hr = document.createElement("div"); hr.className = "es-hrow"; hr.appendChild(esRow("es-h", E.short || E.name, (E.short && E.short !== E.name ? E.name + " · " : "") + (E.after || ""), false, ev => esToggle(k, ev), cnt)); hr.appendChild(esHideBtn(k, E.name, "engine", wrap)); wrap.appendChild(hr); }
      if (open) {
        const box = document.createElement("div"); box.className = "es-ps";
        const plain = { id: k, name: E.name, sub: "the engine as it is", cat: "engines" };
        box.appendChild(esPRow("As it is", "no preset", cur === k, esPick(() => chooseEntry(plain, true)), togE(plain)));
        const by = new Map(allEntries().map(e => [e.id, e]));
        L.forEach(([p, i]) => {
          const eid = "n:" + i, e = by.get(eid) || { id: eid, name: p[0], sub: "", cat: "nb" }, st = EB().engOfPreset(i);
          const sub = st.length > 1 ? "+ " + st.filter(x => x !== id).map(x => ENGINES[x] ? ENGINES[x].short || ENGINES[x].name : x).join(" + ") : "";
          box.appendChild(esPRow(p[0], sub, cur === eid, esPick(() => chooseEntry(e, true)), togE(e), null, eid));
        });
        wrap.appendChild(box);
      }
      es.appendChild(wrap);
    }
    function esPlugin(c, cur, curEng) {
      const k = "w:" + c.key; if (OFF(k)) return;
      const open = esOpen.has(k), playing = curEng === k;
      const wrap = document.createElement("div"); wrap.className = "es-e" + (open ? " open" : "") + (playing ? " playing" : ""); wrap.dataset.k = k;
      { const hr = document.createElement("div"); hr.className = "es-hrow"; hr.appendChild(esRow("es-h", c.name, c.vendor === "Nathan" ? (NB_YOURS ? "your plugin" : "by Nathan") : (c.vendor || "plugin"), false, ev => esToggle(k, ev))); hr.appendChild(esHideBtn(k, c.name, "plugin", wrap)); wrap.appendChild(hr); }
      if (open) {
        const box = document.createElement("div"); box.className = "es-ps"; wrap.appendChild(box);
        const plainE = { id: "w:wam:" + c.key, name: c.name, sub: "plugin", cat: "plugins", sus: 1 };
        box.appendChild(esPRow("As it is", c.native ? "its presets are in its own window" : "its default sound", cur === plainE.id, esPick(() => chooseEntry(plainE, false)), togE(plainE)));
        const note = document.createElement("p"); note.className = "es-none"; note.textContent = "Loading its presets…"; box.appendChild(note);
        EB().plugPresets(c.key).then(m => {
          note.remove();
          if (!m || !m.list || !m.list.length) { if (!c.native) { note.textContent = "No preset list: its sounds come from its own controls."; box.appendChild(note); } return; }
          m.list.forEach((pr, i) => { if (OFF("pp:" + c.key + "#" + i)) return; box.appendChild(esPRow(pr.name, pr.cat || "", cur === "pp:" + c.key + "#" + i, esPick(() => EB().choosePlugPreset(c, pr, i)), () => EB().plugTogether(c, pr), null, "pp:" + c.key + "#" + i)); });
        });
      }
      es.appendChild(wrap);
    }
    // ---------- (212) by sound type: every preset of every engine and plugin, sorted into kinds of sound ----------
    const ES_MODE_KEY = "nightbloom-engside-mode";
    let esMode = (() => { try { const v = localStorage.getItem(ES_MODE_KEY); return v === "type" || v === "fx" ? v : "engine"; } catch (e) { return "engine"; } })();
    const ES_TYPES = [
      ["Drums", /\b(drum|snare|hi-?hat|kick|kit|timpani|percussion)\b/i],
      ["Bass", /bass(?!oon| clarinet)|\bsub\b|303|acid|reese|growl|wobble|neuro|boom|tuba/i],
      ["Choir & Voices", /choir|\baa?h\b|\booh\b|chant|vowel|voice|ghost|vocal|speech|robot|formant|soprano|vox/i],
      ["Strings", /string|violin|violine|pizzicato|ensemble|cello/i],
      ["Brass & Stabs", /brass|horn|trumpet|stab|orch hit|chord|\bcz\b/i],
      ["Bells & Mallets", /bell|kalimba|marimba|glass|glock|xylophone|celesta|music box|chime|mallet|crystal|tine(?!s? piano)/i],
      ["Keys & Organs", /piano|keys|\bclav|harpsi|organ|grand|rhodes|wurli|\btines\b/i],
      ["Winds", /flute|clarinet|oboe|reed|harmonica|english horn|pipe/i],
      ["Plucks & Arps", /pluck|\barp\b|arp\b|guitar|harp|popcorn|nylon/i],
      ["Leads", /lead|sync|screamer|hoover|laser|solo|8-bit|chiptune|square|saw\b|supersaw|anthem/i],
      ["Pads", /pad|fog|evolv|dream|cloud|starlight|moon|swell|sweep|poly|warm|haze|rain|wash|morph|wavetable|motion|space|dawn|silk/i],
      ["Drones & FX", /drone|hum|bloom|dust|shepard|noise|particle|swarm|rise|cave|terrain|funny|cosmic|spooky|fx/i],
    ];
    const esTypeOf = (name, sub) => { const t = name + " " + (sub || ""); for (const [k, re] of ES_TYPES) if (re.test(name)) return k; for (const [k, re] of ES_TYPES) if (re.test(t)) return k; return "Other"; };
    let esPlugLoad = null;
    function esLoadPlugs() {   // the plugins' preset lists, fetched once
      if (esPlugLoad) return esPlugLoad;
      const P = catL().filter(c => c.kind === "instrument" && (!c.native || /^surge xt$/i.test(c.name)));
      return (esPlugLoad = Promise.all(P.map(c => EB().plugPresets(c.key).catch(() => null))).then(() => { esPaint(true, true); }));
    }
    function esTypeItems(cur) {
      const by = new Map(allEntries().map(e => [e.id, e])), out = {}, seen = new Set();
      const add = (t, it) => (out[t] = out[t] || []).push(it);
      let ids = []; try { ids = window.__qkLive.items().filter(q => q.eng).map(q => q.eng); } catch (e) {}
      for (const id of ids) for (const [p, i] of EB().presetsOf(id)) {
        if (seen.has(i)) continue; seen.add(i);
        const eid = "n:" + i, e = by.get(eid) || { id: eid, name: p[0], sub: "", cat: "nb" }, st = EB().engOfPreset(i);
        const src = st.map(x => ENGINES[x] ? ENGINES[x].short || ENGINES[x].name : x).join(" + ");
        if (OFF(eid) || st.some(x => OFF("e:" + x))) continue;
        add(esTypeOf(p[0], p[3] && p[3].sub), { id: eid, name: p[0], sub: src, on: cur === eid, pick: () => chooseEntry(e, true), addf: togE(e) });
      }
      return out;
    }
    function esTypeView(cur) {
      const items = esTypeItems(cur);
      // the plugins' presets, from the lists already fetched
      const P = catL().filter(c => c.kind === "instrument" && (!c.native || /^surge xt$/i.test(c.name)));
      let pending = false;
      for (const c of P) {
        const m = esPlugCache(c.key); if (m === undefined) { pending = true; continue; }
        if (!m || !m.list) continue;
        if (OFF("w:" + c.key)) continue;
        m.list.forEach((pr, i) => { if (/^init$/i.test(pr.name) || OFF("pp:" + c.key + "#" + i)) return; const nm = pr.name.replace(/^(60|106) · [A-Z]\d\d /, ""); (items[esTypeOf(nm, c.type)] = items[esTypeOf(nm, c.type)] || []).push({ id: "pp:" + c.key + "#" + i, name: pr.name, sub: c.name, on: cur === "pp:" + c.key + "#" + i, pick: () => EB().choosePlugPreset(c, pr, i), addf: () => EB().plugTogether(c, pr) }); });
      }
      if (pending) esLoadPlugs();
      const order = ES_TYPES.map(t => t[0]).concat(["Other"]);
      for (const t of order) {
        const L = items[t]; if (!L || !L.length) continue;
        const k = "t:" + t, open = esOpen.has(k), playing = L.some(x => x.on);
        const wrap = document.createElement("div"); wrap.className = "es-e" + (open ? " open" : "") + (playing ? " playing" : ""); wrap.dataset.k = k;
        const cnt = document.createElement("i"); cnt.className = "es-n"; cnt.textContent = String(L.length);
        wrap.appendChild(esRow("es-h", t, "", false, ev => esToggle(k, ev), cnt));
        if (open) {
          const box = document.createElement("div"); box.className = "es-ps";
          const FOLD = 40, long = L.length > FOLD + 5 && !esOpen.has(k + "!");
          (long ? L.slice(0, FOLD) : L).forEach(x => box.appendChild(esPRow(x.name, x.sub, x.on, esPick(x.pick), x.addf, null, x.id)));
          if (long) { const m = document.createElement("button"); m.className = "es-more"; m.textContent = "Show all " + L.length; m.addEventListener("click", ev => { esOpen.add(k + "!"); esToggle(k, ev); esOpen.add(k); esPaint(true, true); }); box.appendChild(m); }
          wrap.appendChild(box);
        }
        es.appendChild(wrap);
      }
      if (pending) { const n = document.createElement("p"); n.className = "es-none"; n.textContent = "Loading the plugins' presets…"; es.appendChild(n); }
    }
    // ---------- (213) Effects, Linux only: put an effect on the sounds you pick, and take it off one sound without the others ----------
    const ES_LINUX = !!(window.NB_NATIVE && /^(linux|windows)$/.test(NB_NATIVE.platform));
    const FX_GROUPS = [["Reverb", /reverb/i], ["Delay & Echo", /delay|echo/i], ["Chorus & Modulation", /modulation|chorus|phaser|flanger/i], ["Saturation & Tape", /saturation|tape/i],
      ["Distortion & Amps", /distortion|fuzz|amp/i], ["Filters & EQ", /filter|equalizer|eq/i], ["Dynamics", /dynamics|compress/i], ["Granular & Glitch", /granular|glitch/i], ["Pitch", /pitch/i]];
    const fxGroupOf = c => { for (const [g, re] of FX_GROUPS) if (re.test(c.type || "")) return g; return "Utility & Other"; };
    const W_ = () => window.__wam;
    // the sounds playing now, each with the place its effects go (a synth's own channel, a plugin's, the Library's)
    function fxTargets() {
      const out = [], seen = new Set(), add = (t, name) => { if (!seen.has(t)) { seen.add(t); out.push({ t, name }); } };
      let its = []; try { its = window.__stk.items(); } catch (e) {}
      for (const it of its) {
        if (it.t === "syn") add("ch:" + it.id, ENGINES[it.id] ? ENGINES[it.id].short || it.name : it.name);
        else if (it.t === "lib") { if (String(it.id).startsWith("wam:")) add("plug:" + it.id, it.name); else add("ch:inst", "Library"); }
        else if (it.t === "inst") add("ch:inst", it.name);
        else if (it.t === "samp") add("ch:samp", "Sampler");
      }
      add("mix", "Whole mix");
      return out;
    }
    const fxChainOf = t => { try { return W_().chainOf(t) || []; } catch (e) { return []; } };
    const fxHas = (key, t) => fxChainOf(t).some(F => F.key === key);
    async function fxSet(key, t, on) {
      const W = W_(); if (!W) return;
      if (on) { if (!fxHas(key, t)) await W.addFx(key, true, null, true, t); }
      else { const F = fxChainOf(t).find(F => F.key === key); if (F) W.removeFx(F); }
    }
    const fxSig = () => fxTargets().map(x => x.t + ":" + fxChainOf(x.t).map(F => F.key).join("+")).join("|");
    let fxPick = null;   // the effect whose sound chips are open
    // one effect's chips: a toggle per playing sound (and the whole mix), plus All
    function fxChips(key, name) {
      const T = fxTargets(), box = document.createElement("div"); box.className = "fx-chips";
      const paintChip = (b, t) => { const on = fxHas(key, t); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); b.firstChild.textContent = on ? "✓ " : "+ "; };
      for (const x of T) {
        const b = document.createElement("button"); b.className = "fx-chip" + (x.t === "mix" ? " mix" : "");
        b.appendChild(document.createTextNode("")); b.appendChild(document.createTextNode(x.name));
        b.title = name + " on " + x.name + ": tap to " + (fxHas(key, x.t) ? "take it off" : "put it on"); paintChip(b, x.t);
        b.addEventListener("click", async () => { b.disabled = true; esBusy++; try { await fxSet(key, x.t, !fxHas(key, x.t)); } catch (e) {} finally { esBusy--; } b.disabled = false; esPaint(true, true); });
        box.appendChild(b);
      }
      const snd = T.filter(x => x.t !== "mix");
      if (snd.length > 1) {
        const all = snd.every(x => fxHas(key, x.t)), b = document.createElement("button"); b.className = "fx-chip all"; b.textContent = all ? "Off all" : "All sounds";
        b.addEventListener("click", async () => { esBusy++; try { for (const x of snd) await fxSet(key, x.t, !all); } catch (e) {} finally { esBusy--; } esPaint(true, true); });
        box.appendChild(b);
      }
      return box;
    }
    function esFxView() {
      const W = W_(), effects = catL().filter(c => c.kind === "effect");
      if (!W || !effects.length) { const n = document.createElement("p"); n.className = "es-none"; n.textContent = "Effects load when the sound starts."; es.appendChild(n); return; }
      const T = fxTargets();
      // in use: every effect on a playing sound or the mix, with its chips always showing
      const used = []; const seenK = new Set();
      for (const x of T) for (const F of fxChainOf(x.t)) if (!seenK.has(F.key)) { seenK.add(F.key); used.push(F); }
      const hu = document.createElement("div"); hu.className = "es-sec"; hu.textContent = used.length ? "On your sounds now" : "Tap an effect, then the sounds it goes on"; es.appendChild(hu);
      used.forEach(F => {
        const c = catL().find(x => x.key === F.key) || { name: F.name, type: "" };
        const r = document.createElement("div"); r.className = "fx-row used";
        const t = document.createElement("div"); t.className = "es-t"; const b = document.createElement("b"); b.textContent = c.name; t.appendChild(b); const sm = document.createElement("small"); sm.textContent = c.type || ""; t.appendChild(sm);
        r.appendChild(t); r.appendChild(fxChips(F.key, c.name)); es.appendChild(r);
      });
      const groups = {};
      effects.forEach(c => (groups[fxGroupOf(c)] = groups[fxGroupOf(c)] || []).push(c));
      FX_GROUPS.map(g => g[0]).concat(["Utility & Other"]).forEach(g => {
        const L = groups[g]; if (!L) return;
        const k = "f:" + g, open = esOpen.has(k);
        const wrap = document.createElement("div"); wrap.className = "es-e" + (open ? " open" : "") + (L.some(c => seenK.has(c.key)) ? " playing" : ""); wrap.dataset.k = k;
        const cnt = document.createElement("i"); cnt.className = "es-n"; cnt.textContent = String(L.length);
        wrap.appendChild(esRow("es-h", g, "", false, ev => esToggle(k, ev), cnt));
        if (open) {
          const box = document.createElement("div"); box.className = "es-ps";
          L.forEach(c => {
            const r = document.createElement("div"); r.className = "fx-row" + (fxPick === c.key ? " picked" : "");
            const b = esRow("es-p fx-name", c.name, (c.vendor === "Nate Bloom" ? "" : c.vendor + " · ") + (c.desc || "").replace(/\. .*/, ""), seenK.has(c.key), () => { fxPick = fxPick === c.key ? null : c.key; esPaint(true, true); });
            b.title = c.desc || c.name; r.appendChild(b);
            if (fxPick === c.key) r.appendChild(fxChips(c.key, c.name));
            box.appendChild(r);
          });
          wrap.appendChild(box);
        }
        es.appendChild(wrap);
      });
    }
    const esPlugCache = key => { try { return window.__eb.cache(key); } catch (e) { return undefined; } };
    function esToggle(k, ev) {
      const y0 = ev.currentTarget.getBoundingClientRect().top;
      esOpen.has(k) ? esOpen.delete(k) : esOpen.add(k);
      esPaint(true, true);
      const h = [...es.querySelectorAll(".es-e")].find(w => w.dataset.k === k);
      if (h) es.scrollTop += h.getBoundingClientRect().top - y0;
    }
    function esPaint(force, noScroll) {
      const eb = EB(); if (!eb || (esBusy && !noScroll)) return;
      let curEng = null; try { curEng = eb.engineOfCur(); } catch (e) {}
      if (curEng !== esLastEng) { if (curEng && esMode === "engine") esOpen.add(curEng); esLastEng = curEng; force = true; }
      const cur = state.cur && state.cur.id || "", key = esMode + "|" + cur + "|" + [...esOpen].join(",") + "|" + catL().length + (esMode === "fx" ? "|" + fxSig() + "|" + fxPick : "");
      if (!force && key === esKey) return; esKey = key;
      const st = es.scrollTop; es.innerHTML = "";
      const head = document.createElement("div"); head.className = "es-top";
      const sel = document.createElement("select"); sel.className = "es-mode"; sel.setAttribute("aria-label", "Show sounds by");
      [["engine", "By engine"], ["type", "By sound: bass, leads, pads…"]].concat(ES_LINUX ? [["fx", "Effects: reverb, delay, chorus…"]] : []).forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); });
      sel.value = esMode;
      sel.addEventListener("change", () => { esMode = sel.value; try { localStorage.setItem(ES_MODE_KEY, esMode); } catch (e) {} es.scrollTop = 0; esPaint(true, true); });
      head.appendChild(sel);
      const fb = document.createElement("button"); fb.className = "es-fb" + (ESF.on ? " on" : ""); fb.textContent = "Find"; fb.title = "Find a sound by its name or what it is (dark, 80s, bass, FM…)"; fb.setAttribute("aria-pressed", String(ESF.on));
      fb.addEventListener("click", () => { ESF.on = !ESF.on; if (!ESF.on) ESF.q = ""; esPaint(true, true); if (ESF.on) setTimeout(() => { const i = es.querySelector(".es-q"); if (i) i.focus(); }, 0); });
      head.appendChild(fb);
      // (232) one place for what's set aside: Hidden, Classic and the key splits, each a drop-down
      { const nh = Object.keys(HID).length, nc = Object.keys(clsBuild()).length, ab = document.createElement("button"); ab.className = "es-fb es-hb es-cb" + (ESH.on ? " on" : ""); ab.textContent = "Set aside · " + (nh + nc);
        ab.title = "What's out of the lists: what you hid, the classic copies, the key splits"; ab.setAttribute("aria-pressed", String(ESH.on));
        ab.addEventListener("click", () => { ESH.on = !ESH.on; if (ESH.on) ESF.on = false; es.scrollTop = 0; esPaint(true, true); }); head.appendChild(ab); }
      const hs = document.createElement("small"); hs.textContent = "tap to play · + to add"; head.appendChild(hs);
      es.appendChild(head);
      if (ESH.on) { esAsideView(); return; }
      if (ESF.on && esMode !== "fx") {
        const row = document.createElement("div"); row.className = "es-find";
        const q = document.createElement("input"); q.className = "es-q"; q.type = "search"; q.placeholder = "Name or attribute: \"Juno Strings\", dark pad, 80s bass…"; q.value = ESF.q; q.setAttribute("aria-label", "Find a sound");
        const tg = document.createElement("button"); tg.className = "es-tg" + (ESF.tags ? " on" : ""); tg.textContent = "Attributes"; tg.title = "Show each sound's attributes (what Find matches on)"; tg.setAttribute("aria-pressed", String(ESF.tags));
        tg.addEventListener("click", () => { ESF.tags = !ESF.tags; try { localStorage.setItem("nightbloom-es-tags", ESF.tags ? "1" : ""); } catch (e) {} esPaint(true, true); });
        row.append(q, tg); es.appendChild(row);
        { const sv = esSaved(); if (sv.length) { const ch = document.createElement("div"); ch.className = "es-saved"; sv.forEach(t => { const b = document.createElement("button"); b.className = "es-chip"; b.textContent = t; b.title = "Find " + t; b.addEventListener("click", () => { ESF.q = t; q.value = t; esFindPaint(res); }); const x = document.createElement("i"); x.textContent = "×"; x.title = "Forget this search"; x.addEventListener("click", ev => { ev.stopPropagation(); esSavedSet(esSaved().filter(y => y !== t)); esPaint(true, true); }); b.appendChild(x); ch.appendChild(b); }); es.appendChild(ch); } }
        const res = document.createElement("div"); res.className = "es-res"; es.appendChild(res);
        q.addEventListener("input", () => { ESF.q = q.value; esFindPaint(res); });
        q.addEventListener("keydown", e => { if (e.key === "Escape") { ESF.on = false; ESF.q = ""; esPaint(true, true); } e.stopPropagation(); });
        q.addEventListener("keyup", e => e.stopPropagation());
        if (ESF.q.trim()) { esFindPaint(res); if (ESF.focus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } es.scrollTop = st; return; }
      }
      if (esMode === "fx" && ES_LINUX) { hs.textContent = "tap an effect · pick the sounds it goes on"; esFxView(); es.scrollTop = st; return; }
      if (esMode === "type") {
        esTypeView(cur);
        const more = document.createElement("button"); more.className = "es-more"; more.textContent = "Drum kits and everything else…";
        more.addEventListener("click", () => { try { eb.open(null); } catch (e) {} }); es.appendChild(more);
        es.scrollTop = st; return;
      }
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
      if (force && curEng && !noScroll) { const pw = es.querySelector(".es-e.playing .es-p.on") || es.querySelector(".es-e.playing"); if (pw) { const r = pw.getBoundingClientRect(), er = es.getBoundingClientRect(); if (r.top < er.top || r.bottom > er.bottom) pw.scrollIntoView({ block: "center" }); } }
    }
    function esAsideView() {
      const sec = (title, open, fill) => { const d = document.createElement("details"); d.className = "es-cls"; d.open = open; const sm = document.createElement("summary"); sm.textContent = title; d.appendChild(sm); const box = document.createElement("div"); d.appendChild(box); fill(box); es.appendChild(d); };
      const nh = Object.keys(HID).length, nc = Object.keys(clsBuild()).length;
      let Z = {}, V = {}; try { Z = JSON.parse(localStorage.getItem("nightbloom-zones") || "{}") || {}; V = JSON.parse(localStorage.getItem("nightbloom-velsplit") || "{}") || {}; } catch (e) {}
      const nz = Object.keys(Z).length + Object.keys(V).length;
      sec("Hidden · " + nh, nh > 0 && nh < 12, box => esHiddenView(box));
      sec("Classic · " + nc, false, box => esClassicView(box));
      sec("Key splits · " + nz, nz > 0, box => {
        const p = document.createElement("p"); p.className = "es-none"; p.textContent = nz ? "Sounds on part of the keys or soft/hard only. Split keys (on the Playing row) changes them." : "No splits: every sound plays on every key."; box.appendChild(p);
        if (nz) { const b = document.createElement("button"); b.className = "es-more"; b.textContent = "✕ Clear every split"; b.addEventListener("click", () => { try { window.__kz.clear(); } catch (e) {} esPaint(true, true); }); box.appendChild(b);
          const o = document.createElement("button"); o.className = "es-more"; o.textContent = "Open Split keys"; o.addEventListener("click", () => { try { window.__kz.open(); } catch (e) {} }); box.appendChild(o); }
      });
    }
    function esHiddenView(T = es) {
      const ks = Object.keys(HID).sort((a, b) => (HID[b].t || 0) - (HID[a].t || 0));
      const h = document.createElement("div"); h.className = "es-sec"; h.textContent = ks.length ? ks.length + " hidden · they never show while you scroll or in Find" : "Nothing hidden. Hide is on each sound, engine and plugin."; T.appendChild(h);
      if (ks.length > 1) { const all = document.createElement("button"); all.className = "es-more"; all.textContent = "Bring them all back"; all.addEventListener("click", () => { HID = {}; hidSave(); ESH.on = false; esPaint(true, true); }); T.appendChild(all); }
      ks.forEach(k => {
        const x = HID[k], r = document.createElement("div"); r.className = "es-pr";
        r.appendChild(esRow("es-p", x.name, (x.sub || "") + (k.startsWith("e:") ? " · the engine and its sounds" : k.startsWith("w:") ? " · the plugin and its presets" : ""), false, () => {}));
        const b = document.createElement("button"); b.className = "es-add es-back"; b.textContent = "Bring back"; b.title = "Back where it was"; b.addEventListener("click", () => { delete HID[k]; hidSave(); r.remove(); asideCount(); });
        r.appendChild(b); T.appendChild(r);
      });
    }
    // ---------- (220) Find: every sound by its exact name or its attributes. Each sound gets attributes from what it
    // is (its kind, the engine or plugin, the library's category) and from its name and description (dark, bright, warm,
    // 80s, analog, FM…); they stay hidden unless Attributes is on. "Quotes" find an exact name. ----------
    const ESF = { on: false, q: "", tags: (() => { try { return !!localStorage.getItem("nightbloom-es-tags"); } catch (e) { return false; } })(), focus: false };
    const ES_ATTR = [
      ["dark", /dark|deep|night|shadow|ghost|spooky|black|cave|moody|haunt|horror|abyss|low/i], ["bright", /bright|glass|crystal|shimmer|sparkl|shine|sun|clear|air/i],
      ["warm", /warm|soft|mellow|velvet|silk|smooth|round|lush|tape/i], ["aggressive", /growl|scream|distort|fuzz|hard|acid|reese|dirty|grit|rave|hoover|nasty|rage/i],
      ["ambient", /pad|drone|cloud|space|wash|dream|fog|haze|ether|atmos|evolv|swell|cosmic|star/i], ["80s", /juno|dx-?7|cs-?80|jupiter|prophet|oberheim|ob-?x|\b80s?\b|8\d\b|retro|synthwave|vangelis|stab/i],
      ["analog", /analog|moog|juno|sh-?101|minimoog|ladder|mono|poly ?d|polysynth|virtual analog|303/i], ["FM", /\bfm\b|dx-?7|operator|6-op|bell|e\.? ?piano|tine/i],
      ["vintage", /vintage|old|classic|lo-?fi|tape|vinyl|worn|retro|mellotron|organ/i], ["percussive", /pluck|stab|hit|perc|mallet|marimba|kalimba|staccato|pizz|drum/i],
      ["sustained", /pad|string|choir|drone|organ|sustain|swell|bow/i], ["lead", /lead|solo|sync|saw|square|whistle/i], ["bass", /bass(?!oon| clarinet)|sub\b|808|303|low end/i],
      ["acoustic", /piano|guitar|violin|cello|flute|clarinet|sax|trumpet|horn|harp|acoustic|nylon|upright|grand|marimba/i], ["vocal", /choir|voice|vox|vowel|aah|ooh|speech|sing|formant/i],
      ["electric", /electric|rhodes|wurli|e\.? ?piano|clav|organ|guitar/i], ["cinematic", /cinematic|epic|orchestra|film|hall|timpani|brass|ensemble/i], ["sample-based", /generaluser|studio|salamander|sampled|soundfont|sf2/i],
    ];
    const esTagMemo = new Map();
    function esTagsFor(name, sub, extra) {
      const k = name + "|" + (sub || "") + "|" + (extra || ""); let t = esTagMemo.get(k); if (t) return t;
      const txt = name + " " + (sub || "") + " " + (extra || ""), out = [];
      const ty = esTypeOf(name, sub); if (ty !== "Other") out.push(ty.toLowerCase());
      for (const [a, re] of ES_ATTR) if (re.test(txt) && !out.includes(a)) out.push(a);
      if (sub && sub.length <= 28) out.push(sub.replace(/^Stack · /, "").toLowerCase());
      if (!out.length) out.push("synth");
      esTagMemo.set(k, out); return out;
    }
    const esSaved = () => { try { return JSON.parse(localStorage.getItem("nightbloom-es-saved") || "[]") || []; } catch (e) { return []; } };
    const esSavedSet = L => { try { localStorage.setItem("nightbloom-es-saved", JSON.stringify(L)); } catch (e) {} };
    function esFindItems() {
      const L = [], seen = new Set(), cur = state.cur && state.cur.id || "";
      const add = (id, name, sub, extra, pick, addf, kind) => { if (seen.has(id) || OFF(id)) return; seen.add(id); L.push({ id, name, sub, tags: esTagsFor(name, sub, extra), pick, addf, on: cur === id, kind }); };
      const CATN = { nb: "Nate Bloom preset", engines: "engine", kits: "drum kit", mine: "your instrument", keys: "keys", strings: "strings", winds: "winds & brass", bells: "bells & mallets", gtrbass: "guitar & bass", leads: "synth lead", pads: "pad", world: "world", perc: "percussion", drums: "drums", classic: "classic synth" };
      for (const e of allEntries()) {
        const sub = e.cat === "nb" ? e.sub : e.id.startsWith("w:nb-") ? "Studio" : e.sub;
        add(e.id, e.name, sub, (CATN[e.cat] || e.cat || "") + (e.id.startsWith("e:") && ENGINES[e.id.slice(2)] ? " " + (ENGINES[e.id.slice(2)].after || "") : ""), () => chooseEntry(e, !e.id.startsWith("w:wam:")), togE(e), CATN[e.cat] || "sound");
      }
      // (224) the effects too: tapping one opens it in Effects to pick the sounds it goes on; + puts it on the mix
      for (const c of catL().filter(c => c.kind === "effect")) {
        add("fx:" + c.key, c.name, "effect" + (c.type ? " · " + c.type.toLowerCase() : ""), (c.type || "") + " " + (c.desc || "") + " effect",
          async () => { if (ES_LINUX) { esMode = "fx"; fxPick = c.key; ESF.on = false; ESF.q = ""; esOpen.add("f:" + fxGroupOf(c)); esPaint(true, true); } else { try { await W_().addFx(c.key, "mix"); } catch (e) {} } },
          async () => { try { await W_().addFx(c.key, "mix"); return true; } catch (e) { return false; } }, "effect");
      }
      for (const c of catL().filter(c => c.kind === "instrument")) {
        const plainE = { id: "w:wam:" + c.key, name: c.name, sub: "plugin", cat: "plugins", sus: 1 };
        add(plainE.id, c.name, c.vendor === "Nathan" ? (NB_YOURS ? "your plugin" : "by Nathan") : "plugin", (c.type || "") + " " + (c.desc || ""), () => chooseEntry(plainE, false), togE(plainE), "plugin");
        const m = esPlugCache(c.key);
        if (m && m.list) m.list.forEach((pr, i) => { if (/^init$/i.test(pr.name)) return; add("pp:" + c.key + "#" + i, pr.name, c.name + (pr.cat ? " · " + pr.cat : ""), (pr.cat ? pr.cat + " " : "") + (c.type || ""), () => EB().choosePlugPreset(c, pr, i), () => EB().plugTogether(c, pr), "plugin preset"); });
      }
      return L;
    }
    function esFindPaint(res) {
      res.innerHTML = ""; const raw = ESF.q.trim(); if (!raw) return;
      const exact = /^".*"$/.test(raw), q = raw.replace(/^"|"$/g, "").toLowerCase(), words = q.split(/\s+/).filter(Boolean);
      const scored = [];
      for (const it of esFindItems()) {
        const n = it.name.toLowerCase(), hay = n + " " + (it.sub || "").toLowerCase() + " " + it.tags.join(" ");
        let sc = 0;
        if (exact) { if (n === q) sc = 100; else continue; }
        else if (n === q) sc = 100; else if (n.startsWith(q)) sc = 80; else if (n.includes(q)) sc = 60;
        else if (words.every(w => hay.includes(w))) sc = 30 + words.filter(w => n.includes(w)).length * 5 + words.filter(w => it.tags.includes(w)).length * 3;
        else continue;
        scored.push([sc, it]);
      }
      scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
      if (scored.length && !esSaved().includes(raw)) { const sb = document.createElement("button"); sb.className = "es-more es-savebtn"; sb.textContent = "☆ Keep “" + raw + "” as a one-tap search"; sb.addEventListener("click", () => { esSavedSet(esSaved().concat(raw).slice(-12)); esPaint(true, true); }); res.appendChild(sb); }
      const h = document.createElement("div"); h.className = "es-sec"; h.textContent = scored.length ? scored.length + (scored.length === 1 ? " found" : " found") + (scored.length > 150 ? " · the first 150" : "") : "Nothing matches “" + raw + "”"; res.appendChild(h);
      scored.slice(0, 150).forEach(([, it]) => { const r = esPRow(it.name, (it.sub || "") + (it.kind && it.sub !== it.kind ? " · " + it.kind : ""), it.on, esPick(async () => { ESF.focus = false; await it.pick(); }), it.addf, it.tags, it.id); res.appendChild(r); });
      if (!scored.length) { const p = document.createElement("p"); p.className = "es-none"; p.textContent = "Try part of a name, or what it is: bass, pad, bright, dark, 80s, FM, choir, plugin…"; res.appendChild(p); }
    }
    es.addEventListener("focusin", e => { if (e.target.classList && e.target.classList.contains("es-q")) ESF.focus = true; });
    es.addEventListener("focusout", e => { if (e.target.classList && e.target.classList.contains("es-q")) setTimeout(() => { if (!es.contains(document.activeElement) || !document.activeElement.classList.contains("es-q")) ESF.focus = false; }, 0); });
    // the plugins' presets are searched too: fetched once Find opens
    setInterval(() => { if (ESF.on && esShown) esLoadPlugs(); }, 2000);
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
    // (232) for the play-every-sound check (t/allsounds.py): pick any sound, play a note, read the output level
    window.__nbTest = { get ctx() { return ctx; }, entries: () => allEntries(), choose: async id => { const e = allEntries().find(x => x.id === id); if (!e) return false; await chooseEntry(e, false); return true; },
      on: m => noteOn(m), off: m => noteOff(m), buf: null,
      level() { if (!analyser) return -1; if (!this.buf || this.buf.length !== analyser.fftSize) this.buf = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(this.buf); let p = 0, s = 0; for (const x of this.buf) { const a = Math.abs(x); if (a > p) p = a; s += x * x; if (!Number.isFinite(x)) return NaN; } return [p, Math.sqrt(s / this.buf.length)]; } };
    window.__nbAll = () => ({ entries: allEntries(), nb: NB_PRESETS.map(p => [p[0], p[1]]), classic: (typeof CLASSIC_PRESETS !== 'undefined' ? CLASSIC_PRESETS : []).map(p => [p[0], p[1]]), engines: Object.keys(ENGINES).map(k => [k, ENGINES[k].name, ENGINES[k].after || '']) });   // (a look at every sound, for checks)
  }

  // (214, Linux) the second (third, fourth) sound on an engine plays as another set of that engine's voices, each with its
  // own preset's settings: every note (and the arp) plays the engine again with the copy's settings swapped in for that note.
  // It rides on the engine's own part of what the keys play, so it follows that engine's controller, zones and arp.
  if (window.NB_NATIVE && /^(linux|windows)$/.test(NB_NATIVE.platform)) {
    const vc0 = voiceComponents;
    voiceComponents = function () {
      const r = vc0.apply(this, arguments);
      if (!Array.isArray(r) || !r.length) return r;
      const out = r.slice();
      for (const c of r) {
        const id = c.key, L = ENGINES[id] && state.layers[id]; if (!L || !L.copies || !L.copies.length) continue;
        L.copies.forEach((cp, ci) => {
          if (cp.mute) return;
          out.push({ key: id, name: cp.pname || ENGINES[id].name, accepts: c.accepts, copy: ci,
            make: (m, when, scale = 1) => {
              const keep = state.params[id]; state.params[id] = Object.assign({}, keep, cp.params);
              try { return makeVoice(m, id, (cp.level ?? 0.8) * 1.25 * scale / Math.sqrt(r.length + 1), when); } finally { state.params[id] = keep; }
            } });
        });
      }
      return out;
    };
  }
