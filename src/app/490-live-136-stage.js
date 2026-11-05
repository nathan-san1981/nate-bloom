    // ======================================================================
    // Live, for the stage (136): a lock (hold Done to leave; Back and Esc can't close it), the screen kept awake,
    // the output level with the safety limiter's light, Gear (the MiniLab and the K.O. II: who keeps time,
    // sampling it), a set list that changes songs on the next bar, and Capture: what you just played, as a
    // Garage track.
    // ======================================================================
    const KO_RE = /k\.?\s?o\.?\s?ii|ep-?133/i;
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const top = lv.querySelector(".lv-top");
    const mkBtn = (id, cls, html, title) => { const b = document.createElement("button"); b.className = "btn " + cls; b.id = id; b.innerHTML = html; if (title) { b.title = title; b.setAttribute("aria-label", title); } return b; };
    // ---------- the lock ----------
    LV.lock = !!lsGet("nightbloom-live-lock", false);
    const I_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
    const I_OPEN = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>';
    const lockB = mkBtn("lvLock", "lv-lock", I_OPEN, "Lock Live");
    $id("lvDone").after(lockB);
    function paintLock() {
      lockB.innerHTML = LV.lock ? I_LOCK : I_OPEN; lockB.setAttribute("aria-pressed", String(!!LV.lock));
      const t = LV.lock ? "Locked: hold Done to leave Live (tap to unlock)" : "Lock Live: Back, Esc and a stray tap on Done can't close it";
      lockB.title = t; lockB.setAttribute("aria-label", t);
      lv.classList.toggle("locked", !!LV.lock); $id("lvDone").title = LV.lock ? "Hold to leave Live" : "Leave Live";
    }
    lockB.addEventListener("click", () => { LV.lock = !LV.lock; lsSet("nightbloom-live-lock", LV.lock); paintLock(); mlHud(LV.lock ? "Live locked" : "Live unlocked", LV.lock ? "hold Done to leave" : "", null); });
    let lvLeaving = false, holdT = 0;
    lv.addEventListener("click", e => {
      if (!LV.lock || lvLeaving || !e.target.closest || !e.target.closest("#lvDone")) return;
      e.stopPropagation(); e.preventDefault(); mlHud("Live is locked", "hold Done to leave", null);
    }, true);
    const doneB = $id("lvDone");
    doneB.addEventListener("pointerdown", () => {
      if (!LV.lock) return; clearTimeout(holdT); doneB.classList.add("holding");
      holdT = setTimeout(() => { doneB.classList.remove("holding"); lvLeaving = true; try { lvClose(); } finally { lvLeaving = false; } }, 700);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(n => doneB.addEventListener(n, () => { clearTimeout(holdT); doneB.classList.remove("holding"); }));
    paintLock();
    // ---------- the screen stays on while Live is open ----------
    let wl = null;
    async function wake(on) {
      try {
        if (on && !wl && navigator.wakeLock && document.visibilityState === "visible") { wl = await navigator.wakeLock.request("screen"); wl.addEventListener("release", () => { wl = null; }); }
        else if (!on && wl) { const w = wl; wl = null; await w.release(); }
      } catch (e) { wl = null; }
    }
    new MutationObserver(() => wake(!lv.hidden)).observe(lv, { attributes: true, attributeFilter: ["hidden"] });
    document.addEventListener("visibilitychange", () => { if (!lv.hidden && document.visibilityState === "visible") wake(true); });
    // ---------- the output level, and a light when the safety limiter is catching peaks ----------
    const meter = document.createElement("div"); meter.className = "lv-meter"; meter.id = "lvMeter"; meter.innerHTML = "<i></i><b></b>";
    meter.title = "Output level; the light shows the safety limiter catching peaks (nothing clips)";
    $id("lvStop").before(meter);
    let mBuf = null, mRaf = 0, mLast = 0, mPeak = 0, mHot = 0;
    function meterLoop(ts) {
      mRaf = 0; if (lv.hidden) return;
      if (ts - mLast > 45 && analyser) {
        mLast = ts;
        if (!mBuf || mBuf.length !== analyser.fftSize) mBuf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(mBuf); let p = 0; for (let i = 0; i < mBuf.length; i += 2) { const a = Math.abs(mBuf[i]); if (a > p) p = a; }
        const db = p > 1e-5 ? 20 * Math.log10(p) : -90, x = Math.max(0, Math.min(1, (db + 48) / 48));
        mPeak = Math.max(x, mPeak - 0.04);
        meter.firstChild.style.height = (mPeak * 100).toFixed(1) + "%";
        const red = fx && fx.limiter ? fx.limiter.reduction : 0, hot = (typeof red === "number" ? red : 0) < -1.5;
        if (hot) mHot = ts; meter.classList.toggle("hot", ts - mHot < 400); meter.classList.toggle("loud", db > -6);
      }
      mRaf = requestAnimationFrame(meterLoop);
    }
    new MutationObserver(() => { if (!lv.hidden && !mRaf) mRaf = requestAnimationFrame(meterLoop); }).observe(lv, { attributes: true, attributeFilter: ["hidden"] });
    // ---------- Gear: the MiniLab and the K.O. II, who keeps time, sampling the K.O. II ----------
    const koOut2 = () => md.access ? [...md.access.outputs.values()].find(o => KO_RE.test(o.name || "")) : null;
    const koIn = () => md.access ? [...md.access.inputs.values()].find(o => KO_RE.test(o.name || "")) : null;
    const syncMode = () => md.opt.clockOut ? "lead" : md.opt.clockIn ? "follow" : "off";
    const SYNC_KO = { lead: "K.O. II follows", follow: "K.O. II leads", off: "No sync" }, SYNC_ANY = { lead: "Clock out", follow: "Clock in", off: "No sync" };
    const gearB = mkBtn("lvGear", "lv-gear", '<i class="g-ml"></i><i class="g-ko"></i><span></span>', window.NB_YOURS ? "Gear: the MiniLab, the K.O. II and who keeps time" : "Gear: your controller and who keeps time");
    $id("lvKo").before(gearB);
    function paintGear() {
      const ko = !!(koOut2() || koIn()), m = syncMode();
      nbT(gearB.querySelector("span"), (ko ? SYNC_KO : SYNC_ANY)[m]);
      gearB.querySelector(".g-ml").classList.toggle("on", mlLive()); gearB.querySelector(".g-ko").classList.toggle("on", ko);
      gearB.classList.toggle("sync", m !== "off");
    }
    async function setSync(m) {
      if (m !== "off" && !md.access) { try { await connectMidi(); } catch (e) {} }
      const was = syncMode();
      if (m === "lead") { const ko = koOut2(); if (ko && !md.outs.has(ko.id)) { md.outs.add(ko.id); try { mdRemember("out", ko, true); renderMidi(); } catch (e) {} } }
      if (m === "follow") { const ki = koIn(); if (ki && !md.ins.has(ki.id)) { md.ins.add(ki.id); try { mdRemember("in", ki, true); renderMidi(); } catch (e) {} } }
      if (was === "lead" && m !== "lead" && md.access) { try { send([0xfc]); } catch (e) {} }   // (what was following stops with it)
      md.opt.clockOut = m === "lead"; md.opt.clockIn = m === "follow"; saveMd(); try { paintMdOpts(); } catch (e) {}
      paintGear(); lvPaintTop();
    }
    async function koAudioIn() {
      try { const d = (await navigator.mediaDevices.enumerateDevices()).filter(x => x.kind === "audioinput"); return d.find(x => KO_RE.test(x.label || "")) || null; } catch (e) { return null; }
    }
    function popAt(anchor, w, html) {
      closePick(); pick.innerHTML = html; pick.hidden = false;
      const r = anchor.getBoundingClientRect(), W = innerWidth, H = innerHeight; w = Math.min(w, W - 20);
      if (W < 600) { pick.style.cssText = `left:10px;right:10px;bottom:10px;top:auto;width:auto;max-height:${Math.round(H * 0.78)}px`; return; }
      const below = H - r.bottom - 16, above = r.top - 16, maxH = Math.min(640, Math.max(below, above));
      const left = Math.max(10, Math.min(W - w - 10, r.left + r.width / 2 - w / 2));
      pick.style.cssText = `width:${w}px;left:${left}px;max-height:${maxH}px;` + (below >= above ? `top:${r.bottom + 6}px` : `bottom:${H - r.top + 6}px`);
    }
    async function openGear() {
      const ko = koOut2() || koIn(), m = syncMode(), L = ko ? SYNC_KO : SYNC_ANY, ml = mlLive();
      const outs = typeof mdClockPorts === "function" ? mdClockPorts().map(o => o.name) : [];
      popAt(gearB, 440, `<div class="lv-pkh"><div><strong>Gear</strong><small>What's plugged in, and who keeps time</small></div><button class="btn" id="lvPickClose" aria-label="Close">✕</button></div>
        <div class="lv-pkl lv-gearl">
          <div class="lv-pkg">MiniLab 3</div>
          <div class="lv-gr"><span class="lv-st${ml ? " on" : ""}"></span><span>${ml ? "Connected: it plays this screen" : "Not connected"}</span>${ml ? "" : '<button class="btn" data-g="connect">Connect</button>'}</div>
          <div class="lv-pkg">${ko ? "K.O. II" : "Clock (the K.O. II or other gear)"}</div>
          <div class="lv-gr"><span class="lv-st${ko ? " on" : ""}"></span><span>${ko ? "On MIDI over USB" : "No K.O. II on MIDI. Plug it in through the hub."}</span></div>
          <div class="seg lv-sync" role="group" aria-label="Who keeps time">${["lead", "follow", "off"].map(k => `<button data-s="${k}" aria-pressed="${k === m}">${L[k]}</button>`).join("")}</div>
          <p class="lv-note">${m === "lead" ? "Nate Bloom keeps time: tempo, start and stop go " + (outs.length ? "to " + outs.join(", ") : "to the MIDI outputs") + ". ▶ here starts both." : m === "follow" ? "The " + (ko ? "K.O. II" : "incoming clock") + " keeps time: its tempo, start and stop drive Nate Bloom (and Live's ▶ target). Set it to send MIDI clock over USB." : "Each plays at its own tempo."}</p>
          <div class="lv-pkg">Sound from it</div>
          <div class="lv-gr"><button class="btn" data-g="sample">Sample an input…</button><span class="lv-note" data-g="audio">Looking for its USB audio…</span></div>
          <div class="lv-gr"><button class="btn" data-g="midi">MIDI settings…</button><span class="lv-note">which outputs get the clock, channels, inputs</span></div>
          ${window.__live13 ? __live13.gearHTML() : ""}
          ${window.__live12 ? __live12.gearSnd() : ""}
        </div>`);
      pick.querySelector("#lvPickClose").addEventListener("click", closePick);
      pick.querySelectorAll(".lv-sync button").forEach(b => b.addEventListener("click", async () => { await setSync(b.dataset.s); openGear(); }));
      const g = k => pick.querySelector(`[data-g="${k}"]`);
      if (g("connect")) g("connect").addEventListener("click", async () => { try { await connectMidi(); } catch (e) {} mlRefresh(true); paintGear(); setTimeout(openGear, 300); });
      g("midi").addEventListener("click", () => { closePick(); tap("midiBtn"); });
      g("sample").addEventListener("click", async () => {
        closePick(); const d = await koAudioIn();
        if (d) { LINE.devId = d.deviceId; try { localStorage.setItem("nightbloom-linein", d.deviceId); } catch (e) {} }
        tap("lineBtn");
      });
      const a = await koAudioIn(), note = g("audio");
      if (note && !pick.hidden) {
        if (a) { note.textContent = "K.O. II USB audio found: Sample records it into the sampler"; g("sample").textContent = "Sample the K.O. II…"; }
        else note.textContent = ko ? "Its USB audio needs firmware 2.5 or later (and the input allowed once)" : "a USB interface, the mic, anything plugged in";
      }
    }
    gearB.addEventListener("click", () => { start(); openGear(); });
    // Start and stop from the clock you follow play what Live's ▶ plays
    window.__liveTransport = on => {
      if (lv.hidden) return false; start();
      const now = { seq: playing, rc: RC.playing, bp: BP.playing }[LV.play];
      if (on && !now) lvTransport(); else if (!on && now) lvTransport();
      return true;
    };
    // ---------- the set list: a song is a sound, tempo, effects, rhythm, pads and the Live layout ----------
    const SL = Object.assign({ songs: [], big: "pages" }, lsGet("nightbloom-setlist", {}));
    if (!Array.isArray(SL.songs)) SL.songs = [];
    SL.cur = -1; SL.pend = null; SL.cue = null;
    const slSave = () => lsSet("nightbloom-setlist", { songs: SL.songs, big: SL.big });
    const jc = o => JSON.parse(JSON.stringify(o));
    function songSnap(name) {
      return { name, bpm: state.seq.bpm, sound: captureSound(name), cur: state.cur ? { id: state.cur.id, cat: state.cur.cat } : null, label: ($id("sndName") || {}).textContent || "",
        octave: state.octave, scale: { key: scl.key, scale: scl.scale },
        fx: jc(state.fx), fxc: { mode: FXC.mode, by: jc(FXC.by) }, bfx: jc(bfx),
        rc: { tracks: jc(RCP.tracks), steps: RCP.steps, swing: RCP.swing },
        bp: { bank: BPS.bank, seq: BPS.cur },
        live: { kpage: LV.kpage, pset: LV.pset, play: LV.play } };
    }
    function songApply(S) {
      start();
      try { sndQuiet = true; applySound(S.sound); } catch (e) {} finally { sndQuiet = false; }
      if (S.cur) { state.cur = { id: S.cur.id, cat: S.cur.cat }; try { renderEngine(); save(); } catch (e) {} }
      if (typeof S.octave === "number" && S.octave !== state.octave) { state.octave = S.octave; try { buildKeys(); save(); } catch (e) {} }
      if (S.scale) { scl.key = S.scale.key; scl.scale = S.scale.scale; try { saveScale(); paintScale(); } catch (e) {} }
      if (S.fxc) { FXC.mode = S.fxc.mode; FXC.by = jc(S.fxc.by); try { fxcSave(); } catch (e) {} }
      if (S.fx) { Object.assign(state.fx, S.fx); try { if (ctx) applyFx(); refreshFxKnobs(); paintFxState(); save(); } catch (e) {} }
      if (S.bfx) { Object.assign(bfx, S.bfx); saveBfx(); applyBfx(true); }
      if (S.rc) { RCP.tracks = jc(S.rc.tracks); RCP.steps = S.rc.steps; RCP.swing = S.rc.swing; try { if (ctx) RCP.tracks.forEach((t, i) => rcApplyTrack(i)); rcSave(); rcRender(); } catch (e) {} }
      if (S.bpm && S.bpm !== state.seq.bpm) setBpm(S.bpm);
      if (S.bp) { try { if (typeof S.bp.seq === "number" && S.bp.seq !== BPS.cur) bpSeqSelect(S.bp.seq); if (typeof S.bp.bank === "number") { BPS.bank = S.bp.bank; bpPaintGrid(); } } catch (e) {} }
      if (S.live) { lvRelease(); if (KDEF[S.live.kpage]) LV.kpage = S.live.kpage; if (PSETS.some(x => x[0] === S.live.pset)) LV.pset = S.live.pset; if (["seq", "rc", "bp"].includes(S.live.play)) LV.play = S.live.play; lvSave(); }
      ML.lay = null; ML.sent.clear();
      if (!lv.hidden) { lvPaintTop(); lvPaintKnobs(); lvPaintPads(true); mlLightAll(); }
    }
    // when the next bar starts on whatever is playing (Live's ▶ target first), in seconds from now; null: nothing plays
    function nextBarIn() {
      if (!ctx) return null; const now = ctx.currentTime;
      const rc = () => { const sd = rcStepDur(), pos = RC.step - (RC.nextT - now) / sd, nb = Math.ceil((pos + 0.02) / 16) * 16; return RC.nextT + (nb - RC.step) * sd - now; };
      const bp = () => { const abs = BP.absBase + bpPosAt(now), nb = Math.ceil((abs + 0.02) / 16) * 16; return bpTimeAt(nb - BP.absBase) - now; };
      const sq = () => { const sd = stepDur(), pos = curStep - (nextTime - now) / sd, nb = Math.ceil((pos + 0.02) / 16) * 16; return nextTime + (nb - curStep) * sd - now; };
      const order = { rc: [["rc", rc], ["bp", bp], ["seq", sq]], bp: [["bp", bp], ["rc", rc], ["seq", sq]], seq: [["seq", sq], ["rc", rc], ["bp", bp]] }[LV.play] || [];
      const on = { seq: playing, rc: RC.playing, bp: BP.playing };
      for (const [k, f] of order) if (on[k]) { try { const s = f(); if (isFinite(s)) return Math.max(0, s); } catch (e) {} }
      return null;
    }
    function songGo(i) {
      if (!(i >= 0 && i < SL.songs.length)) return;
      clearTimeout(SL.pend && SL.pend.t); SL.cue = null;
      const S = SL.songs[i], go = () => { SL.pend = null; SL.cur = i; songApply(S); paintSong(); mlScreen("Song " + (i + 1), S.name); mlHud("Song " + (i + 1), S.name, null); };
      const s = nextBarIn();
      if (s == null) { go(); return; }
      SL.pend = { i, t: setTimeout(go, Math.max(0, s - 0.12) * 1000) }; paintSong();
      mlScreen("Next bar", S.name);
    }
    function songCancel() { if (SL.pend) { clearTimeout(SL.pend.t); SL.pend = null; } SL.cue = null; paintSong(); }
    function songStep(d) { if (!SL.songs.length) return; const base = SL.pend ? SL.pend.i : SL.cur < 0 ? (d > 0 ? -1 : 0) : SL.cur; songGo(Math.max(0, Math.min(SL.songs.length - 1, base + d))); }
    function songCue(d) {
      if (!SL.songs.length) return; const base = SL.cue != null ? SL.cue : SL.cur < 0 ? (d > 0 ? -1 : 0) : SL.cur;
      SL.cue = Math.max(0, Math.min(SL.songs.length - 1, base + d)); paintSong(); mlScreen("Cue: song " + (SL.cue + 1), SL.songs[SL.cue].name);
    }
    // the song box sits at the right of the knob pages
    const sbox = document.createElement("div"); sbox.className = "lv-song"; sbox.innerHTML = `<button class="lv-sarr" id="lvSongPrev" aria-label="Previous song">‹</button><button class="lv-sname2" id="lvSong" title="Set list"><small></small><b></b></button><button class="lv-sarr" id="lvSongNext" aria-label="Next song">›</button>`;
    { const head = document.createElement("div"); head.className = "lv-mlhead"; $id("lvPages").before(head); head.append($id("lvPages"), sbox); }
    function paintSong() {
      const n = SL.songs.length, b = $id("lvSong");
      let small, big;
      if (SL.pend) { small = "Next bar →"; big = (SL.pend.i + 1) + " · " + SL.songs[SL.pend.i].name; }
      else if (SL.cue != null) { small = "Cued: click the big knob"; big = (SL.cue + 1) + " · " + SL.songs[SL.cue].name; }
      else if (!n) { small = "Set list"; big = "Save songs…"; }
      else if (SL.cur < 0) { small = "Set list · " + n + (n === 1 ? " song" : " songs"); big = "Pick a song"; }
      else { small = "Song " + (SL.cur + 1) + " of " + n; big = SL.songs[SL.cur].name; }
      nbT(b.querySelector("small"), small); nbT(b.querySelector("b"), big);
      sbox.classList.toggle("pend", !!SL.pend); sbox.classList.toggle("cued", SL.cue != null);
      $id("lvSongPrev").disabled = !n; $id("lvSongNext").disabled = !n;
    }
    $id("lvSongPrev").addEventListener("click", () => { start(); songStep(-1); });
    $id("lvSongNext").addEventListener("click", () => { start(); songStep(1); });
    $id("lvSong").addEventListener("click", () => { start(); if (SL.pend || SL.cue != null) { songCancel(); return; } openSetlist(); });
    function openSetlist() {
      const rows = SL.songs.map((S, i) => `<div class="lv-sl${i === SL.cur ? " cur" : ""}" data-i="${i}"><b>${i + 1}</b><div class="lv-sli"><span></span><small></small></div>
        <button class="btn" data-a="go">Go</button><button class="btn" data-a="up" aria-label="Move up"${i ? "" : " disabled"}>↑</button><button class="btn" data-a="dn" aria-label="Move down"${i < SL.songs.length - 1 ? "" : " disabled"}>↓</button><button class="btn" data-a="upd" title="Save what's playing now into this song">Update</button><button class="btn" data-a="del" aria-label="Delete">✕</button></div>`).join("");
      popAt(sbox, 560, `<div class="lv-pkh"><div><strong>Set list</strong><small>A song keeps the sound, tempo, FX and FX Lab, the Rhythm pattern, the Beat Pads bank and sequence, and this screen's pages. While something plays, the next song starts on the next bar.</small></div><button class="btn" id="lvPickClose" aria-label="Close">✕</button></div>
        <div class="lv-slnew"><input type="text" id="lvSlName" placeholder="Song name" maxlength="40" autocomplete="off"><button class="btn primary" id="lvSlAdd">Save as a song</button></div>
        <div class="lv-slbig"><span>MiniLab big knob:</span><div class="seg" role="group"><button data-b="pages" aria-pressed="${SL.big !== "songs"}">Knob pages</button><button data-b="songs" aria-pressed="${SL.big === "songs"}">Songs (turn cues, click loads)</button></div></div>
        <div class="lv-pkl">${rows || '<p class="lv-note">No songs yet. Set up the first one (sound, tempo, effects, rhythm, pads), name it and save it. Then the next.</p>'}</div>`);
      pick.querySelector("#lvPickClose").addEventListener("click", closePick);
      pick.querySelectorAll(".lv-sl").forEach(r => { const S = SL.songs[+r.dataset.i]; r.querySelector("span").textContent = S.name; r.querySelector("small").textContent = Math.round(S.bpm) + " bpm · " + (S.label || (S.sound && S.sound.engine) || ""); });
      const nm = $id("lvSlName"); nm.value = "Song " + (SL.songs.length + 1);
      $id("lvSlAdd").addEventListener("click", () => {
        const name = (nm.value || "").trim() || "Song " + (SL.songs.length + 1);
        SL.songs.push(songSnap(name)); SL.cur = SL.songs.length - 1; slSave(); paintSong(); openSetlist(); mlHud("Saved song " + SL.songs.length, name, null);
      });
      nm.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $id("lvSlAdd").click(); } });
      pick.querySelectorAll(".lv-slbig button").forEach(b => b.addEventListener("click", () => { SL.big = b.dataset.b; slSave(); SL.cue = null; ML.lay = null; paintSong(); openSetlist(); }));
      pick.querySelectorAll(".lv-sl").forEach(r => r.addEventListener("click", e => {
        const b = e.target.closest("button[data-a]"); if (!b) return; const i = +r.dataset.i, a = b.dataset.a;
        if (a === "go") { closePick(); songGo(i); return; }
        if (a === "up" && i > 0) { SL.songs.splice(i - 1, 0, SL.songs.splice(i, 1)[0]); if (SL.cur === i) SL.cur = i - 1; else if (SL.cur === i - 1) SL.cur = i; }
        if (a === "dn" && i < SL.songs.length - 1) { SL.songs.splice(i + 1, 0, SL.songs.splice(i, 1)[0]); if (SL.cur === i) SL.cur = i + 1; else if (SL.cur === i + 1) SL.cur = i; }
        if (a === "upd") { SL.songs[i] = Object.assign(songSnap(SL.songs[i].name), SL.songs[i].notes ? { notes: SL.songs[i].notes } : {}); SL.cur = i; mlHud("Updated song " + (i + 1), SL.songs[i].name, null); }
        if (a === "del") { if (!b.dataset.arm) { b.dataset.arm = "1"; b.textContent = "Sure?"; setTimeout(() => { if (b.isConnected) { delete b.dataset.arm; b.textContent = "✕"; } }, 2500); return; } SL.songs.splice(i, 1); if (SL.cur === i) SL.cur = -1; else if (SL.cur > i) SL.cur--; }
        slSave(); paintSong(); openSetlist();
      }));
    }
    // the MiniLab: with Songs on, the big knob cues a song and a click loads it (on the next bar)
    { const l0 = L.live; L.live = function () {
        const o = l0.apply(this, arguments);
        if (SL.big === "songs" && SL.songs.length) {
          const c = o.M.click;
          o.M.turn = ["Cue a song (the set list)", d => songCue(d)];
          o.M.click = [SL.cue != null ? "Load song " + (SL.cue + 1) + " on the next bar" : c[0], () => { if (SL.cue != null) songGo(SL.cue); else c[1](); }];
        }
        return o;
      }; }
    paintSong();
    // ---------- Capture: what you just played on the keys and the Notes and Chords pads, as a Garage track ----------
    const CAP = { notes: [], open: new Map(), pads: new Map() };
    function capOn(m, v) { if (!ctx) return; capOff(m); CAP.open.set(m, { m, t0: ctx.currentTime, v: Math.max(1, Math.min(127, v || 100)) }); }
    function capOff(m) {
      const o = CAP.open.get(m); if (!o || !ctx) return; CAP.open.delete(m);
      CAP.notes.push({ m, t0: o.t0, t1: Math.max(o.t0 + 0.03, ctx.currentTime), v: o.v });
      const cut = ctx.currentTime - 240; while (CAP.notes.length && (CAP.notes[0].t0 < cut || CAP.notes.length > 2000)) CAP.notes.shift();
    }
    { const on0 = noteOn, off0 = noteOff;
      noteOn = function (m) { const r = on0.apply(this, arguments); try { capOn(m, NB_VEL7 || 100); } catch (e) {} return r; };
      noteOff = function (m) { const r = off0.apply(this, arguments); try { capOff(m); } catch (e) {} return r; }; }
    { const pv0 = padVoices, ps0 = padStop;
      padVoices = function (id, notes, vel, setup) { const r = pv0.apply(this, arguments); if (!setup && Array.isArray(notes)) { CAP.pads.set(id, notes.slice()); notes.forEach(m => capOn(m, vel)); } return r; };
      padStop = function (id) { const n = CAP.pads.get(id); if (n) { CAP.pads.delete(id); n.forEach(capOff); } return ps0.apply(this, arguments); }; }
    // the bar line of what's playing at or before time t (to line the capture up with it), or null
    function barLine(t) {
      const on = { seq: playing, rc: RC.playing, bp: BP.playing }, now = ctx.currentTime;
      try {
        if (on.rc) { const sd = rcStepDur(), pos = RC.step - (RC.nextT - now) / sd, bs = Math.floor(pos / 16) * 16; return { t: RC.nextT - (RC.step - bs) * sd, bar: sd * 16 }; }
        if (on.bp) { const abs = BP.absBase + bpPosAt(now), bs = Math.floor(abs / 16) * 16; return { t: bpTimeAt(bs - BP.absBase), bar: BP.sd * 16 }; }
        if (on.seq) { const sd = stepDur(), pos = curStep - (nextTime - now) / sd, bs = Math.floor(pos / 16) * 16; return { t: nextTime - (curStep - bs) * sd, bar: sd * 16 }; }
      } catch (e) {}
      return null;
    }
    function capTake() {
      if (!ctx) return null;
      const now = ctx.currentTime, bpm = rcBpm(), spb = 60 / bpm;
      let all = CAP.notes.concat([...CAP.open.values()].map(o => ({ m: o.m, t0: o.t0, t1: now, v: o.v }))).filter(n => n.t0 > now - 64 * spb).sort((a, b) => a.t0 - b.t0);
      if (!all.length) return null;
      // the last phrase: back from the end until a gap of two bars or more
      let i0 = 0, end = all[0].t1;
      for (let i = 1; i < all.length; i++) { if (all[i].t0 - end > 8 * spb) i0 = i; end = Math.max(end, all[i].t1); }
      all = all.slice(i0);
      const g = barLine(all[0].t0), barLen = g ? g.bar : 4 * spb, bspb = barLen / 4;
      const ref = g ? g.t - Math.ceil((g.t - all[0].t0) / barLen - 1e-6) * barLen : all[0].t0;
      const notes = all.map(n => [+Math.max(0, (n.t0 - ref) / bspb).toFixed(4), n.m, +Math.max(0.06, (n.t1 - n.t0) / bspb).toFixed(4), +(n.v / 127).toFixed(3)]);
      const len = Math.max(...notes.map(n => n[0] + n[2]));
      return { notes, len, bpm, used: all };
    }
    function gbRef() {
      const c = (state.cur && state.cur.id) || "";
      if (c.startsWith("w:")) return { snd: "lib:" + c.slice(2), kind: "keys" };
      if (c.startsWith("n:")) return { snd: "pre:" + c.slice(2), kind: "synth" };
      if (ENGINES[state.engine]) return { snd: "eng:" + state.engine, kind: "synth" };
      return { snd: null, kind: "synth" };
    }
    function capture() {
      start();
      const c = capTake();
      if (!c) { mlHud("Nothing to capture yet", "play the keys, or the Notes or Chords pads, then Capture", null); return null; }
      if (!window.__gb || !__gb.capture) { mlHud("Capture", "the Garage isn't here (Lite)", null); return null; }
      const r = gbRef(), res = __gb.capture({ notes: c.notes, len: c.len, bpm: c.bpm, snd: r.snd, kind: r.kind });
      if (!res) { mlHud("Couldn't capture", "the Garage song is full (32 tracks)", null); return null; }
      const used = new Set(c.used); CAP.notes = CAP.notes.filter(n => !used.has(n));
      mlHud("Captured " + res.bars + (res.bars === 1 ? " bar" : " bars"), res.notes + " notes → Garage · " + res.song + " · " + res.track, null);
      paintCap(); return res;
    }
    const capB = mkBtn("lvCap", "lv-cap", '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg><span>Capture</span>', "Capture: what you just played on the keys and pads becomes a Garage track");
    $id("lvRec").after(capB);
    capB.addEventListener("click", capture);
    function paintCap() { const n = CAP.notes.length + CAP.open.size; capB.classList.toggle("has", n > 0); }
    // keep Gear, the song box and Capture fresh with the rest of the top bar
    { const pt = lvPaintTop; lvPaintTop = function () { const r = pt.apply(this, arguments); try { paintGear(); paintCap(); } catch (e) {} return r; }; }
    paintGear();
    window.__live2 = { SL, songSnap, songApply, songGo, songCue, nextBarIn, capTake, capture, CAP, setSync, syncMode, openGear, openSetlist, paintSong };
