    // ======================================================================
    // 154, stage 0 of the rebuild: the state document and the new-shell switch. One JSON document describes the whole
    // instrument (rig, transport, stack, mixer, FX, pads, set list, jam, health), each section with a version that
    // bumps when it changes. Anything (the Pixelbook, a report, the new shell) reads it; changes go through intents
    // that the tablet applies or refuses with the current value (the tablet wins every conflict). Stage 0 reads it
    // from today's objects and applies a handful of intents; the switch (Help → New shell, or ?shell=new; the button
    // went in 161, the URL parameter in 166) showed an empty skeleton of the three spaces and the strip, off by
    // default. Reports carry the document.
    // ======================================================================
    const NBS = { ver: 0, secs: {}, doc: null, at: 0, subs: new Set(), timer: 0, perms: null, log: [] };
    const nbsTry = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
    function nbsPerms() {
      if (!NBS.perms) { NBS.perms = { levels: "always", scenes: "always", sound: "between-songs" }; try { Object.assign(NBS.perms, JSON.parse(localStorage.getItem("nb-perms") || "{}")); } catch (e) {} }
      return NBS.perms;
    }
    const NBD = { at: 0, d: null };
    function nbsDiag() { const now = performance.now(); if (now - NBD.at > 2000) { NBD.d = nbsTry(tabletDiag, null); NBD.at = now; } return NBD.d; }   // (the app's diag walks USB, audio and MIDI: at most every 2 s)
    const NBDROP = { on: false };   // 156: the sound dropping out on its way to the output (the hub's own jack could not keep up on Fast)
    function nbsDropNote(S, out) {
      const n = S.drops == null ? 0 : S.drops;
      if (n >= 10) NBDROP.on = true; else if (n < 3) NBDROP.on = false;
      if (!NBDROP.on) return [];
      const where = out && out !== "system default" ? " on its way to " + out : "";
      // (159) two reasons, and the tablet says which it sees: a lot playing at once (voices, layers, stuck notes), or
      // an output that can't keep up. The first was blamed on the output before.
      const vs = nbsTry(() => voices.size, 0), lay = nbsTry(() => __stk.items().length, 1), stuck = nbsTry(() => __live23.stuckN(), 0);
      if (stuck) return ["The sound is dropping out" + where + ", and " + stuck + (stuck === 1 ? " note is" : " notes are") + " stuck on. Stop all (■) releases them."];
      // (237) the computer itself is busy with other programs: say which, since nothing in Nate Bloom fixes that
      { const C = window.__nbCpu && __nbCpu.last; if (C && !C.warming && C.computer >= 60) { const ours = (C.app || 0) / Math.max(1, C.cores), oth = (C.others || []).slice(0, 2);
        if (C.computer - ours >= 45) return ["The sound is dropping out" + where + ": other programs are using " + Math.round(C.computer - ours) + "% of the computer (Nate Bloom about " + Math.max(1, Math.round(ours)) + "%)" + (oth.length ? ", most of it " + oth.map(o => o.name + " (" + o.pct + "% of a core)").join(" and ") : "") + ". " + (oth.some(o => o.pids && !o.waits) && window.NB_NATIVE && NB_NATIVE.makeWait ? "No sound? › Make them wait lets " + (oth.length === 1 ? "it" : "them") + " keep going without taking the sound's turn." : "Close or pause " + (oth.length === 1 ? "it" : "them") + (bufWant() === "fast" && !window.NB_LITE ? ", or tap No sound? › Steady for more slack." : "."))]; } }
      if (window.NB_BIG && bufWant() === "fast") return ["The sound is dropping out" + where + ". This computer has room for it: switch the sound buffer to Steady (Settings › Sound check) and reload; it gives the sound twice the slack for about 10 ms more delay."];   // (174)
      // (175) released notes still ringing count too (an arp's tails were most of it, and the message said "2 voices")
      const ring = nbsTry(() => { let k = 0; const now = ctx.currentTime; NB_REL.forEach(L => L.forEach(v => { if (v.at <= now) k++; })); return k; }, 0), all = vs + ring;
      if (all >= 6 || lay >= 3) return ["The sound is dropping out" + where + ": " + all + (all === 1 ? " note" : " notes") + " sounding across " + lay + (lay === 1 ? " layer" : " layers") + (ring ? " (" + ring + " of them released and still ringing)" : "") + ". One audio thread works out all of it, however many cores the computer has; Nate Bloom is letting the quietest tails go first. Fewer layers, a shorter Release, or Shimmer and Density off help; Stop all (■) clears anything stuck."];
      return ["The sound is dropping out" + where + " with little playing. " + (bufWant() === "fast" && !window.NB_LITE ? "Switch the sound buffer to Steady (Settings → Sound check), or try another headphone output: the hub's own jack may not keep up." : "Try another headphone output: this one may not keep up even on Steady.")];
    }
    function nbsRead() {   // today's objects, read into the document's shape
      const S = nbsTry(lkState, null) || {}, d = nbsDiag(), gear = S.gear || {}, song = S.song || {};
      const outName = nbsTry(() => (ctx && ctx.sinkId) ? String(ctx.sinkId) : (d && d.media && d.media.length ? d.media.join(", ") : "system default"), "system default");
      return {
        rig: { minilab: !!gear.ml, ko2: !!gear.ko, pixelbook: !!nbsTry(lkUp, false), computerKeys: nbsTry(() => !!__live4.capsOn(), false), sync: gear.sync || "off", midiIns: nbsTry(mdIns, []),
          out: outName, devices: nbsTry(() => ADEV.list.slice(0, 12), []), volume: d && d.volume ? { music: d.volume.music, max: d.volume.max } : null,
          buffer: S.buf || "fast", latencyMs: S.lat == null ? null : S.lat, android: !!window.NB_NATIVE, app: nbsTry(() => String(NBNativeBridge.version()), ""), purist: d && d.purist ? d.purist : "" },
        transport: { tempo: S.bpm == null ? nbsTry(rcBpm, null) : S.bpm, playing: S.on || {}, target: S.play || "", live: !!S.live, key: { root: scl.key, scale: scl.scale }, octave: state.octave, rec: S.rec == null ? null : S.rec },
        stack: { layers: (S.layers || []).map(l => ({ name: l.n, arp: !!l.a })), sound: S.sound || {} },
        mixer: nbsTry(() => mixChannels().map(c => ({ group: c.group, name: c.name, sub: c.sub || "", level: Math.round(c.get() * 1000) / 1000, dflt: c.dflt })), []),
        fx: { on: state.fx.on !== false },
        knobs: S.kp || {}, pads: S.pads || {}, keys: { hold: !!S.hold, held: S.held || [], arp: S.arp || {} },
        setlist: { cur: song.cur == null ? -1 : song.cur, n: song.n || 0, name: song.name || "", next: song.next || "", pending: !!song.pend, songs: nbsTry(() => SL.songs.map(x => ({ name: x.name, bpm: x.bpm, vis: x.vis || "" })), []), vis: nbsTry(() => (SL.cur >= 0 && SL.songs[SL.cur] && SL.songs[SL.cur].vis) || "", "") },
        jam: S.jam || {},
        health: { dropouts: S.drops == null ? null : S.drops, buffer: S.buf || "fast", latencyMs: S.lat == null ? null : S.lat, notes: nbsTry(() => tabletNotes(d).map(x => x[1]), []).concat(nbsDropNote(S, outName)) },
        perms: Object.assign({}, nbsPerms()), ctl: S.ctl !== false,
      };
    }
    function nbsRefresh(force) {   // re-read; bump the versions of the sections that changed; tell the subscribers
      const now = performance.now(); if (!force && NBS.doc && now - NBS.at < 100) return NBS.doc;
      const fresh = nbsRead(), changed = [];
      Object.keys(fresh).forEach(k => { const s = JSON.stringify(fresh[k]), sec = NBS.secs[k]; if (!sec) { NBS.secs[k] = { ver: ++NBS.ver, json: s }; changed.push(k); } else if (sec.json !== s) { sec.json = s; sec.ver = ++NBS.ver; changed.push(k); } });
      NBS.doc = fresh; NBS.at = now;
      if (changed.length && NBS.subs.size) NBS.subs.forEach(f => { try { f(nbsGet(), changed); } catch (e) {} });
      return fresh;
    }
    function nbsGet() { const d = nbsRefresh(false); const o = { schema: 1, ver: NBS.ver, secs: {} }; Object.keys(NBS.secs).forEach(k => { o.secs[k] = NBS.secs[k].ver; }); return Object.assign(o, d); }
    function nbsSubscribe(f) {
      NBS.subs.add(f); if (!NBS.timer) NBS.timer = setInterval(() => { if (!document.hidden) nbsRefresh(true); }, 500);   // (232: twice a second is plenty for the strip and the Pixelbook)
      try { f(nbsGet(), Object.keys(NBS.secs)); } catch (e) {}
      return () => { NBS.subs.delete(f); if (!NBS.subs.size && NBS.timer) { clearInterval(NBS.timer); NBS.timer = 0; } };
    }
    function nbsIntent(it) {   // {path, value, index?, base?}: applied, or refused with the current value
      const no = (msg, sec) => { const r = { ok: false, msg, ver: NBS.ver }; if (sec) r.value = nbsGet()[sec]; return r; };
      const ok = (msg, sec) => { nbsRefresh(true); NBS.log.push([Math.round(performance.now() / 1000), it.path, msg]); if (NBS.log.length > 40) NBS.log.shift(); add139("state", it.path + " · " + msg); return { ok: true, msg, ver: NBS.ver, value: sec ? nbsGet()[sec] : undefined }; };
      if (!it || typeof it !== "object" || typeof it.path !== "string") return no("not an intent");
      const sec = it.path.split(".")[0], P = nbsPerms();
      if (it.base != null && NBS.secs[sec] && it.base < NBS.secs[sec].ver) return no("changed on the tablet since: look again", sec);
      switch (it.path) {
        case "fx.on": setFxOn(!!it.value); return ok("effects " + (it.value ? "on" : "off"), "fx");
        case "transport.tempo": { const b = Math.round(+it.value); if (!(b >= 50 && b <= 180)) return no("tempo is 50 to 180", "transport"); setBpm(b); return ok(b + " bpm", "transport"); }
        case "mixer.level": {
          if (P.levels !== "always") return no("levels from the Pixelbook are off (Settings → Pixelbook)", "mixer");
          const i = it.index | 0, c = nbsTry(() => mixChannels()[i], null); if (!c) return no("no channel " + i, "mixer");
          const v = Math.max(0, Math.min(2, +it.value || 0)); c.set(v); try { save(); } catch (e) {} try { if (!$id("mixer").hidden) renderMixer(); } catch (e) {}
          return ok(c.name + " to " + Math.round(v * 100) + "%", "mixer");
        }
        case "setlist.go": {
          if (P.scenes !== "always") return no("scenes from the Pixelbook are off (Settings → Pixelbook)", "setlist");
          const i = it.index | 0; if (!(i >= 0 && i < SL.songs.length)) return no("no song " + (i + 1), "setlist");
          songGo(i); return ok("song " + (i + 1) + (nbsTry(nextBarIn, null) == null ? "" : " on the next bar"), "setlist");
        }
        case "setlist.next": { if (P.scenes !== "always") return no("scenes from the Pixelbook are off (Settings → Pixelbook)", "setlist"); const i = SL.cur + 1; if (i >= SL.songs.length) return no("that was the last song", "setlist"); songGo(i); return ok("song " + (i + 1), "setlist"); }
        case "perms": { const v = it.value || {}; ["levels", "scenes", "sound"].forEach(k => { if (typeof v[k] === "string") P[k] = v[k]; }); try { localStorage.setItem("nb-perms", JSON.stringify(P)); } catch (e) {} return ok("permissions saved", "perms"); }
      }
      return no("unknown intent " + it.path);
    }
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ stateDoc: nbsGet(), stateLog: NBS.log }));
    window.NBState = { schema: 1, get: nbsGet, refresh: () => nbsRefresh(true), subscribe: nbsSubscribe, intent: nbsIntent, perms: nbsPerms, get ver() { return NBS.ver; } };
    // ---- the new-shell switch ----
    const SH = { on: false, el: null, space: "play", unsub: null };
    // (161) the shell is the interface. (166) the ?shell=old URL hatch of 161 is gone; nb-shell=old in storage is the
    // test suite's hook only (the older tests in the harness set it to drive the parked chrome): no control on the
    // page writes it any more (shellSet(false) has no caller), and it stays so the parked chrome can be tested.
    const shWant = () => { try { return localStorage.getItem("nb-shell") !== "old"; } catch (e) { return true; } };
    const SH_TEXT = {
      play: ["Play", "The performance surface comes here in stage 2: the stack of sounds, eight macros on the MiniLab's knobs, eight pads, Hold · Arp · Scale · Octave · FX · Jam under the right thumb, and the transport with the set list along the bottom. Nothing on it will move under your hands."],
      build: ["Build", "One workspace in stage 5: Sounds, Beats, Rhythm, Samples, Songs, Tracks and DJ as tabs, with one transport, one browser and one mixer."],
      setup: ["Settings", "Stage 1 brings the rig here: Sound check, MIDI, Gear, Pixelbook, Projects, App and Help, plus Find over everything."],
    };
    function shBuild() {
      if (SH.el) return SH.el;
      const el = document.createElement("div"); el.id = "shell"; el.hidden = true;
      el.innerHTML = `<div class="sh-strip"><div class="sh-spaces"><button type="button" class="sh-sp" data-sp="play">Play</button><button type="button" class="sh-sp" data-sp="build">Build</button><button type="button" class="sh-sp sh-set" data-sp="setup" title="Settings: sound, MIDI, gear, the app, help" aria-label="Settings"><span class="sh-gear" aria-hidden="true">⚙</span><span class="sh-setw">Settings</span></button></div>
        <div class="sh-mid" id="shMid"></div>
        <div class="sh-right"><span class="sh-dot" data-k="minilab">MiniLab</span><span class="sh-dot" data-k="ko2">K.O. II</span><span class="sh-dot" data-k="pixelbook">Pixelbook</span><span class="sh-out" id="shOut"></span><button type="button" class="btn" id="shLog">Log</button><button type="button" class="btn" id="shFind" disabled title="Find comes in stage 1">Find</button></div></div>
        <div class="sh-body"><div class="sh-stage">Stage 0 · the new shell is a skeleton behind a switch. The current interface is untouched underneath it.</div><h2 id="shTitle"></h2><p id="shText"></p>
        <div class="sh-row"><button type="button" class="btn primary" id="shBack">Back to the current interface</button></div></div>`;
      document.body.appendChild(el); SH.el = el;
      el.querySelectorAll(".sh-sp").forEach(b => b.addEventListener("click", () => { SH.space = b.dataset.sp; shPaint(); }));
      $id("shBack").addEventListener("click", () => shellSet(false));
      $id("shLog").addEventListener("click", () => { try { __live14.logTap("shell"); } catch (e) {} });
      return el;
    }
    function shPaint(doc) {
      if (!SH.el || SH.el.hidden) return; const d = doc || nbsGet(), t = d.transport || {}, r = d.rig || {};
      SH.el.querySelectorAll(".sh-sp").forEach(b => b.classList.toggle("on", b.dataset.sp === SH.space));
      const key = t.key && t.key.scale && t.key.scale !== "off" ? " · " + (nbsTry(() => nnm(t.key.root * 1 + 60).replace(/\d+$/, ""), "") + " " + t.key.scale) : "";
      const on = Object.keys(t.playing || {}).filter(k => t.playing[k]);
      nbT($id("shMid"), (t.tempo == null ? "" : Math.round(t.tempo) + " bpm") + key + (on.length ? " · playing: " + on.join(", ") : " · stopped"));
      SH.el.querySelectorAll(".sh-dot").forEach(s => s.classList.toggle("on", !!r[s.dataset.k]));
      nbT($id("shOut"), "out: " + (r.out || "?") + (d.health && d.health.dropouts ? " · " + d.health.dropouts + " drops" : ""));
      const tx = SH_TEXT[SH.space] || SH_TEXT.play; nbT($id("shTitle"), tx[0]); nbT($id("shText"), tx[1]);
    }
    function shellSet(on) {
      SH.on = !!on; try { localStorage.setItem("nb-shell", on ? "new" : "old"); } catch (e) {}
      const el = shBuild(); el.hidden = !on; document.body.classList.toggle("shell-new", !!on);
      if (on) { if (!SH.unsub) SH.unsub = nbsSubscribe(d => shPaint(d)); shPaint(); } else if (SH.unsub) { SH.unsub(); SH.unsub = null; }
      const b = $id("shellBtn"); if (b) nbT(b, "New shell: " + (on ? "On" : "Off"));
      add139("shell", on ? "new shell on" : "new shell off");
    }
    { const b = $id("shellBtn"); if (b) b.addEventListener("click", () => shellSet(!SH.on)); }
    if (shWant()) { const go = () => setTimeout(() => shellSet(true), 50); if ($id("start").hidden) go(); else $id("startBtn").addEventListener("click", go); }   // (after "Tap to start sound")
    window.__live19 = { NBS, SH, nbsRead, nbsIntent, shellSet, shPaint };
