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
          const gear = $b("plGear"); top.insertBefore(el, gear || null); top.insertBefore(btn, gear || null);
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
      // ---- start: Play, as soon as the page has its parts ----
      const go = () => {
        try { if (typeof shGo === "function") shGo("play"); else if (window.__live21) window.__live21.plOpen(); } catch (e) { try { window.__live21.plOpen(); } catch (er) {} }
        bxStrip(); bxPoll();
      };
      if (document.readyState === "complete") setTimeout(go, 600); else window.addEventListener("load", () => setTimeout(go, 600), { once: true });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) bxPoll(); });
    }
  }
//@end
