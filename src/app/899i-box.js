//@site-only
  // ======================================================================
  // (box) The Nate Bloom Box: a Raspberry Pi 5 with the 5" Touch Display 2 (1280 × 720, landscape), a controller and a
  // USB headphone cable, started full screen by box/session.sh with ?box=1 (the ARM64 Linux app with --box, or the
  // browser kiosk). Play opens at start; the controller's keys play, so Play's on-screen keyboard stays away. A strip in
  // Play's top bar says how the box is (temperature, power, the sound output, Wi-Fi), and Box… holds what a box
  // without a desktop needs: text size, which way the screen turns, Wi-Fi, an app update, restart, reboot, shut down.
  // Nothing here opens or changes on its own: the strip only reads, every action is a tap (shut down is a hold).
  // Off the box (no ?box=1) none of this exists.
  // ======================================================================
  {
    const BX = window.__box = { on: false, st: null, t: 0, el: null, sheet: null, holdT: 0 };
    try { BX.on = new URLSearchParams(location.search).get("box") === "1"; } catch (e) {}
    if (BX.on) {
      document.documentElement.classList.add("nb-box");
      const api = window.NBBox || null, nat = window.NB_NATIVE || null;
      const $b = id => document.getElementById(id);
      const say = m => { const el = $b("uiToast"); if (!el) return; el.textContent = m; el.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { el.hidden = true; }, 3200); };
      const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
      // ---- the strip in Play's top bar ----
      function bxStrip() {
        const top = document.querySelector("#playView .pl-top"); if (!top) return null;
        let el = $b("bxStrip");
        if (!el) {
          el = document.createElement("div"); el.id = "bxStrip"; el.className = "bx-strip"; el.setAttribute("aria-live", "polite");
          const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn"; btn.id = "bxBtn"; btn.textContent = "Box…"; btn.title = "The box: text size, screen, Wi-Fi, update, restart, shut down";
          btn.addEventListener("click", () => bxOpen());
          const dj = document.createElement("button"); dj.type = "button"; dj.className = "btn"; dj.id = "bxDjBtn"; dj.textContent = "DJ"; dj.title = "The DJ: two decks, songs from a USB stick";
          dj.addEventListener("click", () => BX.dj());
          const gear = $b("plGear"); top.insertBefore(el, gear || null); top.insertBefore(dj, gear || null); top.insertBefore(btn, gear || null);
          // (the home screen: Keys, Listen, Stream, Media, Games; only on a box installed with it)
          if (window.NBBox && NBBox.apps) NBBox.apps().then(ap => {
            if (!ap || !ap.home || $b("bxHomeBtn")) return;
            const h = document.createElement("button"); h.type = "button"; h.className = "btn"; h.id = "bxHomeBtn"; h.textContent = "⌂ Home"; h.title = "The box's home screen: Keys, Listen, Stream, Media, Games";
            h.addEventListener("click", () => NBBox.go("home"));
            top.insertBefore(h, $b("bxDjBtn") || gear || null);
            // Jam along (box/apps/jam.js): music from the phone shown in the top bar while it plays, its level in a sheet
            if (!window.NBJam && !document.getElementById("nbJamJs")) {
              window.__nbAppMidi = true;
              const sc = document.createElement("script"); sc.id = "nbJamJs"; sc.src = "/box/jam.js";
              sc.onload = () => {
                window.NBJam && NBJam.mount({ bar: () => document.querySelector("#playView .pl-top"), before: () => $b("bxHomeBtn") });
                // the idle screen (box/apps/idle.js): clock and weather after a while untouched, only once switched on in the home screen's Settings
                const si = document.createElement("script"); si.src = "/box/idle.js"; document.head.appendChild(si);
              };
              document.head.appendChild(sc);
            }
          }).catch(() => {});
        }
        BX.el = el; return el;
      }
      function bxPaint() {
        const el = bxStrip(); if (!el) return;
        const s = BX.st, bits = [];
        if (!api) bits.push(`<span class="bx-chip">Box (browser)</span>`);
        if (s) {
          if (s.temp != null) bits.push(`<span class="bx-chip${s.temp >= 80 ? " bad" : s.temp >= 75 ? " warn" : ""}" title="Processor temperature">${Math.round(s.temp)}°C</span>`);
          if (s.undervolt) bits.push(`<span class="bx-chip bad" title="The power supply or battery can't keep up: sound may drop out">⚡ low power</span>`);
          else if (s.hot) bits.push(`<span class="bx-chip bad" title="The processor slowed down to cool off">slowed: hot</span>`);
          bits.push(s.output ? `<span class="bx-chip" title="Sound output">🎧 ${esc(s.output.replace(/\s*(Analog Stereo|Digital Stereo.*|Stereo)$/i, "").slice(0, 22))}</span>` : `<span class="bx-chip warn" title="No USB headphone cable or interface found">no headphones</span>`);
          if (s.wifi === "disabled") bits.push(`<span class="bx-chip" title="Wi-Fi is off">Wi-Fi off</span>`);
        }
        el.innerHTML = bits.join("");
      }
      async function bxPoll() {
        clearTimeout(BX.t);
        if (api && !document.hidden) { try { BX.st = await api.status(); } catch (e) {} }
        bxPaint();
        BX.t = setTimeout(bxPoll, 10000);
      }
      // ---- Box… ----
      async function bxRun(action, label) {
        if (!api) { say("Only on the box's own app"); return; }
        say(label + "…");
        const r = await api.run(action);
        if (!r || !r.ok) say(label + ": " + ((r && r.error) || "didn't work").slice(0, 80));
      }
      function bxOpen() {
        if (BX.sheet) { BX.sheet.hidden = false; bxSheetPaint(); return; }
        const el = document.createElement("div"); el.className = "bx-sheet"; el.id = "bxSheet"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Box");
        el.innerHTML = `<div class="bx-card">
            <div class="bx-head"><strong>Box</strong><span class="bx-sp"></span><button type="button" class="btn primary" id="bxClose">Done</button></div>
            <div class="bx-info" id="bxInfo"></div>
            <div class="bx-row"><span>Text size</span><button type="button" class="btn" data-a="scale-125">Small</button><button type="button" class="btn" data-a="scale-133">Medium</button><button type="button" class="btn" data-a="scale-150">Large</button></div>
            <div class="bx-row"><span>Screen</span><button type="button" class="btn" data-a="rotate-90">Turn one way</button><button type="button" class="btn" data-a="rotate-270">Turn the other</button></div>
            <div class="bx-row"><span>Wi-Fi</span><button type="button" class="btn" data-a="wifi-on">On</button><button type="button" class="btn" data-a="wifi-off">Off</button></div>
            <div class="bx-row"><span>App</span><button type="button" class="btn" id="bxUpd">Check for an update</button><button type="button" class="btn" data-a="restart-app">Restart</button></div>
            <div class="bx-row"><span>Power</span><button type="button" class="btn" data-a="reboot">Reboot</button><button type="button" class="btn bx-off" id="bxOff">Hold to shut down</button></div>
            <p class="bx-note">Text size and screen turning restart the app (a few seconds). Wi-Fi is only needed for updates and Link.</p>
          </div>`;
        document.body.appendChild(el); BX.sheet = el;
        el.addEventListener("click", e => { if (e.target === el) el.hidden = true; });
        $b("bxClose").addEventListener("click", () => { el.hidden = true; });
        const LABEL = { "scale-125": "Text size: small", "scale-133": "Text size: medium", "scale-150": "Text size: large", "rotate-90": "Turning the screen", "rotate-270": "Turning the screen", "wifi-on": "Wi-Fi on", "wifi-off": "Wi-Fi off", "restart-app": "Restarting", reboot: "Rebooting" };
        el.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => { const a = b.dataset.a; bxRun(a, LABEL[a] || a).then(() => { setTimeout(bxPoll, 1500); }); }));
        // shut down: a hold, so a stray tap mid-set can't end it
        const off = $b("bxOff");
        const cancel = () => { clearTimeout(BX.holdT); off.classList.remove("holding"); };
        off.addEventListener("pointerdown", () => { off.classList.add("holding"); BX.holdT = setTimeout(() => { off.classList.remove("holding"); bxRun("shutdown", "Shutting down"); }, 1200); });
        ["pointerup", "pointercancel", "pointerleave"].forEach(n => off.addEventListener(n, cancel));
        $b("bxUpd").addEventListener("click", async () => {
          if (!nat || !nat.shellLatest) { say("Updates come with the box's own app"); return; }
          say("Looking for an update…");
          const r = await nat.shellLatest().catch(e => ({ err: String(e) }));
          if (!r || r.err) { say("Couldn't check: " + ((r && r.err) || "no answer")); return; }
          if (!r.newer) { say("Up to date (" + r.current + ")"); return; }
          if (!r.hasDeb) { say(r.latest + " is out, but its package isn't ready yet"); return; }
          say("Installing " + r.latest + "… the app restarts by itself");
          const i = await nat.shellInstall().catch(e => ({ ok: false, error: String(e) }));
          if (!i || !i.ok) say("Update failed: " + ((i && i.error) || "").slice(0, 80));
        });
        bxSheetPaint();
      }
      function bxSheetPaint() {
        const s = BX.st || {}, v = nat && nat.version ? "app " + nat.version : "browser kiosk";
        const info = $b("bxInfo"); if (!info) return;
        info.textContent = [v, s.temp != null ? Math.round(s.temp) + "°C" : "", s.undervolt ? "power supply too weak" : "", s.output ? "sound to " + s.output : "no headphone output found", s.wifi ? "Wi-Fi " + (s.wifi === "enabled" ? "on" : s.wifi) : ""].filter(Boolean).join(" · ");
      }
      // ---- DJ on the box: one tap from Play (DJ in the top bar) and back (▶ Play in the DJ's top bar) ----
      function bxPlayBtnInDj() {
        const top = document.querySelector("#djView .dj-top"); if (!top || $b("bxPlayBtn")) return;
        const b = document.createElement("button"); b.type = "button"; b.className = "btn primary"; b.id = "bxPlayBtn"; b.textContent = "▶ Play"; b.title = "Back to Play";
        b.addEventListener("click", () => bxGoPlay());
        const done = $b("djDone"); if (done) done.after(b); else top.prepend(b);
      }
      function bxGoDj() {
        try { if (window.__live21) window.__live21.plClose(); } catch (e) {}
        try { window.__live27.bdGo("dj"); } catch (e) {}
        setTimeout(bxPlayBtnInDj, 50);
      }
      function bxGoPlay() {
        try { bxMusicClose(); } catch (e) {}
        const d = $b("djView"); if (d && !d.hidden) { const done = $b("djDone"); if (done) done.click(); }
        try { if (typeof shGo === "function") shGo("play"); else window.__live21.plOpen(); } catch (e) { try { window.__live21.plOpen(); } catch (er) {} }
      }
      BX.dj = bxGoDj; BX.play = bxGoPlay;
      // ---- songs from a USB stick: Load… on a deck opens this list instead of a file dialog (no desktop on the box).
      // The big knob walks the list and its click loads the song; Shift + click closes it. ----
      const M = BX.m = { open: false, songs: [], sticks: [], sel: 0, el: null, t: 0, bypass: false };
      const djFileEl = () => $b("djFile");
      document.addEventListener("click", e => {
        const f = djFileEl(); if (!f || e.target !== f || M.bypass || !api || !api.music) return;
        e.preventDefault(); e.stopImmediatePropagation(); bxMusicOpen();
      }, true);
      async function bxMusicScan() {
        let r = null; try { r = await api.music(); } catch (e) {}
        const songs = (r && r.songs) || [], key = songs.map(s => s.path).join("\n");
        if (key !== M.key) { M.key = key; M.songs = songs; M.sticks = (r && r.sticks) || []; M.sel = Math.min(M.sel, Math.max(0, songs.length - 1)); bxMusicPaint(); }
      }
      function bxMusicOpen() {
        if (!M.el) {
          const el = document.createElement("div"); el.className = "bx-sheet bx-music"; el.id = "bxMusic"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Songs on the USB stick");
          el.innerHTML = `<div class="bx-card">
              <div class="bx-head"><strong>Songs</strong><span class="bx-info" id="bxMusicInfo"></span><span class="bx-sp"></span>
                <button type="button" class="btn" id="bxMusicOther">Other file…</button><button type="button" class="btn primary" id="bxMusicClose">Close</button></div>
              <div class="bx-list" id="bxMusicList"></div>
              <p class="bx-note">Big knob: pick · click: load onto the deck · Shift + click: close. Songs are read from the stick; nothing is changed on it.</p>
            </div>`;
          document.body.appendChild(el); M.el = el;
          el.addEventListener("click", e => { if (e.target === el) bxMusicClose(); });
          $b("bxMusicClose").addEventListener("click", () => bxMusicClose());
          $b("bxMusicOther").addEventListener("click", () => { bxMusicClose(); const f = djFileEl(); if (!f) return; M.bypass = true; try { f.click(); } finally { M.bypass = false; } });
        }
        M.open = true; M.el.hidden = false; M.key = null; bxMusicPaint(); bxMusicScan();
        clearInterval(M.t); M.t = setInterval(() => { if (M.open) bxMusicScan(); }, 3000);   // (a stick plugged in while it's open shows up)
        try { ML.lay = null; } catch (e) {}
      }
      function bxMusicClose() {
        if (!M.open) return; M.open = false; clearInterval(M.t); if (M.el) M.el.hidden = true; try { ML.lay = null; } catch (e) {}
      }
      function bxMusicPaint() {
        if (!M.el) return;
        const list = $b("bxMusicList"), info = $b("bxMusicInfo");
        info.textContent = M.songs.length ? M.songs.length + " songs" + (M.sticks.length > 1 ? " on " + M.sticks.length + " sticks" : "") : "";
        if (!M.songs.length) { list.innerHTML = `<div class="bx-empty">${M.sticks.length ? "No songs on the stick (MP3, WAV, M4A, AAC, FLAC, OGG)." : "Plug in a USB stick with songs: it shows up here in a few seconds."}</div>`; return; }
        let last = null, html = "";
        M.songs.forEach((s, i) => {
          const fold = s.folder || "";
          if (fold !== last) { html += `<div class="bx-fold">${esc(fold || "On the stick")}</div>`; last = fold; }
          html += `<button type="button" class="bx-song${i === M.sel ? " sel" : ""}" data-i="${i}">${esc(s.name)}</button>`;
        });
        list.innerHTML = html;
        list.querySelectorAll(".bx-song").forEach(b => b.addEventListener("click", () => { M.sel = +b.dataset.i; bxMusicLoad(); }));
        bxMusicShowSel();
      }
      function bxMusicShowSel() {
        const list = $b("bxMusicList"); if (!list) return;
        list.querySelectorAll(".bx-song").forEach(b => b.classList.toggle("sel", +b.dataset.i === M.sel));
        const b = list.querySelector('.bx-song[data-i="' + M.sel + '"]'); if (b) b.scrollIntoView({ block: "nearest" });
      }
      function bxMusicMove(d) { if (!M.songs.length) return; M.sel = (M.sel + d + M.songs.length) % M.songs.length; bxMusicShowSel(); try { mlHud("Song", M.songs[M.sel].name, null); } catch (e) {} }
      async function bxMusicLoad() {
        const s = M.songs[M.sel], f = djFileEl(); if (!s || !f) return;
        bxMusicClose(); say("Opening " + s.name + "…");
        let buf = null; try { buf = await api.read(s.path); } catch (e) {}
        if (!buf) { say("Couldn't read " + s.name + " from the stick"); return; }
        const ext = (s.file.split(".").pop() || "").toLowerCase(), type = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", ogg: "audio/ogg", opus: "audio/ogg" }[ext] || "";
        try { const dt = new DataTransfer(); dt.items.add(new File([buf], s.file, { type })); f.files = dt.files; f.dispatchEvent(new Event("change", { bubbles: true })); }
        catch (e) { say("Couldn't open " + s.name); }
      }
      { const l0 = L.dj; L.dj = function () {
          const o = l0.apply(this, arguments);
          if (M.open) o.M = { turn: ["Pick a song", d => bxMusicMove(d)], click: ["Load it onto the deck", () => bxMusicLoad()], sturn: o.M && o.M.sturn, sclick: ["Close the song list", () => bxMusicClose()] };
          return o;
        }; }
      // ---- start: Play, as soon as the page has its parts ----
      const go = () => {
        // MIDI on at once: elsewhere it waits for the first tap (a browser asks permission), but the box may never be
        // touched, so the controller has to work from power-on; controllers plugged in later arrive by themselves
        try { if (!md.access) { md.opt.auto = true; connectMidi(); } } catch (e) {}
        try { if (typeof shGo === "function") shGo("play"); else if (window.__live21) window.__live21.plOpen(); } catch (e) { try { window.__live21.plOpen(); } catch (er) {} }
        bxStrip(); bxPoll();
        // the pads' sounds decoded now, not on their first hit (elsewhere the first hit of each sample is silent while
        // it loads; on the box that would be the first kick of a set). Spread out so start-up stays smooth.
        setTimeout(() => {
          const ids = [];
          try { for (let k = 0; k < 64; k++) { const P = bpPad(k); if (P && typeof P.src === "string" && rcEngine(P.src) === "smp" && !ids.includes(P.src)) ids.push(P.src); } } catch (e) {}
          ids.forEach((id, i) => setTimeout(() => { try { rcSampleBuf(id); } catch (e) {} }, i * 60));
          BX.warm = ids.length;
        }, 1500);
      };
      if (document.readyState === "complete") setTimeout(go, 600); else window.addEventListener("load", () => setTimeout(go, 600), { once: true });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) bxPoll(); });
    }
  }
//@end
