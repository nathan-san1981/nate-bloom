    // ======================================================================
    // 155, stage 1 of the rebuild: Set up, the strip, Find. Set up is one full screen for the rig, with seven sections
    // (Sound check, MIDI, Gear, Pixelbook, Projects, App, Help); the sheets that exist today (MIDI, Projects, Help,
    // Gear's popup) are parked inside it rather than copied, so nothing is duplicated. Find is one search over
    // actions, settings, sounds, songs, pad sets and help: / or Ctrl-K, two letters, Enter. The strip (the new shell,
    // Help → New shell or Settings → App) is now real: tempo, key and bar:beat, dots for the MiniLab, the K.O. II and the
    // Pixelbook, where the sound goes, dropouts, Log and Find, and a message the moment the route or a MIDI device
    // changes; Play opens Live, Build the main screen, Set up this space, and the current interface runs under it.
    // ======================================================================
    window.NB_BUILD = 201;
    // (191) the build number where it's easy to see: in Help's title
    try { const hh = document.querySelector("#helpSheet .ed-head strong"); if (hh) hh.textContent = "How Nate Bloom works · build " + window.NB_BUILD; } catch (e) {}
    const SU = { el: null, pane: null, nav: null, sec: "", parked: null, from: null, obs: null, unsub: null, last: lsGet("nightbloom-setup", "sound"), toneT: 0 };
    const SU_SECS = [["sound", "Sound check"], ["midi", "MIDI"], ["gear", "Gear"], ["pixelbook", "Pixelbook"], ["projects", "Projects"], ["app", "App"], ["help", "Help"]];
    const suName = s => (SU_SECS.find(x => x[0] === s) || ["", ""])[1];
    const suHidden = (id, name) => { const b = document.createElement("button"); b.id = id; b.type = "button"; b.style.display = "none"; b.textContent = name; document.body.appendChild(b); return b; };
    const setupBtn = suHidden("setupBtn", "Settings"), findBtn = suHidden("findBtn", "Find");
    const suOpenNow = () => !!(SU.el && !SU.el.hidden);
    function suBuild() {
      if (SU.el) return SU.el;
      const el = document.createElement("div"); el.className = "dj su"; el.id = "setup"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Settings");
      el.innerHTML = `<div class="su-top"><strong>Settings</strong><span class="su-sub">the rig: nothing you touch mid-song</span><button type="button" class="btn" id="suFindBtn">Find</button><button type="button" class="btn primary" id="suDone">Done</button></div>
        <div class="su-body"><nav class="su-nav" aria-label="Settings sections">${SU_SECS.map(([k, n]) => `<button type="button" data-sec="${k}" aria-pressed="false">${n}</button>`).join("")}</nav><div class="su-pane" id="suPane"></div></div>`;
      document.body.appendChild(el); SU.el = el; SU.pane = $id("suPane"); SU.nav = el.querySelector(".su-nav");
      SU.nav.querySelectorAll("button").forEach(b => b.addEventListener("click", () => suShow(b.dataset.sec)));
      $id("suDone").addEventListener("click", () => suClose(false));
      $id("suFindBtn").addEventListener("click", () => fdOpen());
      return el;
    }
    // ---- parking today's sheets inside the pane ----
    const suCloseBtn = el => [...el.querySelectorAll("button")].find(b => /(Done|Cancel|Close)$/.test(b.id) && !b.closest("[hidden]")) || [...el.querySelectorAll("button")].find(b => /^(Done|Cancel|Close|Back)$/i.test(b.textContent.trim()) && !b.closest("[hidden]"));
    function suPark(el) {
      suUnpark(true);
      SU.parked = el; SU.from = el === pick ? null : { p: el.parentNode, n: el.nextSibling };
      SU.pane.appendChild(el); el.classList.add("parked");
      SU.obs = new MutationObserver(() => { if (el.hidden) suClose(true); });   // its own Done means done
      SU.obs.observe(el, { attributes: true, attributeFilter: ["hidden"] });
    }
    function suUnpark(close) {
      const el = SU.parked; if (!el) return;
      SU.parked = null; if (SU.obs) { SU.obs.disconnect(); SU.obs = null; }
      el.classList.remove("parked");
      if (el === pick) { if (close && !pick.hidden) closePick(); if (pick.parentNode === SU.pane) (GEAR.standalone ? document.body : lv).appendChild(pick); }
      else {
        const f = SU.from; SU.from = null;
        if (f && f.p) f.p.insertBefore(el, f.n && f.n.parentNode === f.p ? f.n : null); else document.body.appendChild(el);
        if (close && !el.hidden) { const b = suCloseBtn(el); if (b) b.click(); else el.hidden = true; }
      }
    }
    { const pa = popAt; popAt = function () {   // Gear re-renders itself: keep it in the pane while Set up shows it
        const r = pa.apply(this, arguments);
        if (suOpenNow() && SU.sec === "gear" && SU.parked === pick && pick.parentNode !== SU.pane) { GEAR.standalone = true; pick.classList.add("standalone"); gearBack.hidden = true; SU.pane.appendChild(pick); pick.classList.add("parked"); }
        return r; }; }
    // ---- Sound check ----
    const suRow = (b, inner, id) => `<div class="su-row"${id ? ` id="${id}"` : ""}><b>${b}</b>${inner}</div>`;
    function suSoundHTML() {
      const sink = $id("sinkRow") && !$id("sinkRow").hidden, android = !!window.NB_NATIVE;
      return `<div class="su-h">Sound check</div>
        ${suRow("Sound goes to", `<span id="suOut"></span>${sink ? ' <button type="button" class="btn" id="suSink">Choose…</button>' : ""}`, "suOutRow")}
        ${android ? suRow("Media volume", '<span id="suVol"></span>', "suVolRow") : ""}
        ${window.NB_LITE ? "" : suRow("Sound buffer", `<div class="seg su-buf" role="group" aria-label="Sound buffer"><button type="button" data-b="fast" aria-pressed="${bufWant() === "fast"}">Fast</button><button type="button" data-b="steady" aria-pressed="${bufWant() === "steady"}">Steady</button></div><span id="suBuf" class="su-note"></span>`, "suBufRow")}
        ${suRow("Dropouts", '<span id="suDrops"></span>', "suDropsRow")}
        ${suRow("Test tone", '<button type="button" class="btn" id="suTone">▶ One second at 440 Hz</button><span class="su-note">through the same output as everything else</span>', "suToneRow")}
        ${suRow("No sound?", '<button type="button" class="btn" id="suFix">Fix sound</button><span class="su-note">reopens the sound on whatever is plugged in now</span>', "suFixRow")}
        <div id="suNotes"></div>`;
    }
    function suSoundPaint(d) {
      if (SU.sec !== "sound" || !suOpenNow()) return; d = d || nbsGet(); const r = d.rig || {}, h = d.health || {};
      const out = $id("suOut"); if (out) nbT(out, r.out || "system default");
      const vol = $id("suVol"); if (vol) nbT(vol, r.volume ? r.volume.music + " of " + r.volume.max + (r.volume.music <= r.volume.max * 0.2 ? " · low" : "") : "unknown");
      const buf = $id("suBuf"); if (buf) {
        const want = bufWant(), now = bufNow(), ms = bufMs();
        nbT(buf, "now " + (now === "steady" ? "Steady" : "Fast") + (ms != null ? " · " + ms + " ms from a key to its sound" : "") + (want !== now ? " · reload to make it " + (want === "steady" ? "Steady" : "Fast") : ""));
        if (want !== now && !$id("suReload")) { const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.id = "suReload"; b.textContent = "Reload now"; b.addEventListener("click", () => { add139("setup", "reload for the sound buffer"); location.reload(); }); buf.parentNode.appendChild(b); }
        if (want === now && $id("suReload")) $id("suReload").remove();
      }
      const dr = $id("suDrops"); if (dr) nbT(dr, h.dropouts == null ? "not measured yet" : h.dropouts + " in the last minute");
      const notes = $id("suNotes"); if (notes) { const html = (h.notes || []).map(t => `<p class="lv-note bad"><b>${esc3(t)}</b></p>`).join(""); if (notes.innerHTML !== html) notes.innerHTML = html; }
    }
    function suTone() {
      start(); if (!ctx) return;
      const t0 = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 440;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02); g.gain.setValueAtTime(0.18, t0 + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 1.05);
      const b = $id("suTone"); if (b) { nbT(b, "Playing…"); clearTimeout(SU.toneT); SU.toneT = setTimeout(() => { if ($id("suTone")) nbT($id("suTone"), "▶ One second at 440 Hz"); }, 1100); }
      add139("setup", "test tone");
    }
    function suSoundWire() {
      SU.pane.querySelectorAll(".su-buf button").forEach(b => b.addEventListener("click", () => { lsSet("nightbloom-buffer", b.dataset.b); SU.pane.querySelectorAll(".su-buf button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); add139("setup", "sound buffer → " + b.dataset.b + " (after a reload)"); suSoundPaint(); }));
      const t = $id("suTone"); if (t) t.addEventListener("click", suTone);
      const f = $id("suFix"); if (f) f.addEventListener("click", () => { const h = $id("helpFixSound"); if (h) h.click(); nbT(f, "Done"); setTimeout(() => nbT(f, "Fix sound"), 1500); });
      const s = $id("suSink"); if (s) s.addEventListener("click", () => suOpen("midi", "#sinkRow"));
    }
    // ---- Pixelbook, App ----
    const PERM_OPTS = [["always", "any time"], ["between-songs", "only between songs"], ["ask", "ask first"], ["never", "never"]];
    function suPixHTML() {
      const P = nbsPerms(), up = !!nbsTry(lkUp, false), mode = nbsTry(() => LKS.mode, "off");
      const sel = (k, lab) => `<div class="su-row"><b>${lab}</b><select data-perm="${k}" aria-label="${lab}">${PERM_OPTS.map(([v, t]) => `<option value="${v}"${P[k] === v ? " selected" : ""}>${t}</option>`).join("")}</select></div>`;
      return `<div class="su-h">Pixelbook</div>
        ${suRow("Link", `<span id="suLink">${up ? "linked" : mode === "off" ? "off" : mode}</span> <button type="button" class="btn" id="suPair">Pair, code, who keeps time…</button><span class="su-note">in Gear</span>`, "suLinkRow")}
        <div class="su-h" style="margin-top:10px">What the Pixelbook may change</div><div id="suPerms">${sel("levels", "Levels (Mixer)")}${sel("scenes", "Scenes (Director)")}${sel("sound", "Replace a sound (Library)")}</div>
        <p class="su-note">The tablet applies every change itself and wins any conflict; these only say which requests it accepts. "Ask first" puts a bar here with Accept and No; "only between songs" refuses while anything plays. Open the Stage page on the Pixelbook for its Director, Mixer and Library.</p>
        ${$id("lkBtn") && !$id("lkBtn").hidden ? suRow("Computer", '<button type="button" class="btn" id="suLk">Link to the Linux app…</button><span class="su-note">projects both ways, Play together, Ableton Link</span>', "suLkRow") : ""}`;
    }
    function suPixWire() {
      SU.pane.querySelectorAll("select[data-perm]").forEach(s => s.addEventListener("change", () => nbsIntent({ path: "perms", value: { [s.dataset.perm]: s.value } })));
      const p = $id("suPair"); if (p) p.addEventListener("click", () => suOpen("gear", ".lv-pb, [data-g=\"pb\"], .lv-link"));
      const l = $id("suLk"); if (l) l.addEventListener("click", () => $id("lkBtn").click());
    }
    function suAppHTML() {
      const app = window.NB_NATIVE ? nbsTry(() => String(NBNativeBridge.version()), "") : "";
      return `<div class="su-h">App</div>
        ${suRow("Install", '<button type="button" class="btn" id="suInstall">Add to the home screen…</button>', "suInstallRow")}
        ${suRow("Versions", `<span id="suVer">page build ${NB_BUILD}${window.NB_LITE ? " · Lite" : ""}${window.NB_NATIVE && window.NB_NATIVE.platform === "linux" ? " · Linux app " + esc3(String(window.NB_NATIVE.version || "")) : app ? " · Android app " + esc3(app) : window.NB_NATIVE ? " · Android app" : ""}</span>`, "suVerRow")}
        ${window.NBEngine ? suRow("Native engine", `<button type="button" class="btn" id="suNat" aria-pressed="${!!(window.__ne && window.__ne.on)}">${window.__ne && window.__ne.on ? "On" : "Off"}</button><span class="su-note" id="suNatNote">the synths worked out on several cores, not the one audio thread</span>`, "suNatRow") : ""}
        ${window.NBPlug ? suRow("VST3, CLAP, LV2", `<button type="button" class="btn" id="suVst">Plugins…</button><span class="su-note" id="suVstNote">plugins on this computer, each on a thread of its own</span>`, "suVstRow") : ""}
        ${window.NB_NATIVE && window.NB_NATIVE.setWide ? suRow("Screens", `<button type="button" class="btn" id="suWide" aria-pressed="${document.body.classList.contains("nb-wide")}">Across both screens</button><span class="su-note">the window spans your screens side by side and the page uses the whole width (61 keys across both) · Ctrl+Shift+F</span>`, "suWideRow") : ""}
        ${suRow("Keys and letters", '<button type="button" class="btn" id="suKeys">In Help…</button><span class="su-note">letters on the keys, the keyboard layout, hints, vibration</span>', "suKeysRow")}`;
    }
    function suAppWire() {
      $id("suInstall").addEventListener("click", () => $id("installBtn").click());
      $id("suKeys").addEventListener("click", () => suOpen("help", "#kbdLabBtn"));
      { const w = $id("suWide"); if (w) w.addEventListener("click", () => window.NB_NATIVE.setWide(!document.body.classList.contains("nb-wide"))); }
      { const v = $id("suVst"), nt = $id("suVstNote"), P = window.__nbPlug; if (v && P) {   // (177)
          v.addEventListener("click", () => { const b = $id("wamBtn"); if (b) b.click(); });
          const n = P.plugins.length, l = P.live.size; nt.textContent = (n ? n + " found" + (l ? " · " + l + " loaded" : "") : "none found yet") + " · in " + (P.folders ? [...new Set([P.folders.vst3[0], P.folders.clap[0]])].map(x => x.replace(/^\/home\/[^/]+/, "~")).join(" and ") : "~/.vst3 and ~/.clap") + " and the system's plugin folders"; } }
      { const b = $id("suNat"), nt = $id("suNatNote"); if (b && window.__ne) {
          const paint = () => { const st = window.__ne.state(); b.setAttribute("aria-pressed", String(st.on)); b.textContent = st.on ? "On" : "Off";
            nt.textContent = !st.on ? "off: the synths play on the browser's one audio thread" : st.running ? "Juno, Supersaw, Analog, Hoover, Mono, Pluck, Tyrell, Sync Lead and Comb Bells worked out on " + ((st.engine && st.engine.threads) || 1) + (((st.engine && st.engine.threads) || 1) === 1 ? " thread" : " threads") + (st.engine ? " · " + st.engine.voices + " sounding · " + Math.round(st.engine.blockUs / st.engine.budgetUs * 100) + "% of its time" : "") : "not running" + (st.why ? ": " + st.why : "") + " (the browser's synths play)"; };
          b.addEventListener("click", () => { window.__ne.set(!window.__ne.on); setTimeout(paint, 300); }); paint(); const iv = setInterval(() => { if (!document.body.contains(b)) clearInterval(iv); else paint(); }, 1000); } }
    }
    // ---- the space ----
    function suShow(sec) {
      if (!SU_SECS.some(x => x[0] === sec)) sec = "sound";
      suUnpark(true); if (SU.unsub) { SU.unsub(); SU.unsub = null; }
      SU.sec = sec; SU.last = sec; lsSet("nightbloom-setup", sec);
      SU.nav.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sec === sec)));
      const P = SU.pane; P.innerHTML = ""; P.scrollTop = 0;
      if (sec === "sound") { P.innerHTML = suSoundHTML(); suSoundWire(); SU.unsub = nbsSubscribe(d => suSoundPaint(d)); }
      else if (sec === "midi") { $id("midiBtn").click(); suPark($id("midiSheet")); }
      else if (sec === "gear") { start(); GEAR.standalone = true; openGear(); gearPark(); gearBack.hidden = true; suPark(pick); }
      else if (sec === "pixelbook") { P.innerHTML = suPixHTML(); suPixWire(); }
      else if (sec === "projects") {
        P.innerHTML = `<div class="su-row" id="suProjRow"><b>Also here</b><button type="button" class="btn" id="suHis">History</button><button type="button" class="btn" id="suEx">Export</button><button type="button" class="btn" id="suExit">Exit and save</button></div>`;
        $id("suHis").addEventListener("click", () => $id("hisBtn").click()); $id("suEx").addEventListener("click", () => $id("exBtn").click()); $id("suExit").addEventListener("click", () => $id("exitBtn").click());
        $id("prBtn").click(); suPark($id("projects"));
      }
      else if (sec === "app") { P.innerHTML = suAppHTML(); suAppWire(); }
      else if (sec === "help") { $id("helpBtn").click(); suPark($id("helpSheet")); }
      add139("setup", sec);
    }
    function suOpen(sec, hi) {
      start(); suBuild();
      if (SU.el.hidden) { SU.el.hidden = false; document.body.classList.add("setup-on"); }
      if (sec || !SU.sec) suShow(sec || SU.last);
      if (hi) setTimeout(() => suHighlight(hi), 320);
      try { shPaint(); } catch (e) {}
    }
    function suClose(fromSheet) {
      if (!suOpenNow()) return;
      suUnpark(!fromSheet); if (SU.unsub) { SU.unsub(); SU.unsub = null; }
      SU.el.hidden = true; SU.sec = ""; document.body.classList.remove("setup-on");
      try { shPaint(); } catch (e) {}
    }
    function suHighlight(hi) {
      let el = null;
      if (typeof hi === "string") { try { el = SU.pane.querySelector(hi); } catch (e) {} if (!el) el = suByText(hi); }
      else el = hi;
      if (!el) return;
      const row = el.closest(".su-row, .md-learn, .mx-lab, .sp-lab, p, .lv-gr, .lv-pkg, .pr-row, .ed-row, label") || el;
      try { row.scrollIntoView({ block: "center" }); } catch (e) {}
      row.classList.add("su-hi"); setTimeout(() => row.classList.remove("su-hi"), 2600);
    }
    function suByText(text) {
      const q = String(text).toLowerCase(); let best = null;
      for (const el of SU.pane.querySelectorAll("b, strong, .sp-lab span, label, legend, h3, button")) { const t = (el.textContent || "").trim().toLowerCase(); if (t && t.includes(q) && !el.closest("[hidden]")) { if (!best || t.length < best.t) best = { el, t: t.length }; } }
      return best ? best.el : null;
    }
    setupBtn.addEventListener("click", () => suOpen());
    // ---- Find ----
    const FD = { el: null, list: null, input: null, items: [], shown: [], sel: 0, built: 0 };
    const FD_ORDER = ["Actions", "Settings", "Sounds", "Songs", "Pads", "Help"];
    function fdBuild() {
      if (FD.el) return;
      const el = document.createElement("div"); el.className = "editor sheet find"; el.id = "find"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Find");
      el.innerHTML = `<div class="ed-card"><div class="ed-head find-head"><input id="findIn" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Find a setting, a sound, a song, an action…" aria-label="Find"><button type="button" class="btn" id="findClose">Close</button></div><div class="find-list" id="findList" role="listbox"></div><p class="lv-note">/ or Ctrl-K opens Find · ↑ ↓ choose · Enter runs it or opens it</p></div>`;
      document.body.appendChild(el); FD.el = el; FD.list = $id("findList"); FD.input = $id("findIn");
      $id("findClose").addEventListener("click", () => fdClose());
      el.addEventListener("click", e => { if (e.target === el) fdClose(); });
      FD.input.addEventListener("input", () => fdRender(FD.input.value));
      FD.input.addEventListener("keydown", e => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!FD.shown.length) return; FD.sel = (FD.sel + (e.key === "ArrowDown" ? 1 : -1) + FD.shown.length) % FD.shown.length; fdPaintSel(); }
        else if (e.key === "Enter") { e.preventDefault(); const it = FD.shown[FD.sel]; if (it) fdRun(it); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fdClose(); }
      });
    }
    function fdIndex() {
      const A = [], add = (g, t, s, run, k) => A.push({ g, t, s: s || "", k: (k || "").toLowerCase(), run });
      const act = (t, s, run, k) => add("Actions", t, s, run, k);
      (window.__nbFindMore || []).forEach(f => { try { f(add); } catch (e) {} });   // (200) Favorites and the like
      act("Effects off / on", "every effect, Effects and FX Lab · the ` key", () => fxKeyToggle(), "fx lab");
      act("Get free plugins", "open-source synths, samplers and effects for the Linux app", () => { try { document.getElementById("wamBtn").click(); setTimeout(() => { const h = [...document.querySelectorAll("#wamList *")].find(e => e.textContent === "Get free plugins"); if (h) h.scrollIntoView({ block: "start" }); }, 300); } catch (e) {} }, "plugins vst clap install download surge vital dexed reverb");
      act("Hardware synth (Minilogue)", "its sheet: Direct monitoring, pass-through, its effects, input and level", () => { try { window.__hw && window.__hw.open(); } catch (e) {} }, "minilogue microfreak direct monitoring pass-through hardware synth volt");
      act("Stop everything", "sequencer, Rhythm, DJ, Jam, pads, held notes", () => $id("stopAll").click(), "stop all panic silence");
      act("Rescan MIDI", "ask for the MIDI devices again", () => { $id("midiBtn").click(); $id("mdConnect").click(); }, "midi minilab controller plug");
      act("Fix sound", "reopen the sound on whatever is plugged in now", () => { const b = $id("helpFixSound"); if (b) b.click(); }, "no sound silent audio");
      act("Open Play", "the performance surface: stack, macros, pads, set list", () => plOpen(), "live perform stage");
      act("Open Live", "the Live screen as it was", () => lvOpen(), "play perform stage");
      act("Open the DJ", "two decks, sync, crate", () => $id("djBtn").click(), "decks mix");
      act("Open the Rhythm Creator", "the 16-track drum machine", () => $id("rcBtn").click(), "beat grid drums");
      act("Open Beat Pads", "16 pads, banks, loop recorder", () => $id("bpBtn").click(), "pads kit");
      act("Open the Garage", "tracks, instruments, piano roll, mix", () => $id("gbBtn").click(), "tracks timeline record");
      act("Save the log", "what the app was doing, the last minute of sound, every setting", () => logTap("find"), "report bug dropout");
      act("Report a problem", "a zip to send for a fix", () => $id("reportBtn").click(), "bug log help");
      act("Save and exit", "save as a project and close", () => $id("exitBtn").click(), "quit close");
      const set = (sec, t, s, hi, k) => add("Settings", t, "Settings › " + suName(sec) + (s ? " · " + s : ""), () => suOpen(sec, hi), k);
      set("sound", "Sound goes to", "where Android or the browser sends the sound", "#suOutRow", "output route headphones speaker usb");
      if (window.NB_NATIVE) set("sound", "Media volume", "the tablet's volume", "#suVolRow", "loud quiet");
      if (!window.NB_LITE) set("sound", "Sound buffer", "Fast or Steady", "#suBufRow", "latency dropouts crackle steady fast");
      set("sound", "Dropouts", "how often the sound fell behind", "#suDropsRow", "glitch crackle cpu");
      set("sound", "Test tone", "one second at 440 Hz", "#suToneRow", "sine check hear");
      set("sound", "Fix sound", "no sound after switching apps or plugging in", "#suFixRow", "silent audio reopen");
      set("midi", "MIDI inputs and outputs", "which ports are on", "Inputs", "ports keyboard controller");
      set("midi", "Who keeps time", "clock in and out: Lead, Follow, Off", "Clock", "sync tempo lead follow ko2 k.o. ii");
      if ($id("sinkRow") && !$id("sinkRow").hidden) set("midi", "Sound out", "the output on a computer, Chromebook or the Linux app", "#sinkRow", "device interface hdmi");
      set("midi", "MIDI learn", "give a knob or fader a job on this screen", "learn", "map assign cc");
      set("midi", "MiniLab 3 layouts", "layouts, badges, pad lights, the strip, the map", "MiniLab", "arturia pads knobs faders");
      set("midi", "Velocity", "how hard you hit a key sets the level", "Velocity", "touch firm light");
      set("midi", "Line up the K.O. II", "extra delay so both kicks land together", "Line up", "ko2 delay offset");
      set("midi", "Rescan MIDI", "ask Android for its MIDI list again", "#mdConnect", "connect minilab");
      set("gear", "What's plugged in", "the MiniLab, the K.O. II, the Pixelbook, sound", ".lv-pkg", "devices usb");
      set("gear", "K.O. II: follows, leads or no sync", "who keeps time", ".lv-sync", "clock ko2");
      set("gear", "This tablet (what Android sees)", "USB devices, route, volume, MIDI devices, Purist", ".lv-tr", "android usb purist diag");
      set("pixelbook", "Pixelbook permissions", "levels, scenes, sounds", "#suPerms", "allow stage mixer director library");
      set("pixelbook", "Pair the Pixelbook", "the link and its code", "#suLinkRow", "link code stage wifi");
      set("projects", "Projects", "save, open, share, import", "#projects", "save load backup");
      set("projects", "History", "every change, newest first", "#suHis", "undo redo changes");
      set("projects", "Export", "stems, MIDI file, K.O. II pads", "#suEx", "wav mp3 stems midi");
      set("projects", "Exit and save", "close Nate Bloom", "#suExit", "quit");
      set("app", "Install as an app", "add to the home screen", "#suInstallRow", "home screen pwa");
      set("app", "Versions", "the page build and the Android app", "#suVerRow", "update version build");
      set("help", "How Nate Bloom works", "the whole help", "#helpSheet", "manual guide");
      set("help", "Keys and shortcuts", "every key", ".help-grid", "keyboard shortcuts");
      set("help", "Letters on the keys", "and the keyboard layout", "#kbdLabBtn", "musical typing two rows");
      set("help", "Report a problem", "a zip to send for a fix", "#reportBtn", "bug");
      try { allEntries().forEach(e => { if (/^e:(samp|pads|drum)$/.test(e.id)) return; const cat = (LIB_CATS.find(c => c[0] === e.cat) || ["", ""])[1]; add("Sounds", e.name, (e.sub ? e.sub + " · " : "") + cat, () => { start(); chooseEntry(e); try { if (!lv.hidden) { lvPaintTop(); lvPaintKnobs(); } } catch (x) {} }, cat); }); } catch (e) {}
      try { SL.songs.forEach((S, i) => add("Songs", S.name, "set list · " + (S.bpm ? S.bpm + " bpm" : "") + (i === SL.cur ? " · playing now" : ""), () => { if (lv.hidden) lvOpen(); songGo(i); }, "song set list")); } catch (e) {}
      try { PSETS.forEach(([id]) => add("Pads", psetName(id), "pad set in Live", () => { setPset(id); if (lv.hidden) lvOpen(); }, "pads bank")); } catch (e) {}
      try { document.querySelectorAll("#helpSheet .help-list p").forEach(p => { if (p.hidden) return; const b = p.querySelector("b"); if (!b) return; const t = b.textContent.replace(/[:.]\s*$/, "").trim(); if (!t || t.length > 60) return; add("Help", t, (p.textContent || "").replace(b.textContent, "").trim().slice(0, 90), () => { suOpen("help", p); }, (p.textContent || "").slice(0, 400)); }); } catch (e) {}
      return A;
    }
    function fdScore(it, toks) {
      const t = it.t.toLowerCase(), s = it.s.toLowerCase(), k = it.k; let total = 0;
      for (const q of toks) {
        let sc = 0;
        if (t.startsWith(q)) sc = 3; else if (t.split(/[^a-z0-9]+/).some(w => w.startsWith(q))) sc = 2.2; else if (t.includes(q)) sc = 1.5; else if (s.includes(q) || k.includes(q)) sc = 1;
        if (!sc) return 0; total += sc;
      }
      return total;
    }
    function fdRender(q) {
      q = String(q || "").trim().toLowerCase(); const toks = q.split(/\s+/).filter(Boolean);
      let rows;
      if (!toks.length) rows = FD.items.filter(it => it.g === "Actions").slice(0, 6).concat(SU_SECS.map(([k, n]) => ({ g: "Settings", t: n, s: "Settings › " + n, run: () => suOpen(k) })));
      else {
        const scored = []; FD.items.forEach(it => { const sc = fdScore(it, toks); if (sc) scored.push([sc, it]); });
        scored.sort((a, b) => b[0] - a[0] || FD_ORDER.indexOf(a[1].g) - FD_ORDER.indexOf(b[1].g));
        const per = {}; rows = [];
        for (const [, it] of scored) { per[it.g] = (per[it.g] || 0) + 1; if (per[it.g] <= 7) rows.push(it); if (rows.length >= 28) break; }
        rows.sort((a, b) => FD_ORDER.indexOf(a.g) - FD_ORDER.indexOf(b.g));
      }
      FD.shown = rows; FD.sel = 0; const L = FD.list; L.innerHTML = "";
      if (!rows.length) { const p = document.createElement("p"); p.className = "su-note"; p.textContent = "Nothing matches “" + q + "”."; L.appendChild(p); return; }
      let g = "";
      rows.forEach((it, i) => {
        if (it.g !== g) { g = it.g; const h = document.createElement("div"); h.className = "find-g"; h.textContent = g; L.appendChild(h); }
        const b = document.createElement("button"); b.type = "button"; b.className = "find-it"; b.setAttribute("role", "option"); b.dataset.i = i;
        b.innerHTML = "<span></span><small></small>"; b.querySelector("span").textContent = it.t; b.querySelector("small").textContent = it.s;
        b.addEventListener("click", () => fdRun(it)); L.appendChild(b);
      });
      fdPaintSel();
    }
    function fdPaintSel() { FD.list.querySelectorAll(".find-it").forEach(b => { const on = +b.dataset.i === FD.sel; b.classList.toggle("sel", on); b.setAttribute("aria-selected", String(on)); if (on) { try { b.scrollIntoView({ block: "nearest" }); } catch (e) {} } }); }
    function fdOpen(q) {
      fdBuild(); FD.items = fdIndex(); FD.el.hidden = false; FD.input.value = q || ""; fdRender(FD.input.value);
      setTimeout(() => { try { FD.input.focus(); FD.input.select(); } catch (e) {} }, 30);
    }
    function fdClose() { if (FD.el) FD.el.hidden = true; }
    function fdRun(it) { fdClose(); add139("find", it.g + " · " + it.t); setTimeout(() => { try { it.run(); } catch (e) { noteMsg("Couldn't do that (" + (e && e.message || e) + ")", true); } }, 30); }
    findBtn.addEventListener("click", () => fdOpen());
    window.addEventListener("keydown", e => {
      const t = e.target, inField = t && t.closest && t.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); if (FD.el && !FD.el.hidden) fdClose(); else fdOpen(); return; }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !inField) { e.preventDefault(); e.stopImmediatePropagation(); fdOpen(); }
    }, true);
    // ---- the strip: the shell becomes the bar across the top, the current interface under it ----
    SH.prev = null; SH.msgT = 0; SH.tick = 0;
    shBuild = function () {   // (replaces stage 0's skeleton)
      if (SH.el) return SH.el;
      const el = document.createElement("div"); el.id = "shell"; el.hidden = true;
      el.innerHTML = `<div class="sh-strip"><div class="sh-spaces"><button type="button" class="sh-sp" data-sp="play">Play</button><button type="button" class="sh-sp" data-sp="build">Build</button><button type="button" class="sh-sp sh-set" data-sp="setup" title="Settings: sound, MIDI, gear, the app, help" aria-label="Settings"><span class="sh-gear" aria-hidden="true">⚙</span><span class="sh-setw">Settings</span></button></div>
        <div class="sh-mid" id="shMid"></div><div class="sh-msg" id="shMsg" hidden></div>
        <div class="sh-right"><span class="sh-dot" data-k="minilab">MiniLab</span><span class="sh-dot" data-k="ko2">K.O. II</span><span class="sh-dot" data-k="pixelbook">Pixelbook</span><span class="sh-out" id="shOut"></span><span class="sh-drops" id="shDrops" hidden></span><button type="button" class="btn" id="shLog">Log</button><button type="button" class="btn" id="shFind">Find</button></div></div>`;
      document.body.appendChild(el); SH.el = el;
      el.querySelectorAll(".sh-sp").forEach(b => b.addEventListener("click", () => shGo(b.dataset.sp)));
      $id("shLog").addEventListener("click", () => logTap("strip"));
      $id("shFind").addEventListener("click", () => fdOpen());
      return el;
    };
    function shSpaceNow() { return suOpenNow() ? "setup" : !lv.hidden ? "play" : "build"; }
    function shGo(sp) {
      start();
      if (sp === "play") { suClose(false); if (lv.hidden) lvOpen(); }
      else if (sp === "build") { suClose(false); if (!lv.hidden) lvClose(); }
      else suOpen();
      add139("strip", sp); shPaint();
    }
    SH.q = [];
    function shSay(text, urgent) {   // one at a time, 3.5 s each; a device or route change jumps the queue
      if (!text || SH.q.includes(text)) return; add139("strip", text);
      if (urgent) { SH.q.unshift(text); clearTimeout(SH.msgT); SH.msgT = 0; shNext(); return; }
      SH.q.push(text); if (!SH.msgT) shNext();
    }
    function shNext() {
      const m = $id("shMsg"), text = SH.q.shift();
      if (!m || !text) { SH.msgT = 0; if (m) m.hidden = true; return; }
      nbT(m, text); m.hidden = false; SH.msgT = setTimeout(shNext, 3500);
    }
    shPaint = function (doc) {
      if (!SH.el || SH.el.hidden) return; const d = doc || nbsGet(), t = d.transport || {}, r = d.rig || {}, h = d.health || {};
      const sp = shSpaceNow(); SH.el.querySelectorAll(".sh-sp").forEach(b => b.classList.toggle("on", b.dataset.sp === sp));
      const key = t.key && t.key.scale && t.key.scale !== "off" ? " · " + nbsTry(() => nnm(60 + ((t.key.root % 12) + 12) % 12).replace(/\d+$/, ""), "") + " " + t.key.scale : "";
      const on = Object.keys(t.playing || {}).filter(k => t.playing[k]); let pos = "";
      if (on.length) { const g = nbsTry(lkGrid, null); if (g && g.src && g.perf0 != null && g.sd) { const steps = Math.max(0, (performance.now() - g.perf0) / 1000 / g.sd); pos = " · " + (Math.floor(steps / 16) + 1) + ":" + (Math.floor((steps % 16) / 4) + 1); } }
      nbT($id("shMid"), (t.tempo == null ? "" : Math.round(t.tempo) + " bpm") + key + (on.length ? pos : " · stopped"));
      SH.el.querySelectorAll(".sh-dot").forEach(s => s.classList.toggle("on", !!r[s.dataset.k]));
      nbT($id("shOut"), "out: " + (r.out || "?"));
      const dr = $id("shDrops"); dr.hidden = !(h.dropouts > 0); if (!dr.hidden) nbT(dr, h.dropouts + (h.dropouts === 1 ? " drop" : " drops"));
      // what changed since the last look: say it
      const now = { out: r.out || "", minilab: !!r.minilab, ko2: !!r.ko2, pixelbook: !!r.pixelbook, ins: (r.midiIns || []).join("|"), notes: (h.notes || []).join("|") }, p = SH.prev; SH.prev = now;
      if (!p) return;
      if (now.out !== p.out && now.out) shSay("Sound now goes to " + now.out, true);
      if (now.minilab !== p.minilab) { const nm = ML.dev === "kl" ? "KeyLab" : "MiniLab"; shSay(now.minilab ? nm + " connected" : nm + " gone", true); }
      if (now.ko2 !== p.ko2) shSay(now.ko2 ? "K.O. II connected" : "K.O. II gone", true);
      if (now.pixelbook !== p.pixelbook) shSay(now.pixelbook ? "Pixelbook linked" : "Pixelbook gone", true);
      if (now.ins !== p.ins) { const a = p.ins ? p.ins.split("|") : [], b = now.ins ? now.ins.split("|") : []; const came = b.filter(x => !a.includes(x)), gone = a.filter(x => !b.includes(x)); if (came.length) shSay("MIDI: + " + came.join(", "), true); if (gone.length) shSay("MIDI: − " + gone.join(", "), true); }
      if (now.notes !== p.notes) { const a = p.notes ? p.notes.split("|") : [], fresh = (now.notes ? now.notes.split("|") : []).filter(x => !a.includes(x)); if (fresh.length) shSay(fresh[0]); }
    };
    { const ss = shellSet; shellSet = function (on) {
        const r = ss.apply(this, arguments);
        if (on && !SH.tick) SH.tick = setInterval(() => { if (!document.hidden) shPaint(); }, 500);
        if (!on && SH.tick) { clearInterval(SH.tick); SH.tick = 0; }
        if (!on) { SH.prev = null; SH.q.length = 0; clearTimeout(SH.msgT); SH.msgT = 0; }
        const b = $id("suShell"); if (b) nbT(b, "New shell: " + (on ? "On" : "Off"));
        return r; }; }
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ setup: { open: suOpenNow(), section: SU.sec }, shell: { on: SH.on, space: SH.on ? shSpaceNow() : null } }));
    window.__live20 = { SU, FD, suOpen, suClose, suShow, fdOpen, fdClose, fdIndex, fdRender, shGo, shPaint, shSay, suTone };
