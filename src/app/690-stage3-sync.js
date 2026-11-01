    // ======================================================================
    // 158, stage 3 of the rebuild (the tablet's side): the state document over the link, intents the Pixelbook sends,
    // and what the console needs from the tablet. While the Pixelbook is linked, every change to a section of the
    // state document goes out as a patch ("doc": the section, its version, the document's version); the Pixelbook
    // renders those and never guesses. It asks for changes with intents ("intent": path, value, index, base), which
    // the tablet applies through NBState or refuses with the current value, and answers with an "ack"; a patch follows.
    // New intents for the console: mixer.pos (the slider's position), mixer.mute, mixer.solo, setlist.prev, setlist.save
    // (the current state into the current song), setlist.add, stack.replace / stack.add / stack.drop (the Library),
    // and the Pixelbook can pull the whole library. A song now carries the mixer's levels, so a scene recalls them.
    // Permissions (Set up → Pixelbook): always · only between songs (nothing playing) · ask first (a bar on the tablet
    // with Accept) · never.
    // ======================================================================
    const SY = { sub: null, q: {}, qT: 0, asks: [], askT: 0, bar: null };
    // ---- a song remembers the mixer ----
    { const ss = songSnap; songSnap = function () { const S = ss.apply(this, arguments); try { S.mix = mixChannels().map(c => [c.name, Math.round(c.get() * 10000) / 10000]); } catch (e) {} return S; }; }
    { const sa = songApply; songApply = function (S) {
        const r = sa.apply(this, arguments);
        if (S && Array.isArray(S.mix)) { try { const ch = mixChannels(); S.mix.forEach(([n, v]) => { const c = ch.find(x => x.name === n); if (c && typeof v === "number") c.set(v); }); save(); if (!$id("mixer").hidden) renderMixer(); } catch (e) {} }
        nbsRefresh(true); return r; }; }
    // ---- mute and solo (the mixer has levels only: these remember and restore) ----
    const MX = { muted: {}, solo: null, kept: {} };
    const mxRows = () => { try { return mixChannels(); } catch (e) { return []; } };
    function mxMute(c, on) {
      if (on) { if (!(c.name in MX.muted)) { MX.muted[c.name] = c.get(); c.set(0); } }
      else if (c.name in MX.muted) { const v = MX.muted[c.name]; delete MX.muted[c.name]; c.set(v > 0 ? v : c.dflt); }
    }
    function mxSolo(c, on) {
      const rows = mxRows().filter(x => x.group === "Playing now" || x.group === c.group);
      if (on) {
        if (MX.solo && MX.solo !== c.name) mxSolo(rows.find(x => x.name === MX.solo) || { name: MX.solo, group: c.group, get: () => 0, set() {} }, false);
        MX.solo = c.name; rows.forEach(x => { if (x.name !== c.name && !(x.name in MX.muted) && !(x.name in MX.kept)) { MX.kept[x.name] = x.get(); x.set(0); } });
      } else if (MX.solo === c.name) { MX.solo = null; rows.forEach(x => { if (x.name in MX.kept) { const v = MX.kept[x.name]; delete MX.kept[x.name]; x.set(v > 0 ? v : x.dflt); } }); }
    }
    // the tablet's build travels in the state message and the document, so the Pixelbook can tell an old page apart
    { const ls = lkState; lkState = function () { const S = ls.apply(this, arguments); try { S.b = window.NB_BUILD || 0; } catch (e) {} return S; }; }
    { const rd = nbsRead; nbsRead = function () {
        const d = rd.apply(this, arguments);
        try { if (d.rig) d.rig.build = window.NB_BUILD || 0; } catch (e) {}
        try { d.mixer = mxRows().map(c => ({ group: c.group, name: c.name, sub: c.sub || "", level: Math.round(c.get() * 1000) / 1000, pos: mxPos(c.get(), c.law), text: mxDb(c.get(), c.dflt, c.law), dflt: c.dflt, muted: c.name in MX.muted, solo: MX.solo === c.name })); } catch (e) {}
        return d; }; }
    // ---- permissions: what the Pixelbook may change right now ----
    function permNow(kind) {   // true, or why not
      const v = nbsPerms()[kind] || "always";
      if (v === "always") return true;
      if (v === "never") return "the tablet never takes this from the Pixelbook (Set up → Pixelbook)";
      if (v === "ask") return "ask";
      const on = nbsTry(() => ({ seq: !!playing, rc: !!RC.playing, bp: !!BP.playing }), {});
      return Object.values(on).some(Boolean) ? "only between songs: stop first (Set up → Pixelbook)" : true;
    }
    function syAsk(text, run) {   // a bar on the tablet: Accept or No, 20 s
      if (!SY.bar) {
        const bar = document.createElement("div"); bar.className = "sndfix pb-ask"; bar.id = "pbAsk"; bar.hidden = true; bar.setAttribute("role", "alert");
        bar.innerHTML = '<span id="pbAskT"></span><button type="button" class="btn primary" id="pbAskYes">Accept</button><button type="button" class="btn" id="pbAskNo">No</button>';
        document.body.appendChild(bar); SY.bar = bar;
        $id("pbAskYes").addEventListener("click", () => { const a = SY.asks.shift(); if (a) { try { a.run(); } catch (e) {} add139("link", "accepted: " + a.text); } syAskNext(); });
        $id("pbAskNo").addEventListener("click", () => { const a = SY.asks.shift(); if (a) add139("link", "refused: " + a.text); syAskNext(); });
      }
      SY.asks.push({ text, run }); if (SY.asks.length === 1) syAskNext();
    }
    function syAskNext() {
      clearTimeout(SY.askT); const a = SY.asks[0];
      if (!a) { SY.bar.hidden = true; return; }
      nbT($id("pbAskT"), "The Pixelbook asks: " + a.text); SY.bar.hidden = false;
      SY.askT = setTimeout(() => { SY.asks.shift(); add139("link", "ignored: " + a.text); syAskNext(); }, 20000);
    }
    // ---- the new intents ----
    const findEntry = id => nbsTry(() => allEntries().find(e => e.id === id), null);
    { const ni = nbsIntent; nbsIntent = function (it) {
        if (!it || typeof it !== "object" || typeof it.path !== "string") return ni.apply(this, arguments);
        const no = (msg, sec) => { const r = { ok: false, msg, ver: NBS.ver }; if (sec) r.value = nbsGet()[sec]; return r; };
        const ok = (msg, sec) => { nbsRefresh(true); NBS.log.push([Math.round(performance.now() / 1000), it.path, msg]); if (NBS.log.length > 40) NBS.log.shift(); add139("state", it.path + " · " + msg); return { ok: true, msg, ver: NBS.ver, value: sec ? nbsGet()[sec] : undefined }; };
        const sec = it.path.split(".")[0];
        if (it.base != null && NBS.secs[sec] && it.base < NBS.secs[sec].ver) return no("changed on the tablet since: look again", sec);
        const gate = kind => { const p = permNow(kind); return p === true ? null : p; };
        switch (it.path) {
          case "mixer.pos": { const g = gate("levels"); if (g) return no(g === "ask" ? "levels are set to ask first: use the tablet" : g, "mixer"); const c = mxRows()[it.index | 0]; if (!c) return no("no channel " + (it.index | 0), "mixer"); const v = Math.max(0, Math.min(100, +it.value || 0)); c.set(mxLevel(v, c.law)); if (c.name in MX.muted) delete MX.muted[c.name]; try { save(); } catch (e) {} try { if (!$id("mixer").hidden) renderMixer(); } catch (e) {} return ok(c.name + " " + mxDb(c.get(), c.dflt, c.law), "mixer"); }
          case "mixer.mute": { const g = gate("levels"); if (g) return no(g === "ask" ? "levels are set to ask first: use the tablet" : g, "mixer"); const c = mxRows()[it.index | 0]; if (!c) return no("no channel", "mixer"); mxMute(c, !!it.value); try { save(); } catch (e) {} try { if (!$id("mixer").hidden) renderMixer(); } catch (e) {} return ok(c.name + (it.value ? " muted" : " back"), "mixer"); }
          case "mixer.solo": { const g = gate("levels"); if (g) return no(g === "ask" ? "levels are set to ask first: use the tablet" : g, "mixer"); const c = mxRows()[it.index | 0]; if (!c) return no("no channel", "mixer"); mxSolo(c, !!it.value); try { save(); } catch (e) {} try { if (!$id("mixer").hidden) renderMixer(); } catch (e) {} return ok(it.value ? "only " + c.name : "all back", "mixer"); }
          case "setlist.prev": { const g = gate("scenes"); if (g) return no(g === "ask" ? "scenes are set to ask first: use the tablet" : g, "setlist"); if (!SL.songs.length) return no("no set list", "setlist"); songStep(-1); return ok("previous song", "setlist"); }
          case "setlist.save": {
            const g = gate("scenes"); if (g && g !== "ask") return no(g, "setlist");
            if (!(SL.cur >= 0 && SL.songs[SL.cur])) return no("no song is playing now: add one first", "setlist");
            const S = SL.songs[SL.cur], run = () => { const n = songSnap(S.name); n.notes = S.notes; n.label = S.label; SL.songs[SL.cur] = n; slSave(); paintSong(); nbsRefresh(true); try { lkSend("data", lkData("setlist")); } catch (e) {} };
            if (g === "ask") { syAsk("save the tablet's sound and levels into " + S.name, run); return no("asked on the tablet: Accept there", "setlist"); }
            run(); return ok("saved into " + S.name, "setlist");
          }
          case "setlist.add": {
            const g = gate("scenes"); if (g && g !== "ask") return no(g, "setlist");
            const name = String(it.value || "").trim().slice(0, 40) || "Song " + (SL.songs.length + 1);
            const run = () => { SL.songs.push(songSnap(name)); SL.cur = SL.songs.length - 1; slSave(); paintSong(); nbsRefresh(true); try { lkSend("data", lkData("setlist")); } catch (e) {} };
            if (g === "ask") { syAsk("add the song " + name + " from what plays now", run); return no("asked on the tablet: Accept there", "setlist"); }
            run(); return ok("added " + name, "setlist");
          }
          case "stack.replace": case "stack.add": {
            const g = gate("sound"); if (g && g !== "ask") return no(g, "stack");
            const e = findEntry(String(it.value || "")); if (!e) return no("no such sound", "stack");
            const add = it.path === "stack.add";
            const run = () => { start(); if (add) { try { __stk.together(e); } catch (x) {} } else { try { chooseEntry(e); } catch (x) {} } setTimeout(() => { try { if (!lv.hidden) { lvPaintTop(); lvPaintKnobs(); } } catch (x) {} nbsRefresh(true); }, 150); };
            if (g === "ask") { syAsk((add ? "layer " : "play ") + e.name, run); return no("asked on the tablet: Accept there", "stack"); }
            run(); return ok((add ? "layered " : "playing ") + e.name, "stack");
          }
          case "library.fav": {   // the tablet's own favourites (★ in Sounds), from the Pixelbook too
            const e = findEntry(String(it.value || "")); if (!e) return no("no such sound");
            const on = it.on == null ? !favs.includes(e.id) : !!it.on; favs = on ? favs.filter(x => x !== e.id).concat([e.id]) : favs.filter(x => x !== e.id); saveFavs();
            try { if (!brEl.hidden) renderBrowser(false); } catch (x) {}
            try { lkSend("data", { kind: "favs", favs: favs.slice() }); } catch (x) {}
            return ok((on ? "★ " : "☆ ") + e.name);
          }
          case "stack.drop": {
            const g = gate("sound"); if (g && g !== "ask") return no(g, "stack");
            const its = nbsTry(() => __stk.items(), []), it2 = its.find(x => x.name === it.value) || its[it.index | 0]; if (!it2) return no("no such layer", "stack");
            const run = () => { try { __stk.drop(it2); } catch (x) {} setTimeout(() => nbsRefresh(true), 150); };
            if (g === "ask") { syAsk("stop " + it2.name, run); return no("asked on the tablet: Accept there", "stack"); }
            run(); return ok("stopped " + it2.name, "stack");
          }
        }
        if (it.path === "mixer.level" || it.path === "setlist.go" || it.path === "setlist.next") {   // 154's intents know only always / not: the fuller gate decides, then they run as "always"
          const k = it.path.startsWith("mixer") ? "levels" : "scenes", g = gate(k); if (g) return no(g === "ask" ? "set to ask first: use the tablet" : g, sec);
          const P = nbsPerms(), keep = P[k]; P[k] = "always"; try { return ni.apply(this, arguments); } finally { P[k] = keep; }
        }
        return ni.apply(this, arguments); }; }
    // ---- the document over the link ----
    function syLibrary() { try { return { kind: "library", cats: LIB_CATS.map(([id, label]) => ({ id, label })), favs: favs.slice(), list: allEntries().filter(e => !/^e:(samp|pads|drum)$/.test(e.id)).map(e => ({ id: e.id, name: e.name, sub: e.sub || "", cat: e.cat })) }; } catch (e) { return { kind: "library", cats: [], favs: [], list: [], error: String(e && e.message || e) }; } }
    function syFlush() {
      SY.qT = 0; if (!nbsTry(lkUp, false)) { SY.q = {}; return; }
      const keys = Object.keys(SY.q); if (!keys.length) return;
      const d = nbsGet(), patch = {}; keys.forEach(k => { patch[k] = d[k]; }); SY.q = {};
      lkSend("doc", { ver: d.ver, secs: d.secs, patch });
    }
    function syWhole() { if (!nbsTry(lkUp, false)) return; const d = nbsGet(); const patch = {}; Object.keys(d.secs).forEach(k => { patch[k] = d[k]; }); lkSend("doc", { ver: d.ver, secs: d.secs, patch, whole: true }); }
    function syWatch(on) {
      if (on && !SY.sub) { SY.sub = nbsSubscribe((d, ch) => { ch.forEach(k => { SY.q[k] = 1; }); if (!SY.qT) SY.qT = setTimeout(syFlush, 120); }); syWhole(); }
      else if (!on && SY.sub) { SY.sub(); SY.sub = null; SY.q = {}; }
    }
    setInterval(() => { const up = nbsTry(lkUp, false); if (up !== !!SY.sub) syWatch(up); }, 500);
    // Set up → Pixelbook's selects follow a permission changed elsewhere (Find, the Pixelbook, the old interface)
    nbsSubscribe((d, ch) => { if (!ch.includes("perms") || !d.perms) return; document.querySelectorAll("#setup select[data-perm]").forEach(s => { const v = d.perms[s.dataset.perm]; if (v && s.value !== v) s.value = v; }); });
    { const li = lkIn; lkIn = function (t, d) {
        if (t === "intent") { const r = nbsIntent(d || {}); lkSend("ack", Object.assign({ id: d && d.id, intent: d && d.path }, r)); return; }
        if (t === "pull" && d && d.kind === "library") { lkSend("data", syLibrary()); return; }
        if (t === "pull" && d && d.kind === "doc") { syWhole(); return; }
        if (t === "hi") { setTimeout(syWhole, 200); }
        return li.apply(this, arguments); }; }
    window.NBState.intent = nbsIntent; window.__live19.nbsIntent = nbsIntent; window.__live19.nbsRead = nbsRead;   // (the wrapped ones)
    window.__live22 = { SY, MX, mxMute, mxSolo, permNow, syAsk, syLibrary, syWhole };
