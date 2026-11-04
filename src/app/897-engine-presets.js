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

    function esRow(cls, name, sub, on, onClick, extra) {
      const b = document.createElement("button"); b.className = cls + (on ? " on" : "");
      const t = document.createElement("span"); t.className = "es-t";
      const n = document.createElement("b"); n.textContent = name; t.appendChild(n);
      if (sub) { const sm = document.createElement("small"); sm.textContent = sub; t.appendChild(sm); }
      b.appendChild(t); if (extra) b.appendChild(extra);
      b.addEventListener("click", onClick); return b;
    }
    // (212) a preset row: tap the name to play it alone, + to play it together with what's playing
    function esPRow(name, sub, on, onPick, onAdd) {
      const r = document.createElement("div"); r.className = "es-pr";
      const b = esRow("es-p", name, sub, on, onPick); r.appendChild(b);
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
      const k = "e:" + id, L = EB().presetsOf(id), open = esOpen.has(k), playing = curEng === k;
      const wrap = document.createElement("div"); wrap.className = "es-e" + (open ? " open" : "") + (playing ? " playing" : ""); wrap.dataset.k = k;
      const cnt = document.createElement("i"); cnt.className = "es-n"; cnt.textContent = L.length ? String(L.length) : "";
      wrap.appendChild(esRow("es-h", E.short || E.name, (E.short && E.short !== E.name ? E.name + " · " : "") + (E.after || ""), false, ev => esToggle(k, ev), cnt));
      if (open) {
        const box = document.createElement("div"); box.className = "es-ps";
        const plain = { id: k, name: E.name, sub: "the engine as it is", cat: "engines" };
        box.appendChild(esPRow("As it is", "no preset", cur === k, esPick(() => chooseEntry(plain, true)), togE(plain)));
        const by = new Map(allEntries().map(e => [e.id, e]));
        L.forEach(([p, i]) => {
          const eid = "n:" + i, e = by.get(eid) || { id: eid, name: p[0], sub: "", cat: "nb" }, st = EB().engOfPreset(i);
          const sub = st.length > 1 ? "+ " + st.filter(x => x !== id).map(x => ENGINES[x] ? ENGINES[x].short || ENGINES[x].name : x).join(" + ") : "";
          box.appendChild(esPRow(p[0], sub, cur === eid, esPick(() => chooseEntry(e, true)), togE(e)));
        });
        wrap.appendChild(box);
      }
      es.appendChild(wrap);
    }
    function esPlugin(c, cur, curEng) {
      const k = "w:" + c.key, open = esOpen.has(k), playing = curEng === k, m = EB().plugPresets ? null : null;
      const wrap = document.createElement("div"); wrap.className = "es-e" + (open ? " open" : "") + (playing ? " playing" : ""); wrap.dataset.k = k;
      wrap.appendChild(esRow("es-h", c.name, c.vendor === "Nathan" ? "your plugin" : (c.vendor || "plugin"), false, ev => esToggle(k, ev)));
      if (open) {
        const box = document.createElement("div"); box.className = "es-ps"; wrap.appendChild(box);
        const plainE = { id: "w:wam:" + c.key, name: c.name, sub: "plugin", cat: "plugins", sus: 1 };
        box.appendChild(esPRow("As it is", c.native ? "its presets are in its own window" : "its default sound", cur === plainE.id, esPick(() => chooseEntry(plainE, false)), togE(plainE)));
        const note = document.createElement("p"); note.className = "es-none"; note.textContent = "Loading its presets…"; box.appendChild(note);
        EB().plugPresets(c.key).then(m => {
          note.remove();
          if (!m || !m.list || !m.list.length) { if (!c.native) { note.textContent = "No preset list: its sounds come from its own controls."; box.appendChild(note); } return; }
          m.list.forEach((pr, i) => box.appendChild(esPRow(pr.name, "", cur === "pp:" + c.key + "#" + i, esPick(() => EB().choosePlugPreset(c, pr, i)), () => EB().plugTogether(c, pr))));
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
      const P = catL().filter(c => c.kind === "instrument" && !c.native);
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
        add(esTypeOf(p[0], p[3] && p[3].sub), { name: p[0], sub: src, on: cur === eid, pick: () => chooseEntry(e, true), addf: togE(e) });
      }
      return out;
    }
    function esTypeView(cur) {
      const items = esTypeItems(cur);
      // the plugins' presets, from the lists already fetched
      const P = catL().filter(c => c.kind === "instrument" && !c.native);
      let pending = false;
      for (const c of P) {
        const m = esPlugCache(c.key); if (m === undefined) { pending = true; continue; }
        if (!m || !m.list) continue;
        m.list.forEach((pr, i) => { if (/^init$/i.test(pr.name)) return; const nm = pr.name.replace(/^(60|106) · [A-Z]\d\d /, ""); (items[esTypeOf(nm, c.type)] = items[esTypeOf(nm, c.type)] || []).push({ name: pr.name, sub: c.name, on: cur === "pp:" + c.key + "#" + i, pick: () => EB().choosePlugPreset(c, pr, i), addf: () => EB().plugTogether(c, pr) }); });
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
          (long ? L.slice(0, FOLD) : L).forEach(x => box.appendChild(esPRow(x.name, x.sub, x.on, esPick(x.pick), x.addf)));
          if (long) { const m = document.createElement("button"); m.className = "es-more"; m.textContent = "Show all " + L.length; m.addEventListener("click", ev => { esOpen.add(k + "!"); esToggle(k, ev); esOpen.add(k); esPaint(true, true); }); box.appendChild(m); }
          wrap.appendChild(box);
        }
        es.appendChild(wrap);
      }
      if (pending) { const n = document.createElement("p"); n.className = "es-none"; n.textContent = "Loading the plugins' presets…"; es.appendChild(n); }
    }
    // ---------- (213) Effects, Linux only: put an effect on the sounds you pick, and take it off one sound without the others ----------
    const ES_LINUX = !!(window.NB_NATIVE && NB_NATIVE.platform === "linux");
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
      const hs = document.createElement("small"); hs.textContent = "tap to play · + to add"; head.appendChild(hs);
      es.appendChild(head);
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

  // (214, Linux) the second (third, fourth) sound on an engine plays as another set of that engine's voices, each with its
  // own preset's settings: every note (and the arp) plays the engine again with the copy's settings swapped in for that note.
  // It rides on the engine's own part of what the keys play, so it follows that engine's controller, zones and arp.
  if (window.NB_NATIVE && NB_NATIVE.platform === "linux") {
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
