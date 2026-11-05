  // ======================================================================
  // 232: a hardware synth's chip in Playing shows what it's doing: a light for notes (blue when its own keys play,
  // amber when Nate Bloom sends it notes) and a meter for its sound coming into the computer. No meter: its sound
  // isn't coming in (direct monitoring on, or no input for it).
  // ======================================================================
  {
    const buf = new Float32Array(512);
    const lvl = an => { try { an.getFloatTimeDomainData(buf); let p = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; } return p; } catch (e) { return -1; } };
    function tick() {
      const row = document.getElementById("stkRow"); if (document.hidden || !row || row.offsetParent === null || !row.querySelector('.stk-chip[data-k^="hw"]')) return;
      const H = window.__hw, MS = window.__nbMidiSeen, now = performance.now();
      row.querySelectorAll(".stk-chip[data-k]").forEach(c => {
        const k = c.dataset.k; let X = null, re = null, an = null, sent = 0;
        if (k === "hw" && H) { re = H.isSynthIn ? null : null; an = H.an; sent = H.sentAt || 0; re = /minilogue|grind|crave|minifreak/i; try { const m = H.models.find(m => m.id === H.modelId()); if (m) re = m.re; } catch (e) {} }
        else if (k.startsWith("hwx:") && window.__hwx) { X = window.__hwx.get(k.slice(4)); if (!X) return; an = X.an || null; try { const m = H.models.find(m => m.id === X.id); if (m) re = m.re; } catch (e) {} sent = X.sentAt || 0; }
        else return;
        let box = c.querySelector(".hw-act");
        if (!box) { box = document.createElement("span"); box.className = "hw-act"; box.innerHTML = '<i class="hw-led" title="Notes"></i><b class="hw-mtr" title="Its sound coming in"><u></u></b>'; const m = c.querySelector(".sc-main span"); if (m) m.appendChild(box); else c.appendChild(box); }
        let own = 0; if (MS && re) for (const s in MS.by) if (re.test(s)) own = Math.max(own, MS.by[s]);
        const led = box.querySelector(".hw-led"); led.className = "hw-led" + (now - own < 250 ? " own" : now - sent < 250 ? " sent" : "");
        const mtr = box.querySelector(".hw-mtr"), v = an ? lvl(an) : -1;
        mtr.hidden = v < 0; if (v >= 0) mtr.firstChild.style.width = Math.min(100, Math.round(Math.sqrt(v) * 100)) + "%";
      });
    }
    setInterval(tick, 90);
  }
  // ======================================================================
  // 232: each sound's chip in Playing says what's set on it, in small badges: its keys (C2–D3), soft or hard notes
  // only, its level when it isn't at 0 dB, and for a hardware synth where its sound comes from (direct monitoring, no
  // input, its own sounds or Nate Bloom's).
  // ======================================================================
  {
    const nn = m => ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][m % 12] + (Math.floor(m / 12) - 1);
    const J = k => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch (e) { return {}; } };
    const tagOf = it => it.t === "syn" ? "e:" + it.id : it.t === "syn2" ? "e:" + it.id + "#" + it.ci : it.t === "lib" ? "l:" + it.id : it.t === "hwx" ? "hwx:" + it.id : it.t;
    function badges() {
      const row = document.getElementById("stkRow"); if (document.hidden || !row || row.offsetParent === null) return;
      let its = []; try { its = window.__stk.items(); } catch (e) { return; }
      const Z = J("nightbloom-zones"), V = J("nightbloom-velsplit");
      const chips = [...row.querySelectorAll(".stk-chip[data-k]")];
      its.forEach((it, i) => {
        const c = chips[i]; if (!c) return;
        const tag = tagOf(it), base = tag.replace(/#\d+$/, ""), B = [];
        const z = Z[tag] || Z[base]; if (z) B.push(nn(z[0]) + "–" + nn(z[1]));
        const v = V[tag] || V[base]; if (v) B.push(v[0] > 1 ? "hard only" : "soft only");
        try { const lr = window.__stk.lv(it); if (lr) { const g = lr.get(); if (g > 0.001 && Math.abs(g - 0.8) > 0.02) { const db = 20 * Math.log10(g / 0.8); B.push((db > 0 ? "+" : "−") + Math.abs(db).toFixed(Math.abs(db) < 10 ? 1 : 0) + " dB"); } } } catch (e) {}
        try { if (it.t === "hw" && window.__hw) { const H = window.__hw; if (H.direct) B.push("heard via interface"); else if (!H.ready()) B.push("no input"); } } catch (e) {}
        try { if (it.t === "hwx" && window.__hwx) { const X = window.__hwx.get(it.id); if (X && !X.cfg.dev) B.push("own outputs"); if (X && X.id === "mf" && window.__mfMode) B.push(window.__mfMode() === "nb" ? "plays Nate Bloom" : "own sounds"); } } catch (e) {}
        const txt = B.join(" · ");
        let b = c.querySelector(".sc-bdg");
        if (!txt) { if (b) b.remove(); return; }
        if (!b) { b = document.createElement("small"); b.className = "sc-bdg"; const sp = c.querySelector(".sc-main span"); if (!sp) return; sp.appendChild(b); }
        if (b.textContent !== txt) { b.textContent = txt; b.title = it.name + ": " + txt; }
      });
    }
    setInterval(badges, 600);
  }
