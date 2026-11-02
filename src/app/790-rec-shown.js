    // ======================================================================
    // 170: recording shows on every screen. In the shell the red banner of 220 sat under the strip (the strip is drawn
    // over it) and Build's ● kept reading ●, so nothing said a take was rolling, in Lite or the full app. Now the strip
    // carries a red REC chip with the time for whatever records (a take from ● or the DJ, Live's recorder, a Garage
    // take); a tap on it stops that one. The banner sits under the strip and the Build bar instead of under them, and
    // Build's ● turns red with the time.
    // ======================================================================
    {
      const RS = { kind: "", t0: 0 };
      const setT = (el, v) => { v = String(v); if (el && el.textContent !== v) el.textContent = v; };
      const setA = (el, k, v) => { v = String(v); if (el && el.getAttribute(k) !== v) el.setAttribute(k, v); };
      const press = id => { const b = document.getElementById(id); if (b && !b.disabled) b.click(); };
      const takeClock = () => { try { return fmtClock(Math.max(0, ctx.currentTime - take.startedAt)); } catch (e) { return ""; } };
      function recNow() {
        try { if (take.rec) return { kind: "take", label: "Rec", stop: () => press("takeBtn") }; } catch (e) {}
        try { const R = window.__live8 && window.__live8.RC8; if (R && R.on) return { kind: "live", label: "Rec", stop: () => window.__live8.recStop() }; } catch (e) {}
        try { const T = window.__gb && window.__gb.TP; if (T && T.on && T.rec) return { kind: "garage", label: "Garage", stop: () => press("gbRec") }; } catch (e) {}
        return null;
      }
      function chip() {
        let c = document.getElementById("shRec"); if (c) return c;
        const mid = document.getElementById("shMid"); if (!mid) return null;
        c = document.createElement("button"); c.type = "button"; c.id = "shRec"; c.className = "sh-rec"; c.hidden = true;
        c.innerHTML = '<i aria-hidden="true"></i><b>REC</b><span class="t">0:00</span>';
        c.addEventListener("click", () => { const r = recNow(); if (r) r.stop(); });
        mid.parentNode.insertBefore(c, mid);
        return c;
      }
      function recTick() {
        const r = recNow(), c = chip();
        if (!r) { RS.kind = ""; if (c) c.hidden = true; document.body.classList.remove("nb-rec"); }
        else {
          if (RS.kind !== r.kind) { RS.kind = r.kind; RS.t0 = performance.now(); }
          // the time from the recorder itself where it keeps one, else from when this saw it start
          let s = (performance.now() - RS.t0) / 1000;
          try { if (r.kind === "take" && ctx) s = ctx.currentTime - take.startedAt; else if (r.kind === "live" && ctx) s = ctx.currentTime - window.__live8.RC8.t0; } catch (e) {}
          const t = fmtClock(Math.max(0, s));
          if (c) { c.hidden = false; setT(c.querySelector("b"), r.label === "Rec" ? "REC" : "REC · " + r.label); setT(c.querySelector(".t"), t); setA(c, "aria-label", "Recording, " + t + " · tap to stop"); setA(c, "title", "Recording · tap to stop"); }
          document.body.classList.add("nb-rec");
        }
        const br = document.getElementById("bdRec");
        if (br) { const on = !!(r && r.kind === "take"); br.classList.toggle("on", on); setT(br, on ? "■ " + takeClock() : "●"); setA(br, "title", on ? "Recording · tap to stop" : "Record everything you hear"); }
      }
      setInterval(recTick, 250);
      window.__recShown = { recNow, recTick };
    }
