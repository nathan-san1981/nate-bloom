  // ======================================================================
  // 232: "Why no sound?" A tap in the status strip checks, in order, everything that can keep a sound you play from
  // being heard, and says it in words with a one-tap fix where there is one: the audio not running, the master at 0,
  // a sound in Playing at level 0 or muted, its keys split away from what you're playing, a velocity switch, the
  // controller it listens to, notes not arriving at all, a hardware synth heard only through the interface, the
  // MicroFreak on USB only. Each finding is also put in the Log, so a report shows it.
  // ======================================================================
  {
    const MA = { last: 0, n: 0, src: "", notes: [], by: {} };
    window.__nbMidiSeen = MA;   // the MIDI that came in: when, from what, which notes
    { const om = onMidi; onMidi = function (e) {
        try { const d = e && e.data; if (d && (d[0] & 0xf0) === 0x90 && d[2] > 0) { MA.last = performance.now(); MA.n++; MA.src = (e.target && e.target.name) || ""; MA.by[MA.src] = performance.now(); MA.notes.push(d[1]); if (MA.notes.length > 24) MA.notes.shift(); } } catch (er) {}
        return om.apply(this, arguments);
      }; }
    const nn = m => ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][m % 12] + (Math.floor(m / 12) - 1);
    const tagOfItem = it => it.t === "syn" ? "e:" + it.id : it.t === "syn2" ? "e:" + it.id + "#" + it.ci : it.t === "lib" ? "l:" + it.id : it.t === "hwx" ? "hwx:" + it.id : it.t;
    const J = k => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch (e) { return {}; } };
    function findings() {
      const F = [], add = (sev, text, fix, fixLabel) => F.push({ sev, text, fix, fixLabel });
      // the audio itself
      if (!ctx) add(3, "The sound hasn't started yet.", () => { try { start(); } catch (e) {} }, "Start the sound");
      else if (ctx.state !== "running") add(3, "The audio is " + ctx.state + " (the browser or Linux paused it).", () => { try { ctx.resume(); } catch (e) {} }, "Resume");
      try { if (!(state.fx.volume > 0.02)) add(3, "The master volume is at 0.", () => { state.fx.volume = 0.7; applyFx(); save(); }, "Master to 70%"); } catch (e) {}
      let its = []; try { its = window.__stk.items(); } catch (e) {}
      if (!its.length) add(3, "Nothing is in Playing: the keys have no sound to play.", null);
      const Z = J("nightbloom-zones"), V = J("nightbloom-velsplit"), recent = MA.notes.slice(-8);
      its.forEach(it => {
        const tag = tagOfItem(it), base = tag.replace(/#\d+$/, "");
        try { const lr = window.__stk.lv(it); if (lr && !(lr.get() > 0.001)) add(2, it.name + "'s level is at 0.", () => { lr.set(0.8); try { lvApply(); save(); } catch (e) {} try { window.__stk.paint(); } catch (e) {} }, "Back to 0 dB"); } catch (e) {}
        try { if (window.__stk.muted(it)) add(2, it.name + " is muted (the speaker on its chip).", () => window.__stk.setMute(it, false), "Unmute"); } catch (e) {}
        const z = Z[tag] || Z[base];
        if (z) { const out = recent.filter(m => m < z[0] || m > z[1]); add(out.length ? 2 : 1, it.name + " plays only " + nn(z[0]) + "–" + nn(z[1]) + (out.length ? "; the notes you just played (" + [...new Set(out)].map(nn).slice(0, 4).join(", ") + ") are outside it." : "."), () => { try { window.__kz.clear(); } catch (e) {} }, "Clear the split"); }
        const v = V[tag] || V[base];
        if (v) add(1, it.name + " plays only " + (v[0] > 1 ? "hard" : "soft") + " notes (velocity " + v[0] + "–" + v[1] + ").", () => { try { window.__kz.clear(); } catch (e) {} }, "Clear the split");
        try { const L = window.__nbCtl.get(window.__nbCtl.keyOf(it)); if (L && L.length) add(1, it.name + " listens only to " + L.map(k => k.replace(/^in:/, "").split("|")[0]).join(" + ") + " (its 🎹 button).", () => { window.__nbCtl.set(window.__nbCtl.keyOf(it), []); }, "Any keys"); } catch (e) {}
        // hardware: where its sound really comes from
        if (it.t === "hw" && window.__hw) { const H = window.__hw;
          if (!H.present()) add(2, H.name + " isn't plugged in over USB (no MIDI to it).", null);
          else if (H.direct) add(0, H.name + "'s sound comes back through the interface's own direct monitoring, not through Nate Bloom: its level, mute and effects here only change recordings.", null);
          else if (!H.ready()) add(2, H.name + "'s audio input isn't open" + (H.err ? " (" + H.err + ")" : "") + ".", () => { try { H.recheck(); } catch (e) {} }, "Try again"); }
        if (it.t === "hwx" && window.__hwx) { const X = window.__hwx.get(it.id);
          if (X && !X.present()) add(2, X.name + " isn't plugged in over USB.", null);
          else if (X && !X.cfg.dev) add(0, X.name + "'s sound only comes from its own outputs (its USB is MIDI only): Nate Bloom plays it but doesn't hear it.", null); }
      });
      // the MicroFreak set to its own sounds plays nothing in Nate Bloom
      try { const X = window.__hwx && window.__hwx.get("mf"); if (X && X.present() && window.__mfMode && window.__mfMode() === "own" && /micro\s*freak/i.test(MA.src) && performance.now() - MA.last < 15000) add(1, "You're playing the MicroFreak's keys, and it's set to its own sounds: Nate Bloom ignores its notes, and its USB carries no sound.", () => { try { X.open(); } catch (e) {} }, "Its settings"); } catch (e) {}
      // (237) dropping out: other programs, and the bigger buffer in one tap (it needs a restart to take effect)
      try { const C = window.__nbCpu, d10 = C ? C.drops.slice(-10).reduce((a, b) => a + b, 0) : 0, L = C && C.last;
        if (L && !L.warming && L.computer >= 60) { const ours = (L.app || 0) / Math.max(1, L.cores); if (L.computer - ours >= 45) add(2, "Other programs are using " + Math.round(L.computer - ours) + "% of the computer" + ((L.others || []).length ? ": " + L.others.map(o => o.name + " " + o.pct + "% of a core").join(", ") : "") + ". That can make the sound drop out; close or pause them.", null); }
        if (d10 && localStorage.getItem("nightbloom-buffer") !== "steady") add(2, "The sound dropped out " + d10 + " times in the last 10 s. Steady gives it twice the slack (about 10 ms more delay).", () => {
          try { localStorage.setItem("nightbloom-buffer", "steady"); } catch (e) {}
          const LL = window.NB_NATIVE && NB_NATIVE.lowLatency; try { window.__nbAdd && window.__nbAdd("setup", "sound buffer → steady from No sound?"); } catch (e) {}
          if (LL && LL.set) { try { LL.set(false); } catch (e) {} setTimeout(() => { try { LL.restart(); } catch (e) { location.reload(); } }, 300); } else setTimeout(() => location.reload(), 300);
        }, "Steady and restart"); } catch (e) {}
      // notes: arriving or not
      let ins = 0; try { ins = md.access ? [...md.access.inputs.values()].filter(i => md.ins.has(i.id)).length : 0; } catch (e) {}
      if (MA.n === 0) add(1, ins ? "No notes have come in from a controller yet (the on-screen keys and the computer keyboard still play)." : "No MIDI controller is connected (MIDI › Connect).", null);
      else if (performance.now() - MA.last > 60000) add(0, "The last note from a controller came " + Math.round((performance.now() - MA.last) / 1000) + " s ago" + (MA.src ? ", from " + MA.src : "") + ".", null);
      return F.sort((a, b) => b.sev - a.sev);
    }
    const sh = document.createElement("div"); sh.className = "editor sheet"; sh.id = "wsSheet"; sh.hidden = true;
    sh.innerHTML = `<div class="ed-card" role="dialog" aria-label="Why no sound?"><div class="ed-head"><strong>Why no sound?</strong><span class="ed-info">what could keep you from hearing it</span></div>
      <div id="wsList" class="ws-list"></div><div class="ed-foot sheet-foot"><button class="btn big" id="wsAgain">Check again</button><button class="btn big primary" id="wsDone">Done</button></div></div>`;
    document.body.appendChild(sh);
    function paint() {
      const L = sh.querySelector("#wsList"); L.innerHTML = "";
      const F = findings();
      if (!F.length) { const p = document.createElement("p"); p.className = "ws-ok"; p.textContent = "Nothing found that would keep you from hearing it: every sound in Playing is up, unmuted and on every key, and the audio is running. If it's still silent, check the output (MIDI › Sound out) and the interface's own volume."; L.appendChild(p); }
      F.forEach(f => {
        const r = document.createElement("div"); r.className = "ws-row s" + f.sev;
        const t = document.createElement("span"); t.textContent = f.text; r.appendChild(t);
        if (f.fix) { const b = document.createElement("button"); b.className = "btn"; b.textContent = f.fixLabel; b.addEventListener("click", () => { try { f.fix(); } catch (e) {} setTimeout(paint, 250); }); r.appendChild(b); }
        L.appendChild(r);
      });
      try { window.__nbAdd && window.__nbAdd("why", F.length ? F.map(f => f.text).join(" | ") : "nothing found"); } catch (e) {}
    }
    sh.querySelector("#wsAgain").addEventListener("click", paint);
    sh.querySelector("#wsDone").addEventListener("click", () => { sh.hidden = true; });
    sh.addEventListener("click", e => { if (e.target === sh) sh.hidden = true; });
    window.__whySilent = { open() { sh.hidden = false; paint(); }, findings };
    const addBtn = () => { const lg = document.getElementById("shLog"); if (!lg || document.getElementById("shWhy")) return;
      const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.id = "shWhy"; b.textContent = "No sound?"; b.title = "Check what could keep you from hearing a sound"; b.addEventListener("click", () => window.__whySilent.open()); lg.before(b); };
    addBtn(); setInterval(addBtn, 1500);   // (the strip is built after this, and can be rebuilt)
  }
