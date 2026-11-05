  // ======================================================================
  // 240: playing samples live with the hardware's own controls. On the Samples screen:
  //   · Pitch bend (the KeyLab's bend wheel, the Minilogue XD's joystick left and right, the bend strip on screen) bends
  //     the sample's pitch, ±12 semitones by default (its own range, apart from the synths' ±2).
  //   · The mod wheel (the KeyLab's, the XD joystick pushed up, the strip on screen) speeds the sample up, to 4×;
  //     the XD joystick pulled down slows it, to a stop in Grain. The synths keep the mod wheel as vibrato.
  //   · The octave buttons (the KeyLab's Oct −/+, ↓ ↑ on screen) move the keys, and the sample's pitch with them.
  //   · Speed on screen sets where it sits when the wheels are at rest: ¼× to 4×.
  // Tape: speed and pitch move together, as a record does. Keep pitch: speed alone (the sample plays through grains).
  // In Grain the speed is the scan through the file, so it never changes the pitch. A line under the controls says
  // what each control is doing as it moves, and which controller moved it.
  // ======================================================================
  {
    const SPK = "nightbloom-sampplay";
    const SP = window.__sp = { ui: 1, keep: false, role: "speed", bend: 12, cc: { up: 1, down: 2 }, slow: 0, joyUp: 0, who: "", whoAt: 0 };
    try { const o = JSON.parse(localStorage.getItem(SPK) || "{}"); if (o.ui > 0) SP.ui = o.ui; SP.keep = !!o.keep; if (["speed", "vibrato"].includes(o.role)) SP.role = o.role; if ([2, 7, 12, 24].includes(o.bend)) SP.bend = o.bend; if (o.cc && o.cc.up >= 0 && o.cc.down >= 0) SP.cc = o.cc; } catch (e) {}
    const spSave = () => { try { localStorage.setItem(SPK, JSON.stringify({ ui: SP.ui, keep: SP.keep, role: SP.role, bend: SP.bend, cc: SP.cc })); } catch (e) {} };
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    // the speed: the screen's setting × the mod wheel (up to 4×) × the joystick pulled down (to 0)
    const modNow = () => SP.role === "speed" ? Math.max(pm.mod, SP.joyUp) : SP.joyUp;
    sampSpeed = () => SP.ui * (1 + 3 * modNow()) * (1 - SP.slow);
    sampKeep = () => SP.keep;
    sampBendOnly = () => SP.role !== "vibrato";
    sampBendSt = SP.bend;
    const isXD = p => /minilogue|prologue/i.test((p && p.name) || "");
    const shortName = p => { const n = (p && p.name) || ""; return isXD(p) ? "XD joystick" : /KL\b|keylab/i.test(n) ? "KeyLab" : /micro\s*freak/i.test(n) ? "MicroFreak" : n.replace(/\s*MIDI.*$/i, "") || "controller"; };
    let lastK = 1;
    function spApply(who) {
      if (who) { SP.who = who; SP.whoAt = performance.now(); }
      const k = sampSpeed(); if (Math.abs(k - lastK) > 0.002) { lastK = k; try { sampSpeedApply(); } catch (e) {} }
      paintLive();
    }
    { const ap = applyPitch; applyPitch = function () { const r = ap.apply(this, arguments); try { spApply(); } catch (e) {} return r; }; }
    // the controllers: the XD's joystick always (its keys play the XD itself, so its port plays nothing here), the
    // joystick's pull-down on any controller, and a learned pair if the XD sends other numbers
    let learn = null;   // { step: "up" | "down", seen: Map(cc → max value) }
    { const om = onMidi; onMidi = function (e) {
        const p = e && e.target, d = (e && e.data) || []; const cmd = d[0] & 0xf0;
        if (learn && isXD(p) && cmd === 0xb0) { learnSee(d[1], d[2]); return; }
        if (cmd === 0xb0 && d[1] === SP.cc.down) { SP.slow = d[2] / 127; spApply(shortName(p) + (isXD(p) ? " ↓" : "")); return; }
        if (isXD(p)) {
          if (cmd === 0xe0) { pm.bend = clamp(((d[2] << 7) | d[1]) / 8192 - 1, -1, 1); try { WHEEL_DRAW.bend && WHEEL_DRAW.bend(); } catch (er) {} SP.who = "XD joystick ←→"; SP.whoAt = performance.now(); applyPitch(); return; }
          if (cmd === 0xb0 && d[1] === SP.cc.up) { SP.joyUp = d[2] / 127; spApply("XD joystick ↑"); return; }
        } else if (cmd === 0xe0 || (cmd === 0xb0 && d[1] === 1)) { SP.who = shortName(p) + (cmd === 0xe0 ? " bend" : " mod wheel"); SP.whoAt = performance.now(); }
        return om.apply(this, arguments);
      }; }
    function learnSee(cc, v) {
      const m = learn.seen.get(cc) || 0; learn.seen.set(cc, Math.max(m, v));
      const best = [...learn.seen].filter(([c]) => learn.step === "down" ? c !== learn.up : true).sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 90) {
        if (learn.step === "up") { learn.up = best[0]; learn.step = "down"; learn.seen = new Map(); paint(); }
        else { SP.cc = { up: learn.up, down: best[0] }; spSave(); learn = null; paint(); toast("XD joystick set: up is CC " + SP.cc.up + ", down is CC " + SP.cc.down); }
      }
    }
    const toast = m => { const el = document.getElementById("uiToast"); if (!el) return; el.textContent = m; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3200); };
    // ---- the controls, under the sampler's Tempo and Length rows ----
    const row = document.createElement("div"); row.className = "sp-box"; row.id = "spBox"; row.hidden = true;
    row.innerHTML = `<div class="sp-row">
        <span class="lab2">Play it live</span>
        <span class="sp-grp"><span class="lab2">Speed</span><button class="btn sp-step" data-d="-1" title="Slower ([ key)" aria-label="Slower">−</button>
          <input type="range" id="spSpeed" min="-200" max="200" step="1" value="0" aria-label="Speed: a quarter to four times, at rest">
          <button class="btn sp-step" data-d="1" title="Faster (] key)" aria-label="Faster">+</button><b class="sp-v" id="spSpeedV">1.00×</b>
          <button class="btn" id="spOne" title="Back to normal speed (\\ key)">1×</button></span>
        <span class="seg sp-seg" role="group" aria-label="What speed changes"><button type="button" data-keep="0" title="Speed and pitch move together, like a record">Tape</button><button type="button" data-keep="1" title="Speed alone: the pitch stays where the keys put it (the sample plays through grains)">Keep pitch</button></span>
      </div>
      <div class="sp-row">
        <span class="sp-grp"><span class="lab2">Bend</span><span class="seg sp-seg" role="group" aria-label="Bend range for samples" id="spBend"></span></span>
        <span class="sp-grp"><span class="lab2">Mod wheel</span><span class="seg sp-seg" role="group" aria-label="What the mod wheel does to samples" id="spRole"></span></span>
        <span class="sp-grp"><span class="lab2">XD joystick</span><button class="btn" id="spLearn" title="If pushing the XD's joystick up or down does nothing, set it here: push it up, then pull it down">Set up…</button></span>
      </div>
      <div class="sp-live" id="spLive" aria-live="polite"></div>
      <div class="sp-help" id="spHelp"></div>`;
    const anchor = document.getElementById("sfit");
    if (anchor && anchor.parentNode) anchor.after(row); else (document.querySelector(".app") || document.body).appendChild(row);
    const $s = id => row.querySelector("#" + id);
    const toPos = k => Math.round(Math.log2(k) * 100), toK = v => Math.pow(2, v / 100);
    function setUi(k, who) { SP.ui = clamp(Math.round(k * 100) / 100, 0.25, 4); spSave(); spApply(who || "screen"); paint(); }
    $s("spSpeed").addEventListener("input", e => { const k = toK(+e.target.value); setUi(Math.abs(Math.log2(k)) < 0.04 ? 1 : k); });   // (snaps to 1× near the middle)
    row.querySelectorAll(".sp-step").forEach(b => b.addEventListener("click", () => setUi(SP.ui * Math.pow(2, +b.dataset.d / 12))));   // (a semitone's worth each tap)
    $s("spOne").addEventListener("click", () => setUi(1));
    row.querySelectorAll("[data-keep]").forEach(b => b.addEventListener("click", () => { SP.keep = b.dataset.keep === "1"; spSave(); paint(); toast(SP.keep ? "Keep pitch: speed alone. Notes already sounding keep their old way; new ones use it." : "Tape: speed and pitch move together"); }));
    $s("spLearn").addEventListener("click", () => { learn = learn ? null : { step: "up", seen: new Map() }; paint(); });
    // keys: [ and ] for slower and faster, \ for 1× (on the Samples screen, not while typing)
    document.addEventListener("keydown", e => {
      if (row.hidden || e.ctrlKey || e.metaKey || e.altKey) return; const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "[") { setUi(SP.ui / Math.pow(2, 1 / 12), "[ key"); e.preventDefault(); } else if (e.key === "]") { setUi(SP.ui * Math.pow(2, 1 / 12), "] key"); e.preventDefault(); } else if (e.key === "\\") { setUi(1, "\\ key"); e.preventDefault(); }
    });
    function seg(box, opts, cur, fn) { box.innerHTML = ""; opts.forEach(([v, t, tip]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; if (tip) b.title = tip; b.setAttribute("aria-pressed", String(v === cur)); b.addEventListener("click", () => fn(v)); box.appendChild(b); }); }
    function paint() {
      $s("spSpeed").value = String(toPos(SP.ui)); $s("spSpeedV").textContent = SP.ui.toFixed(2) + "×";
      row.querySelectorAll("[data-keep]").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.keep === "1") === SP.keep)));
      seg($s("spBend"), [[2, "±2"], [7, "±7"], [12, "±12"], [24, "±24"]], SP.bend, v => { SP.bend = v; sampBendSt = v; spSave(); applyPitch(); paint(); paintWheels(); });
      seg($s("spRole"), [["speed", "Faster", "The mod wheel speeds samples up (the synths keep it as vibrato)"], ["vibrato", "Vibrato", "The mod wheel adds vibrato to samples too"]], SP.role, v => { SP.role = v; spSave(); spApply(); paint(); paintWheels(); });
      const lb = $s("spLearn"); lb.textContent = learn ? (learn.step === "up" ? "Push the joystick up…" : "…now pull it down") : "Set up…"; lb.classList.toggle("on", !!learn);
      const mode = (() => { try { return state.samp.slots[state.samp.slot].mode; } catch (e) { return "play"; } })();
      $s("spHelp").innerHTML = (mode === "grain" ? "<b>Grain:</b> speed is how fast it moves through the sample, so the pitch never changes; pull the XD joystick all the way down to freeze it. " : mode === "slice" ? "<b>Slice:</b> speed and bend change each slice like a record. " : mode === "elephant" ? "<b>Elephant:</b> bend moves its pitch; speed doesn't apply. " : "")
        + "<b>KeyLab:</b> bend wheel → pitch · mod wheel → faster · Oct −/+ → octave. <b>Minilogue XD:</b> joystick ←→ pitch · ↑ faster · ↓ slower. <b>Keys:</b> [ ] slower/faster · \\ normal · ↓ ↑ octave.";
      paintLive();
    }
    function paintLive() {
      if (row.hidden) return;
      const el = $s("spLive"), k = sampSpeed(), st = pm.bend * SP.bend, oct = (() => { try { return state.octave || 0; } catch (e) { return 0; } })();
      const parts = [];
      parts.push("<span class='sp-chip" + (Math.abs(k - 1) > 0.005 ? " on" : "") + "'>Speed " + (k < 0.01 ? "stopped" : k.toFixed(2) + "×") + "</span>");
      parts.push("<span class='sp-chip" + (Math.abs(st) > 0.05 ? " on" : "") + "'>Bend " + (st >= 0 ? "+" : "−") + Math.abs(st).toFixed(1) + " st</span>");
      parts.push("<span class='sp-chip" + (oct ? " on" : "") + "'>Octave " + (oct > 0 ? "+" : oct < 0 ? "−" : "") + Math.abs(oct) + "</span>");
      if (SP.who && performance.now() - SP.whoAt < 2500) parts.push("<small>moved by " + SP.who.replace(/[<>&]/g, "") + "</small>");
      const html = parts.join(""); if (el.innerHTML !== html) el.innerHTML = html;
    }
    // the strip on screen says what the mod wheel does here, and the bend button shows the sampler's range
    function paintWheels() {
      const samp = (() => { try { return state.engine === "samp"; } catch (e) { return false; } })();
      const mw = document.getElementById("modWheel"), lab = mw && mw.querySelector(".wlab");
      if (lab) { const t = samp && SP.role === "speed" ? "Faster" : "Vib"; if (lab.textContent !== t) { lab.textContent = t; mw.setAttribute("aria-label", t === "Faster" ? "Speed up the sample" : "Vibrato"); } }
      const br = document.getElementById("bendRange"); if (br) { const t = "±" + (samp ? SP.bend : pm.range); if (br.textContent !== t) br.textContent = t; br.title = samp ? "Bend range for samples (set under Play it live)" : "Bend range in semitones"; }
    }
    { const br = document.getElementById("bendRange"); if (br) br.addEventListener("click", e => { let samp = false; try { samp = state.engine === "samp"; } catch (er) {} if (!samp) return; e.stopImmediatePropagation(); e.preventDefault(); const L = [2, 7, 12, 24]; SP.bend = L[(L.indexOf(SP.bend) + 1) % L.length]; sampBendSt = SP.bend; spSave(); applyPitch(); paint(); paintWheels(); }, true); }
    setInterval(() => {
      let samp = false; try { samp = state.engine === "samp" && !!document.getElementById("slots") && document.getElementById("slots").offsetParent !== null; } catch (e) {}
      if (row.hidden === samp) { row.hidden = !samp; if (samp) paint(); }
      paintWheels(); if (samp) paintLive();
    }, 250);
    try { window.__nbAdd && window.__nbAdd("sampplay", "speed " + SP.ui + "× · " + (SP.keep ? "keep pitch" : "tape") + " · bend ±" + SP.bend + " · mod " + SP.role); } catch (e) {}
  }
