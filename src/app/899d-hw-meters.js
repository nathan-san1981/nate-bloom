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
