    // ---------- Tracks: the song's timeline ----------
    const ZOOM = [10, 14, 20, 28, 40, 56, 80];
    const PXB = () => ZOOM[clamp(S.zoom | 0, 0, ZOOM.length - 1)];
    const HEADW = () => isPhone() ? 104 : 176, ROWH = () => isPhone() ? 62 : 70;
    const snapU = () => { if (S && S.free) return 1 / 96; const P = PXB(); return P >= 40 ? 0.25 : P >= 20 ? 1 : S.sig; };
    const totalBeats = () => Math.max(S.bars * S.sig, Math.ceil(songEndBeat() / S.sig) * S.sig) + S.sig * 2;
    function findRegion(id) { if (!id || !S) return null; for (const tr of S.tracks) { const r = tr.regions.find(x => x.id === id); if (r) return { tr, r }; } return null; }
    const PEAKS = new Map();
    function peaksOf(key) {
      if (PEAKS.has(key)) return PEAKS.get(key);
      const b = ABUF.get(key); if (!b) return null;
      const d = b.getChannelData(0), step = 256, n = Math.ceil(d.length / step), pk = new Float32Array(n);
      for (let i = 0; i < n; i++) { let m = 0; const e = Math.min(d.length, (i + 1) * step); for (let j = i * step; j < e; j++) { const v = d[j] < 0 ? -d[j] : d[j]; if (v > m) m = v; } pk[i] = m; }
      const o = { pk, rate: b.sampleRate / step }; PEAKS.set(key, o); return o;
    }
    function drawPreview(cv, tr, r, w, h) {
      const dpr = Math.min(2, devicePixelRatio || 1), cw = Math.min(w, 2400);
      cv.width = Math.max(1, Math.round(cw * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
      const g = cv.getContext("2d"); g.scale(dpr * cw / w, dpr); g.fillStyle = "#0b0f0c99";
      const reps = r.rep || 1, tot = r.len * reps;
      if (r.key) {
        const P = peaksOf(r.key); if (!P) return;
        const secPerBeat = spb(), mid = h / 2;
        for (let k = 0; k < reps; k++) for (let x = 0; x < (r.len / tot) * w; x += 2) {
          const sec = (r.off || 0) + (x / w) * tot * secPerBeat, i = Math.floor(sec * P.rate); if (i >= P.pk.length) break;
          const a = Math.min(1, P.pk[i] * 1.6 * clipEnvAt(r, r.len * secPerBeat, (x / w) * tot * secPerBeat)) * (h / 2 - 1); g.fillRect(x + (k * r.len / tot) * w, mid - a, 1.6, a * 2 || 1);
        }
        return;
      }
      const ns = r.notes || []; if (!ns.length) return;
      let lo = Math.min(...ns.map(n => n[1])), hi = Math.max(...ns.map(n => n[1]));
      if (hi - lo < 12) { const c = (hi + lo) / 2; lo = c - 6; hi = c + 6; }
      const rh = Math.max(1.5, h / (hi - lo + 1));
      for (let k = 0; k < reps; k++) ns.forEach(n => {
        const x = ((k * r.len + n[0]) / tot) * w, ww = Math.max(2, (n[2] / tot) * w), y = (hi - n[1]) / (hi - lo + 1) * h;
        g.globalAlpha = k ? 0.5 : 1; g.fillRect(x, y, ww, Math.min(rh, 4));
      });
    }
    function renderTracks(scrollToPh) {
      const tl = $("gbTl"), inn = $("gbTlin"); if (!S) return;
      const sx = tl.scrollLeft, sy = tl.scrollTop, P = PXB(), HW = HEADW(), RH = ROWH(), NB = totalBeats(), W = NB * P;
      inn.replaceChildren(); inn.style.width = (HW + W) + "px";
      // the ruler: bar numbers, the cycle, tap to move the playhead
      const rr = gbEl("div", "gb-rulerow"), cn = gbEl("div", "gb-corner", "Bar"), ru = gbEl("div", "gb-ruler");
      cn.style.width = HW + "px"; ru.style.width = W + "px";
      const every = P * S.sig < 18 ? 4 : P * S.sig < 34 ? 2 : 1;
      for (let bar = 0; bar * S.sig < NB; bar++) if (bar % every === 0) { const sp = gbEl("span", "", String(bar + 1)); sp.style.left = bar * S.sig * P + "px"; ru.append(sp); }
      if (S.cyc.on) ru.append(cycleEl(P));
      const pm = gbEl("div", "gb-phm"); pm.id = "gbPhm"; ru.append(pm);
      ru.addEventListener("pointerdown", e => {
        if (e.target.closest(".gb-cycbar")) return;
        const seek = ev => { const x = ev.clientX - ru.getBoundingClientRect().left; gbSeek(Math.max(0, Math.round(x / P / snapU()) * snapU())); };
        seek(e); try { ru.setPointerCapture(e.pointerId); } catch (x) {}
        const mv = ev => { if (!TP.on) seek(ev); }, up = () => { ru.removeEventListener("pointermove", mv); ru.removeEventListener("pointerup", up); ru.removeEventListener("pointercancel", up); };
        ru.addEventListener("pointermove", mv); ru.addEventListener("pointerup", up); ru.addEventListener("pointercancel", up);
      });
      rr.append(cn, ru); inn.append(rr);
      const grid = "repeating-linear-gradient(90deg, #36314a 0 1px, transparent 1px " + (P * S.sig) + "px), repeating-linear-gradient(90deg, #1f1c2b 0 1px, transparent 1px " + P + "px)";
      S.tracks.forEach((tr, i) => {
        const row = gbEl("div", "gb-row"); row.style.height = RH + "px"; row.dataset.i = i;
        const hd = gbEl("div", "gb-head" + (i === S.sel ? " sel" : "")); hd.style.width = HW + "px"; hd.style.setProperty("--kc", KIND[tr.kind].kc);
        const ic = gbEl("i"); ic.innerHTML = ICON[tr.kind]; ic.title = "Play " + tr.name; hd.append(ic);
        const hn = gbEl("div", "hn"); hn.append(gbEl("b", "", tr.name), gbEl("small", "", tr.kind === "audio" ? "audio" : soundName(tr.snd))); hd.append(hn);
        const ms = gbEl("div", "ms"), mB = gbEl("button", "m", "M"), sB = gbEl("button", "s", "S");
        mB.setAttribute("aria-pressed", String(!!tr.mute)); mB.setAttribute("aria-label", "Mute " + tr.name); mB.title = "Mute";
        sB.setAttribute("aria-pressed", String(!!tr.solo)); sB.setAttribute("aria-label", "Solo " + tr.name); sB.title = "Solo: hear only the soloed tracks";
        mB.addEventListener("click", e => { e.stopPropagation(); tr.mute = !tr.mute; mB.setAttribute("aria-pressed", String(tr.mute)); applyLevels(); saveSong(); });
        sB.addEventListener("click", e => { e.stopPropagation(); tr.solo = !tr.solo; sB.setAttribute("aria-pressed", String(tr.solo)); applyLevels(); saveSong(); });
        ms.append(mB, sB); hd.append(ms);
        hd.addEventListener("click", e => {
          if (e.target.closest(".ms")) return;
          if (e.target.closest("i")) { S.sel = i; setView("inst"); return; }
          if (i === S.sel) { trackSheet(tr); return; }
          S.sel = i; hideMenu(); V.rsel = ""; renderTracks(); paintBar(); saveSong();
        });
        const ln = gbEl("div", "gb-lane" + (i === S.sel ? " sel" : "")); ln.style.width = W + "px"; ln.style.backgroundImage = grid; ln.dataset.i = i;
        tr.regions.forEach(r => ln.append(regionEl(tr, r, P, RH)));
        vaDraw(ln, tr, P, RH, W);
        ln.addEventListener("pointerdown", e => {
          if (e.target !== ln) return;
          hideMenu(); V.rsel = "";
          if (S.sel !== i) { S.sel = i; renderTracks(); paintBar(); saveSong(); }
          else inn.querySelectorAll(".gb-reg.sel").forEach(x => x.classList.remove("sel"));
          renderTbar();
        });
        row.append(hd, ln); inn.append(row);
      });
      laneRows(inn, P, HW, W, RH);
      const ar = gbEl("div", "gb-row gb-addrow"), ah = gbEl("button", "gb-head", "+ Add a track");
      ah.style.width = HW + "px"; ah.style.height = Math.round(RH * 0.8) + "px"; ah.style.border = "0"; ah.addEventListener("click", () => setView("browse"));
      ar.append(ah); inn.append(ar);
      if (!S.tracks.length) inn.append(gbEl("div", "gb-empty", "No tracks yet. Tap + Add a track, choose an instrument, play it, and press ● to record."));
      const ph = gbEl("div", "gb-ph"); ph.id = "gbPh"; inn.append(ph);
      tl.scrollLeft = sx; tl.scrollTop = sy;
      placePh(!!scrollToPh); renderTbar();
      if (V.menu) showMenu();
    }
    function gbSeek(b) {
      if (TP.on && TP.rec) return;
      const was = TP.on; if (was) stop();
      S.ph = b; placePh(); paintPos();
      if (was) play(false);
    }
    function cycleEl(P) {
      const cb = gbEl("div", "gb-cycbar"); cb.style.left = S.cyc.a * P + "px"; cb.style.width = (S.cyc.b - S.cyc.a) * P + "px"; cb.title = "Cycle: drag to move, drag an end to resize";
      cb.addEventListener("pointerdown", e => {
        e.stopPropagation(); e.preventDefault(); try { cb.setPointerCapture(e.pointerId); } catch (x) {}
        const r = cb.getBoundingClientRect(), x = e.clientX - r.left, mode = x < 14 ? "a" : x > r.width - 14 ? "b" : "m";
        const a0 = S.cyc.a, b0 = S.cyc.b, x0 = e.clientX, u = S.sig; let did = false;
        const mv = ev => {
          const d = Math.round((ev.clientX - x0) / P / u) * u; if (!d && !did) return;
          if (!did) { did = true; gbDo(); }
          if (mode === "a") S.cyc.a = clamp(a0 + d, 0, b0 - u);
          else if (mode === "b") S.cyc.b = Math.max(a0 + u, b0 + d);
          else { const dd = Math.max(-a0, d); S.cyc.a = a0 + dd; S.cyc.b = b0 + dd; }
          cb.style.left = S.cyc.a * P + "px"; cb.style.width = (S.cyc.b - S.cyc.a) * P + "px";
        };
        const up = () => { cb.removeEventListener("pointermove", mv); cb.removeEventListener("pointerup", up); cb.removeEventListener("pointercancel", up); if (did) { saveSong(); renderTracks(); } };
        cb.addEventListener("pointermove", mv); cb.addEventListener("pointerup", up); cb.addEventListener("pointercancel", up);
      });
      return cb;
    }
    function regionEl(tr, r, P, RH) {
      const d = gbEl("div", "gb-reg" + (V.rsel === r.id ? " sel" : "")), tot = r.len * (r.rep || 1), w = Math.max(6, tot * P);
      d.dataset.r = r.id; d.style.left = r.start * P + "px"; d.style.width = w + "px"; d.style.setProperty("--rc", KIND[tr.kind].rc);
      d.append(gbEl("span", "rl", r.name || tr.name));
      for (let k = 1; k < (r.rep || 1); k++) { const x = gbEl("i", "rr"); x.style.left = k * r.len * P + "px"; d.append(x); }
      const cv = document.createElement("canvas"); d.append(cv); drawPreview(cv, tr, r, w, RH - 10 - 18);
      d.append(gbEl("i", "rh"));
      d.addEventListener("pointerdown", e => regionDown(e, d, tr, r));
      d.addEventListener("dblclick", () => { if (!r.key) openEditor(tr, r); });
      return d;
    }
    function regionDown(e, d, tr0, r) {
      if (e.button > 0) return;
      e.stopPropagation(); e.preventDefault();
      const st = { x: e.clientX, y: e.clientY, moved: false, start: r.start, len: r.len, rep: r.rep || 1, trim: e.target.classList.contains("rh"), owner: tr0 };
      const wasSel = V.rsel === r.id, i0 = S.tracks.indexOf(tr0);
      V.rsel = r.id;
      if (S.sel !== i0) { S.sel = i0; document.querySelectorAll("#gbTlin .gb-head, #gbTlin .gb-lane").forEach(x => x.classList.toggle("sel", +(x.closest(".gb-row") || {}).dataset?.i === i0)); paintBar(); }
      document.querySelectorAll("#gbTlin .gb-reg.sel").forEach(x => x.classList.remove("sel")); d.classList.add("sel");
      const P = PXB();
      const mv = ev => {
        if (ev.pointerId !== e.pointerId) return;
        const dx = ev.clientX - st.x, dy = ev.clientY - st.y;
        if (!st.moved && Math.hypot(dx, dy) < 7) return;
        if (!st.moved) { st.moved = true; gbDo(); hideMenu(); }
        const u = snapU();
        if (st.trim) {
          const tot = Math.max(u, Math.round((st.len * st.rep + dx / P) / u) * u);
          if (st.rep > 1) r.rep = Math.max(1, Math.round(tot / st.len));
          else { let L = tot; if (r.key) { const b = ABUF.get(r.key), dur = b ? b.duration : (r.dur || 0); L = Math.min(L, Math.max(u, (dur - (r.off || 0)) / spb())); } r.len = Math.max(u / 2, L); }
          d.style.width = Math.max(6, r.len * (r.rep || 1) * P) + "px";
        } else {
          r.start = Math.max(0, Math.round((st.start + dx / P) / u) * u); d.style.left = r.start * P + "px";
          const el = document.elementFromPoint(ev.clientX, ev.clientY), ln = el && el.closest && el.closest(".gb-lane");
          if (ln && ln !== d.parentNode) {
            const T = S.tracks[+ln.dataset.i];
            if (T && (T.kind === "audio") === (st.owner.kind === "audio")) {
              st.owner.regions = st.owner.regions.filter(x => x !== r); T.regions.push(r); st.owner = T;
              ln.append(d); d.style.setProperty("--rc", KIND[T.kind].rc);
            }
          }
        }
      };
      const up = ev => {
        if (ev.pointerId !== e.pointerId) return;
        removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
        if (st.moved) {
          const T = st.owner; T.regions = T.regions.filter(x => x !== r); placeRegion(T, r, false);
          S.sel = S.tracks.indexOf(T); fitLen(); dirty(); saveSong(); V.menu = false; renderTracks();
          return;
        }
        const now = Date.now();
        if (V.lastTap && V.lastTap.id === r.id && now - V.lastTap.t < 350) { V.lastTap = null; if (!r.key) openEditor(st.owner, r); return; }
        V.lastTap = { id: r.id, t: now };
        if (wasSel && V.menu) hideMenu(); else showMenu();
        renderTbar();
      };
      addEventListener("pointermove", mv); addEventListener("pointerup", up); addEventListener("pointercancel", up);
    }
    function hideMenu() { V.menu = false; const m = $("gbRmenu"); if (m) m.hidden = true; }
    function showMenu() {
      const f = findRegion(V.rsel), m = $("gbRmenu"); if (!f) { hideMenu(); return; }
      const { tr, r } = f, el = document.querySelector('#gbTlin .gb-reg[data-r="' + r.id + '"]'); if (!el) { hideMenu(); return; }
      V.menu = true; m.replaceChildren();
      const add = (t, fn, title) => { const b = gbEl("button", "", t); if (title) b.title = title; b.addEventListener("click", e => { e.stopPropagation(); fn(); }); m.append(b); };
      if (!r.key) add("Edit", () => openEditor(tr, r), "Edit the notes (or double-tap the region)");
      add("Cut", () => { V.clip = { r: JSON.parse(JSON.stringify(r)), audio: !!r.key }; delRegion(tr, r); gbSay("Cut: tap Paste to put it at the playhead"); });
      add("Copy", () => { V.clip = { r: JSON.parse(JSON.stringify(r)), audio: !!r.key }; hideMenu(); renderTbar(); gbSay("Copied: move the playhead and tap Paste"); });
      if (V.clip) add("Paste", pasteClip, "Paste at the playhead on the selected track");
      add("Duplicate", () => { gbDo(); const R = cloneRegion(r); R.start = rEnd(r); placeRegion(tr, R, false); V.rsel = R.id; fitLen(); dirty(); saveSong(); renderTracks(); });
      add((r.rep || 1) > 1 ? "Unloop" : "Loop", () => loopRegion(tr, r), "Repeat the region up to the next one");
      if (S.ph > r.start + 0.05 && S.ph < rEnd(r) - 0.05) add("Split", () => splitRegion(tr, r), "Cut the region in two at the playhead");
      if (r.key) add("Gain & fades", () => { hideMenu(); clipSheet(tr, r); }, "Level, fade in, fade out and Normalize");
      add("Delete", () => delRegion(tr, r));
      m.hidden = false;
      const B = $("gbTracks").getBoundingClientRect(), R = el.getBoundingClientRect();
      let x = R.left - B.left, y = R.top - B.top - m.offsetHeight - 6;
      x = clamp(x, 6, Math.max(6, B.width - m.offsetWidth - 6));
      if (y < 32) y = R.bottom - B.top + 6;
      m.style.left = x + "px"; m.style.top = y + "px";
    }
    const cloneRegion = r => Object.assign(JSON.parse(JSON.stringify(r)), { id: uid() });
    function delRegion(tr, r) { gbDo(); tr.regions = tr.regions.filter(x => x !== r); if (V.rsel === r.id) V.rsel = ""; hideMenu(); fitLen(); dirty(); saveSong(); renderTracks(); }
    function pasteClip() {
      const tr = curTr(); if (!V.clip || !tr) return;
      if (V.clip.audio !== (tr.kind === "audio")) { gbSay(V.clip.audio ? "Audio pastes onto an Audio Recorder track" : "Notes paste onto an instrument track, not audio"); return; }
      gbDo(); const R = cloneRegion(V.clip.r); R.start = Math.max(0, Math.round(S.ph)); placeRegion(tr, R, false);
      V.rsel = R.id; fitLen(); dirty(); saveSong(); hideMenu(); renderTracks();
    }
    function loopRegion(tr, r) {
      gbDo();
      if ((r.rep || 1) > 1) r.rep = 1;
      else {
        const next = tr.regions.filter(x => x !== r && x.start >= rEnd(r) - 1e-6).reduce((a, x) => Math.min(a, x.start), Infinity);
        const lim = Number.isFinite(next) ? next : Math.max(S.bars * S.sig, rEnd(r) + 3 * r.len);
        r.rep = Math.max(2, Math.floor((lim - r.start) / r.len + 1e-6));
        placeRegion(tr, tr.regions.splice(tr.regions.indexOf(r), 1)[0], false);
      }
      fitLen(); dirty(); saveSong(); hideMenu(); renderTracks();
    }
    function splitRegion(tr, r) {
      const b = Math.round(S.ph / 0.25) * 0.25; if (!(b > r.start && b < rEnd(r))) return;
      gbDo();
      const A = trimRegion(r, r.start, b), B = trimRegion(r, b, rEnd(r));
      tr.regions = tr.regions.filter(x => x !== r).concat([A, B].filter(Boolean)).sort((x, y) => x.start - y.start);
      V.rsel = B ? B.id : ""; dirty(); saveSong(); hideMenu(); renderTracks();
    }
    function renderTbar() {
      const b = $("gbTbar"); if (!b || !S) return; b.replaceChildren();
      b.append(btnE("+ Track", () => setView("browse")));
      b.append(btnE("Play along", playAlong, "", "Keep the song playing and go back to the keys (it stays in a small bar)"));
      if (window.__wl && __wl.pick) b.append(btnE("+ Automation", laneAdd, "", "Automate a plugin's control along the song"));
      const cy = btnE("⟳ Cycle", () => {
        gbDo(); S.cyc.on = !S.cyc.on;
        if (S.cyc.on) { const f = findRegion(V.rsel); if (f) { S.cyc.a = Math.floor(f.r.start / S.sig) * S.sig; S.cyc.b = Math.max(S.cyc.a + S.sig, Math.ceil(rEnd(f.r) / S.sig - 1e-6) * S.sig); } else { S.cyc.a = Math.floor(S.ph / S.sig + 1e-9) * S.sig; S.cyc.b = S.cyc.a + 4 * S.sig; } }
        saveSong(); renderTracks();
      });
      cy.setAttribute("aria-pressed", String(!!S.cyc.on)); cy.title = "Cycle: play the yellow bars over and over (record into them as many times as you like)"; b.append(cy);
      const zo = btnE("−", () => { if (S.zoom > 0) { S.zoom--; saveSong(); renderTracks(); } }, "", "Zoom out"), zi = btnE("+", () => { if (S.zoom < ZOOM.length - 1) { S.zoom++; saveSong(); renderTracks(); } }, "", "Zoom in");
      zo.disabled = S.zoom <= 0; zi.disabled = S.zoom >= ZOOM.length - 1; b.append(zo, zi);
      if (V.clip) b.append(btnE("Paste", pasteClip, "", "Paste at the playhead"));
      b.append(gbEl("span", "sp"));
      const f = findRegion(V.rsel);
      if (f && !f.r.key) b.append(btnE("Edit notes", () => openEditor(f.tr, f.r), "primary"));
      else b.append(gbEl("span", "gb-tip", isPhone() ? "Tap a region for its menu" : "Tap a region for its menu, drag to move it, drag its right edge to resize"));
    }
    function placePh(follow) {
      if (!V.open || !S) return;
      const b = Math.max(0, beatNow());
      if (S.view === "tracks") {
        const ph = $("gbPh"), pm = $("gbPhm"), tl = $("gbTl");
        if (ph) {
          const P = PXB(), HW = HEADW(), x = b * P, vis0 = tl.scrollLeft, span = tl.clientWidth - HW;
          ph.style.left = (HW + x) + "px"; ph.style.visibility = x < vis0 - 1 ? "hidden" : ""; if (pm) pm.style.left = x + "px";
          if ((follow || TP.on) && span > 40 && (x < vis0 || x > vis0 + span - 24)) tl.scrollLeft = Math.max(0, x - span * 0.2);
        }
      }
      if (ED.open) edDraw();
    }

    // ---------- the piano roll ----------
    const ED = { open: false, tr: "", r: "", ox: 0, oy: 0, pxb: 64, grid: 0.25, sel: new Set(), nlen: 0.5, rows: null, drum: false, rh: 15, w: 0, h: 0, dragUndo: false };
    const EDZ = [24, 32, 48, 64, 96, 128, 176];
    const edFind = () => { const tr = trById(ED.tr), r = tr && tr.regions.find(x => x.id === ED.r); return r ? { tr, r } : null; };
    const KWd = () => ED.drum ? (isPhone() ? 74 : 96) : 46, RUh = 20;
    const rowCount = () => ED.drum ? ED.rows.length : 88;
    const rowOf = m => ED.drum ? ED.rows.indexOf(m) : 108 - m;
    const midiOf = i => ED.drum ? ED.rows[i] : 108 - i;
    function openEditor(tr, r) {
      if (!tr || !r || r.key) return;
      hideMenu(); V.rsel = r.id;
      ED.open = true; ED.tr = tr.id; ED.r = r.id; ED.sel.clear(); ED.drum = tr.kind === "drums";
      if (ED.drum) { const used = [...new Set((r.notes || []).map(n => n[1]))].filter(m => !PADS.some(p => p[0] === m)).sort((a, b) => b - a); ED.rows = used.concat(PADS.map(p => p[0])); }
      ED.grid = 0.25; ED.ox = 0;
      $("gbEd").hidden = false; edHead(); edSize();
      // the rows: every drum on screen if it fits; a zoom that shows the whole region when it's short
      ED.rh = ED.drum ? clamp(Math.floor((ED.h - RUh) / ED.rows.length), 20, 30) : (isPhone() ? 18 : 15);
      const fitZ = (ED.w - KWd() - 24) / Math.max(0.25, r.len); ED.pxb = EDZ.filter(z => z <= fitZ).pop() || EDZ[0]; if (ED.pxb > 128 && !ED.drum) ED.pxb = 128;
      const ns = r.notes || [], mean = ns.length ? ns.reduce((a, n) => a + rowOf(n[1]), 0) / ns.length : rowOf(60);
      ED.oy = ED.drum ? 0 : Math.max(0, mean * ED.rh - (ED.h - RUh) / 2);
      edDraw(); renderTbar();
    }
    function edClose() { if (!ED.open) return; ED.open = false; $("gbEd").hidden = true; ED.sel.clear(); }
    function edSize() {
      const w = $("gbEdw"), cv = $("gbEdc"), dpr = Math.min(2, devicePixelRatio || 1);
      ED.w = Math.max(100, w.clientWidth); ED.h = Math.max(60, w.clientHeight);
      cv.width = Math.round(ED.w * dpr); cv.height = Math.round(ED.h * dpr); cv.style.width = ED.w + "px"; cv.style.height = ED.h + "px"; ED.dpr = dpr;
    }
    function edHead() {
      const f = edFind(), h = $("gbEdh"); if (!f) return; h.replaceChildren();
      h.append(gbEl("strong", "", f.tr.name + " · bar " + (Math.floor(f.r.start / S.sig) + 1)));
      [[1, "1/4"], [0.5, "1/8"], [0.25, "1/16"], [0.125, "1/32"]].forEach(([g, t]) => { const b = btnE(t, () => { ED.grid = g; edHead(); edDraw(); }, "", "Grid " + t); b.setAttribute("aria-pressed", String(ED.grid === g)); h.append(b); });
      h.append(btnE("Quantize", () => {
        const L = ED.sel.size ? [...ED.sel] : f.r.notes; if (!L.length) return; gbDo();
        L.forEach(n => { n[0] = clamp(Math.round(n[0] / ED.grid) * ED.grid, 0, Math.max(0, f.r.len - ED.grid)); });
        edChanged(); gbSay("Quantized " + L.length + (L.length === 1 ? " note" : " notes") + " to the grid");
      }, "", "Snap the notes (the selected ones, or all) to the grid"));
      const vl = gbEl("label", "gb-tip", "Velocity "), vr = document.createElement("input"); vr.type = "range"; vr.min = "0.05"; vr.max = "1"; vr.step = "0.01";
      const s0 = [...ED.sel][0]; vr.value = String(s0 ? s0[3] : 0.8); vr.disabled = !ED.sel.size; vr.setAttribute("aria-label", "Velocity of the selected notes");
      vr.addEventListener("input", () => { if (!ED.dragUndo) { gbDo(); ED.dragUndo = true; } ED.sel.forEach(n => { n[3] = +vr.value; }); edDraw(); });
      vr.addEventListener("change", () => { ED.dragUndo = false; edChanged(true); });
      vl.append(vr); h.append(vl);
      const del = btnE("Delete", () => edDelete(), "", "Delete the selected notes"); del.disabled = !ED.sel.size; h.append(del);
      h.append(btnE("All", () => { ED.sel = new Set(f.r.notes); edHead(); edDraw(); }, "", "Select every note"));
      h.append(btnE("−", () => { const i = EDZ.indexOf(ED.pxb); if (i > 0) { ED.pxb = EDZ[i - 1]; edDraw(); } }, "", "Zoom out"), btnE("+", () => { const i = EDZ.indexOf(ED.pxb); if (i < EDZ.length - 1) { ED.pxb = EDZ[i + 1]; edDraw(); } }, "", "Zoom in"));
      h.append(gbEl("span", "sp"));
      const x = btnE("Done", () => { edClose(); renderTbar(); }, "primary"); x.id = "gbEdX"; h.append(x);
    }
    function edChanged(keepHead) { dirty(); saveSong(); if (!keepHead) edHead(); edDraw(); renderTracks(); }
    function edDelete() { const f = edFind(); if (!f || !ED.sel.size) return; gbDo(); f.r.notes = f.r.notes.filter(n => !ED.sel.has(n)); ED.sel.clear(); edChanged(); }
    function edClampO(r) {
      const KW = KWd(), maxX = Math.max(0, r.len * ED.pxb - (ED.w - KW) + 40), maxY = Math.max(0, rowCount() * ED.rh - (ED.h - RUh));
      ED.ox = clamp(ED.ox, 0, maxX); ED.oy = clamp(ED.oy, 0, maxY);
    }
    function edDraw() {
      if (!ED.open) return;
      const f = edFind(); if (!f) { edClose(); return; }
      const { tr, r } = f, cv = $("gbEdc"), g = cv.getContext("2d"), W = ED.w, H = ED.h, KW = KWd(), P = ED.pxb, RH = ED.rh;
      edClampO(r);
      g.setTransform(ED.dpr, 0, 0, ED.dpr, 0, 0);
      g.fillStyle = "#15121e"; g.fillRect(0, 0, W, H);
      const i0 = Math.max(0, Math.floor(ED.oy / RH)), i1 = Math.min(rowCount() - 1, Math.ceil((ED.oy + H) / RH));
      for (let i = i0; i <= i1; i++) {
        const m = midiOf(i), y = RUh + i * RH - ED.oy, blk = !ED.drum && [1, 3, 6, 8, 10].includes(m % 12);
        g.fillStyle = blk ? "#141120" : (i % 2 && ED.drum ? "#1a1726" : "#1c1928"); g.fillRect(KW, y, W - KW, RH);
        if (!ED.drum && m % 12 === 0) { g.fillStyle = "#2c2840"; g.fillRect(KW, y + RH - 1, W - KW, 1); }
      }
      const b0 = Math.floor(ED.ox / P / ED.grid) * ED.grid, b1 = (ED.ox + W) / P;
      for (let b = b0; b <= b1; b += ED.grid) {
        const x = KW + b * P - ED.ox; if (x < KW) continue;
        const sb = r.start + b, bar = Math.abs(sb / S.sig - Math.round(sb / S.sig)) < 1e-6, beat = Math.abs(b - Math.round(b)) < 1e-6;
        g.fillStyle = bar ? "#4a4466" : beat ? "#2e2a40" : "#211e2e"; g.fillRect(x, RUh, 1, H - RUh);
      }
      const xe = KW + r.len * P - ED.ox; if (xe < W) { g.fillStyle = "#000a"; g.fillRect(Math.max(KW, xe), RUh, W - Math.max(KW, xe), H - RUh); }
      const col = KIND[tr.kind].rc;
      (r.notes || []).forEach(n => {
        const x = KW + n[0] * P - ED.ox, y = RUh + rowOf(n[1]) * RH - ED.oy, w = Math.max(ED.drum ? 9 : 5, n[2] * P - 1);
        if (x + w < KW || x > W || y + RH < RUh || y > H) return;
        g.globalAlpha = 0.45 + 0.55 * clamp(n[3], 0, 1); g.fillStyle = col; g.fillRect(x, y + 1, w, RH - 2); g.globalAlpha = 1;
        if (ED.sel.has(n)) { g.strokeStyle = "#fff"; g.lineWidth = 2; g.strokeRect(x + 1, y + 2, w - 2, RH - 4); }
      });
      if (TP.on || S.ph > 0) {
        const b = beatNow();
        if (b >= r.start && b < rEnd(r)) { const x = KW + ((b - r.start) % r.len) * P - ED.ox; if (x >= KW) { g.fillStyle = "#fff"; g.fillRect(x - 1, 0, 2, H); } }
      }
      // the ruler and the keys (or drum names) stay put
      g.fillStyle = "#1b1826"; g.fillRect(0, 0, W, RUh);
      if (!ED.font) ED.font = "10px " + (getComputedStyle(document.body).getPropertyValue("--font-mono").trim() || "monospace"); g.font = ED.font; g.textBaseline = "middle";
      for (let b = Math.ceil(ED.ox / P); b <= b1; b++) {
        const sb = r.start + b; if (Math.abs(sb / S.sig - Math.round(sb / S.sig)) > 1e-6) continue;
        const x = KW + b * P - ED.ox; if (x < KW) continue; g.fillStyle = "#8e86a6"; g.fillText(String(Math.round(sb / S.sig) + 1), x + 3, RUh / 2);
      }
      for (let i = i0; i <= i1; i++) {
        const m = midiOf(i), y = RUh + i * RH - ED.oy; if (y + RH < RUh) continue;
        if (ED.drum) { g.fillStyle = i % 2 ? "#221e31" : "#262236"; g.fillRect(0, y, KW, RH); g.fillStyle = PADCOL[m] || "#8e86a6"; g.fillRect(0, y, 4, RH); g.fillStyle = "#d8d2e6"; g.fillText(DRUMNAME(m), 8, y + RH / 2); }
        else {
          const blk = [1, 3, 6, 8, 10].includes(m % 12); g.fillStyle = blk ? "#2a2636" : "#e9e5f0"; g.fillRect(0, y, KW, RH - (blk ? 0 : 1));
          if (m % 12 === 0) { g.fillStyle = "#4a4466"; g.fillText(nname(m), 4, y + RH / 2); }
        }
      }
      g.fillStyle = "#1b1826"; g.fillRect(0, 0, KW, RUh);
    }
    function edHit(r, x, y) {
      const KW = KWd(), P = ED.pxb, b = (x - KW + ED.ox) / P, row = Math.floor((y - RUh + ED.oy) / ED.rh), m = midiOf(row);
      let hit = null;
      for (let k = (r.notes || []).length - 1; k >= 0; k--) { const n = r.notes[k], w = Math.max(ED.drum ? 9 : 5, n[2] * P) / P; if (n[1] === m && b >= n[0] - 0.02 && b <= n[0] + w) { hit = n; break; } }
      return { b, row, m, hit };
    }
    {
      const cv = $("gbEdc"); let D = null, taps = null;
      const local = e => { const R = cv.getBoundingClientRect(); return { x: e.clientX - R.left, y: e.clientY - R.top }; };
      const pv = (tr, m, v) => { start(); if (ctx) playAt(tr, m, ctx.currentTime + 0.01, 0.3, v || 0.8); };
      cv.addEventListener("pointerdown", e => {
        const f = edFind(); if (!f) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {}
        const { x, y } = local(e), KW = KWd();
        if (y < RUh) { gbSeek(clamp(f.r.start + (x - KW + ED.ox) / ED.pxb, f.r.start, rEnd(f.r))); return; }
        const H = edHit(f.r, x, y);
        if (x < KW) { const m = midiOf(H.row); if (m != null && m >= 0) pv(f.tr, m); D = { mode: "pan", x0: e.clientX, y0: e.clientY, ox: ED.ox, oy: ED.oy, moved: false, keys: true }; return; }
        D = { mode: "pan", x0: e.clientX, y0: e.clientY, ox: ED.ox, oy: ED.oy, moved: false, H, wasSel: H.hit && ED.sel.has(H.hit) };
        if (H.hit) {
          if (!ED.sel.has(H.hit)) { if (!e.shiftKey) ED.sel.clear(); ED.sel.add(H.hit); edHead(); }
          const right = KW + (H.hit[0] + H.hit[2]) * ED.pxb - ED.ox;
          D.mode = (x > right - 12 && H.hit[2] * ED.pxb > 18) ? "resize" : "move";
          D.orig = new Map([...ED.sel].map(n => [n, n.slice()])); D.lastRow = H.row;
          pv(f.tr, H.hit[1], H.hit[3]);
        }
        edDraw();
      });
      cv.addEventListener("pointermove", e => {
        if (!D) return; const f = edFind(); if (!f) return;
        const dx = e.clientX - D.x0, dy = e.clientY - D.y0;
        if (!D.moved && Math.hypot(dx, dy) < 6) return;
        if (!D.moved) { D.moved = true; if (D.mode !== "pan") gbDo(); }
        if (D.mode === "pan") { ED.ox = D.ox - (D.keys ? 0 : dx); ED.oy = D.oy - dy; edDraw(); return; }
        const r = f.r, h = D.orig.get(D.H.hit), G = ED.grid;
        if (D.mode === "move") {
          const ns = Math.round((h[0] + dx / ED.pxb) / G) * G, db = ns - h[0], dr = Math.round(dy / ED.rh);
          D.orig.forEach((o, n) => {
            n[0] = clamp(o[0] + db, 0, Math.max(0, r.len - Math.min(o[2], G)));
            const row = clamp(rowOf(o[1]) + dr, 0, rowCount() - 1); n[1] = midiOf(row);
          });
          const row = rowOf(D.H.hit[1]); if (row !== D.lastRow) { D.lastRow = row; pv(f.tr, D.H.hit[1], D.H.hit[3]); }
        } else {
          const ne = Math.round((h[0] + h[2] + dx / ED.pxb) / G) * G, dd = Math.max(G, ne - h[0]) - h[2];
          D.orig.forEach((o, n) => { n[2] = clamp(o[2] + dd, Math.min(G, o[2]), r.len - n[0]); });
        }
        edDraw();
      });
      const up = e => {
        if (!D) return; const d = D; D = null; const f = edFind(); if (!f) return;
        if (d.moved) { if (d.mode !== "pan") { if (d.mode === "resize" && d.H.hit) ED.nlen = d.H.hit[2]; edChanged(); } return; }
        if (d.keys) return;
        const now = Date.now();
        if (d.H.hit) {
          if (taps && taps.n === d.H.hit && now - taps.t < 350) { taps = null; gbDo(); f.r.notes = f.r.notes.filter(n => n !== d.H.hit); ED.sel.delete(d.H.hit); edChanged(); return; }
          taps = { n: d.H.hit, t: now };
          if (d.wasSel && !e.shiftKey && ED.sel.size > 1) { ED.sel = new Set([d.H.hit]); edHead(); edDraw(); }
          return;
        }
        if (ED.sel.size) { ED.sel.clear(); edHead(); edDraw(); return; }   // (a tap on empty space lets go of the selection)
        const b = Math.floor(d.H.b / ED.grid) * ED.grid; if (b < 0 || b >= f.r.len || d.H.m == null) return;
        gbDo();
        const n = [+b.toFixed(4), d.H.m, ED.drum ? ED.grid : Math.min(ED.nlen, f.r.len - b), 0.8];
        f.r.notes.push(n); ED.sel = new Set([n]); pv(f.tr, n[1], 0.8); taps = null; edChanged();
      };
      cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
      cv.addEventListener("wheel", e => {
        if (!ED.open) return; e.preventDefault();
        if (e.ctrlKey) { const i = EDZ.indexOf(ED.pxb), j = clamp(i + (e.deltaY < 0 ? 1 : -1), 0, EDZ.length - 1); ED.pxb = EDZ[j]; }
        else if (e.shiftKey) ED.ox += e.deltaY; else { ED.ox += e.deltaX; ED.oy += e.deltaY; }
        edDraw();
      }, { passive: false });
    }

    // ---------- sheets ----------
    let SH = null;
    function openSheet(title, info, build) {
      SH = { title, info, build };
      shT.textContent = title; shI.textContent = info || ""; shB.replaceChildren(); build(shB);
      sheet.hidden = false;
    }
    function reSheet() { if (!SH || sheet.hidden) return; const card = shB.closest(".ed-card"), y = card ? card.scrollTop : 0; shT.textContent = SH.title; shI.textContent = SH.info || ""; shB.replaceChildren(); SH.build(shB); if (card) card.scrollTop = y; }
    function closeSheet() { sheet.hidden = true; SH = null; if (V.open && S.view === "inst") renderInst(); else if (V.open && S.view === "tracks") renderTracks(); paintBar(); }
    $("gbShDone").addEventListener("click", closeSheet);
    const row2 = (box, title, sub, on) => { const r = gbEl("div", "gb-row2" + (on ? " on" : "")), g = gbEl("div", "grow"); g.append(gbEl("b", "", title)); if (sub) g.append(gbEl("small", "", sub)); r.append(g); box.append(r); return r; };
    const groupH = (box, t) => box.append(gbEl("div", "gb-g", t));
    const dbTxt = v => { const g = Math.pow(clamp(v, 0, 1.2), 2) * 1.25; return g < 0.0005 ? "−∞ dB" : (20 * Math.log10(g) >= 0 ? "+" : "") + (20 * Math.log10(g)).toFixed(1) + " dB"; };
    const panTxt = p => Math.abs(p) < 0.02 ? "C" : (p < 0 ? "L" : "R") + Math.round(Math.abs(p) * 100);
    function slider(r, label, min, max, step, val, txt, onIn) {
      r.append(gbEl("span", "gb-lab", label));
      const inp = document.createElement("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val; inp.setAttribute("aria-label", label);
      const v = gbEl("span", "gb-v", txt(val)); let u = false;
      inp.addEventListener("input", () => { if (!u) { gbDo(); u = true; } onIn(+inp.value); v.textContent = txt(+inp.value); });
      inp.addEventListener("change", () => { u = false; saveSong(); paintBar(); });
      r.append(inp, v); return inp;
    }
    // choosing a sound: grouped like the library, ▶ to hear one first (picking one never plays a note by itself)
    function phrase(tr) {
      if (!ctx) return; const t = ctx.currentTime + 0.05, b = spb();
      if (tr.kind === "drums") { [[0, 36], [0, 42], [0.5, 42], [1, 38], [1, 42], [1.5, 42], [1.75, 36], [2, 36], [2, 42], [2.5, 42], [3, 38], [3, 46]].forEach(([o, m]) => drumHit(tr, m, t + o * b * 0.6, 0.85)); return; }
      const lo = tr.kind === "bass" ? 36 : tr.kind === "guitar" ? 52 : 60;
      if (tr.kind === "bass") [[0, lo], [0.5, lo + 7], [1, lo + 12], [1.5, lo + 7]].forEach(([o, m]) => playAt(tr, m, t + o * b, 0.45 * b, 0.85));
      else [lo, lo + 4, lo + 7, lo + 12].forEach((m, j) => playAt(tr, m, t + j * 0.02, 1.4, 0.75));
      setTimeout(() => { if (ctx) releaseDue(ctx.currentTime + 3); }, 1600);
    }
    function preview(tr, ref) {
      start(); if (!ctx) return;
      const ph = { id: "gb-preview", kind: tr.kind, snd: ref, vol: tr.vol, pan: 0, solo: true, p: null, regions: [] };
      if (AU.pvRef !== ref) { dropPlug(ph.id); AU.pvRef = ref; }
      const P = prep(ph); if (ref.startsWith("wam:") || ref.startsWith("lib:")) gbSay("Loading " + soundName(ref) + "…");
      Promise.resolve(P).then(() => setTimeout(() => phrase(ph), ref.startsWith("wam:") ? 150 : 0));
    }
    function setSound(tr, ref) {
      if (tr.snd === ref) return;
      gbDo(); if ((tr.snd || "").startsWith("wam:")) dropPlug(tr.id);
      tr.snd = ref; tr.p = null; tr.pst = null; start(); prep(tr); dirty(); saveSong();
    }
    function soundSheet(tr) {
      openSheet(tr.kind === "drums" ? "Choose a kit" : "Choose a sound", tr.name, box => {
        const list = soundsFor(tr.kind); let g = null;
        if (!list.length) box.append(gbEl("p", "gb-p", tr.kind === "plugin" ? "Plugins open on the Nate Bloom site and in the apps." : "There are no sounds for this instrument here yet."));
        list.forEach(s => {
          if (s.group !== g) { g = s.group; groupH(box, g); }
          const r = row2(box, s.name, s.sub, s.ref === tr.snd); r.style.cursor = "pointer";
          r.append(btnE("▶", e => { e.stopPropagation(); preview(tr, s.ref); }, "", "Hear " + s.name));
          r.addEventListener("click", () => { setSound(tr, s.ref); reSheet(); });
        });
      });
    }
    // Smart Controls: the sound's own knobs, kept with the track
    // a track's Smart Controls: its sound's knobs, in groups (the sheet, and the MiniLab's knobs)
    function ctlGroups(tr) {
      const r = tr.snd || "", groups = [];
        if (r.startsWith("eng:")) { const id = r.slice(4); groups.push({ name: ENGINES[id].name, knobs: ENGINES[id].knobs, get: k => (tr.p && tr.p[k] != null ? tr.p[k] : engDefaults(id)[k]), set: (k, v) => { tr.p = Object.assign({}, tr.p, { [k]: v }); } }); }
      else if (r.startsWith("pre:")) {
        const P = NB_PRESETS[+r.slice(4)], ids = (Array.isArray(P[1]) ? P[1] : [P[1]]).filter(id => ENGINES[id]);
        ids.forEach(id => groups.push({ name: ENGINES[id].name, knobs: ENGINES[id].knobs, get: k => { const o = tr.p && tr.p[id]; return o && o[k] != null ? o[k] : ((P[2] && P[2][id] && P[2][id][k] != null) ? P[2][id][k] : engDefaults(id)[k]); }, set: (k, v) => { tr.p = Object.assign({}, tr.p); tr.p[id] = Object.assign({}, tr.p[id], { [k]: v }); } }));
      }
      else if (r.startsWith("lib:")) groups.push({ name: "Sound", knobs: LIB_KNOBS, get: k => libP(tr)[k], set: (k, v) => { tr.p = Object.assign({}, tr.p, { [k]: v }); } });
      return groups;
    }
    function ctlSheet(tr) {
      const r = tr.snd || "";
      if (r.startsWith("wam:")) {
        start(); gbSay("Opening " + soundName(r) + "…");
        Promise.resolve(plugFor(tr)).then(() => {
          const P = AU.plug.get(tr.id); if (!P || !P.inst) { gbSay("Couldn't open the plugin"); return; }
          V.guiTr = tr.id; __wam.openGui({ id: "gb:" + tr.id, inst: P.inst, node: P.node, name: (P.name || soundName(r)) + " · " + tr.name, vendor: "Garage" });
        });
        return;
      }
      openSheet("Smart Controls", tr.name + " · " + soundName(r), box => {
        const groups = ctlGroups(tr);
        if (!groups.length) { box.append(gbEl("p", "gb-p", "This sound has no controls of its own here.")); return; }
        groups.forEach(G => {
          if (groups.length > 1) groupH(box, G.name);
          const kn = gbEl("div", "gb-knobs");
          G.knobs.forEach(([k, label]) => {
            const c = gbEl("div", "gb-knob"), sp = gbEl("span", "", label), v = gbEl("small", "", Math.round(G.get(k) * 100) + "%"); sp.append(v);
            const inp = document.createElement("input"); inp.type = "range"; inp.min = "0"; inp.max = "1"; inp.step = "0.01"; inp.value = String(G.get(k)); inp.setAttribute("aria-label", label);
            let u = false;
            inp.addEventListener("input", () => { if (!u) { gbDo(); u = true; } G.set(k, +inp.value); v.textContent = Math.round(+inp.value * 100) + "%"; });
            inp.addEventListener("change", () => { u = false; saveSong(); });
            c.append(sp, inp); kn.append(c);
          });
          box.append(kn);
        });
        if (r === "eng:speech" && window.__sp) {
          groupH(box, "Voice");
          const sel = document.createElement("select"); sel.className = "gb-in"; sel.setAttribute("aria-label", "Voice");
          __sp.SP_CHARS.forEach(c => { const o = document.createElement("option"); o.value = c.id; o.textContent = c.name + " · " + c.year; sel.append(o); });
          sel.value = __sp.SPS.ch; sel.addEventListener("change", () => __sp.setVoice(sel.value));
          const r1 = gbEl("div", "gb-row2"); r1.append(sel); box.append(r1);
          groupH(box, "Words: each note sings the next syllable");
          const ta = document.createElement("textarea"); ta.className = "gb-in"; ta.rows = 3; ta.value = __sp.SPS.text; ta.setAttribute("aria-label", "Words to sing");
          ta.style.cssText = "height:auto;min-height:84px;padding:8px 10px;resize:vertical;font-size:16px;line-height:1.4";
          ta.addEventListener("input", () => __sp.setText(ta.value));
          const r2 = gbEl("div", "gb-row2"); r2.append(ta); box.append(r2);
        }
        const rw = gbEl("div", "gb-chips");
        rw.append(btnE("▶ Hear it", () => { start(); prep(tr).then(() => phrase(tr)); }), btnE("Reset", () => { gbDo(); tr.p = null; saveSong(); reSheet(); }));
        box.append(rw);
        box.append(gbEl("p", "gb-tip", "New notes use the knobs; they stay with this track and this song."));
      });
    }
    // the plugin panel keeps its settings with the track too
    new MutationObserver(() => {
      const g = $("wamGui"); if (!g || !g.hidden || !V.guiTr) return;
      const id = V.guiTr; V.guiTr = ""; const P = AU.plug.get(id), tr = trById(id); if (!P || !P.node || !tr) return;
      P.node.getState().then(st => { try { const j = JSON.stringify(st); if (j.length < 400000) { tr.pst = JSON.parse(j); saveSong(); } } catch (e) {} }).catch(() => {});
    }).observe($("wamGui") || document.body, { attributes: true, attributeFilter: ["hidden"] });
    function trackSheet(tr) {
      openSheet("Track", KIND[tr.kind].name, box => {
        let r = row2(box, "Name", "");
        const nm = document.createElement("input"); nm.className = "gb-in"; nm.value = tr.name; nm.maxLength = 40; nm.setAttribute("aria-label", "Track name");
        nm.addEventListener("change", () => { const v = nm.value.trim(); if (v && v !== tr.name) { gbDo(); tr.name = v; saveSong(); } });
        r.append(nm);
        if (tr.kind !== "audio") { r = row2(box, soundName(tr.snd), tr.kind === "drums" ? "drum kit" : "sound"); r.append(btnE("Change", () => soundSheet(tr))); if (tr.kind !== "drums" && !(tr.snd || "").startsWith("smp:") && tr.snd !== "sf2") r.append(btnE("Controls", () => ctlSheet(tr))); }
        r = row2(box, "", ""); r.firstChild.remove(); slider(r, "Volume", 0, 1.2, 0.01, tr.vol, dbTxt, v => { tr.vol = v; applyLevels(); vaTouch(tr, v); });
        r = row2(box, "", ""); r.firstChild.remove(); slider(r, "Pan", -1, 1, 0.01, tr.pan, panTxt, v => { tr.pan = v; applyLevels(); });
        r = row2(box, "", ""); r.firstChild.remove(); slider(r, "Reverb", 0, 1, 0.01, tRv(tr), v => Math.round(v * 100) + "%", v => { tr.rv = v; applyLevels(); });
        vaRow(box, tr);
        const i = S.tracks.indexOf(tr), acts = gbEl("div", "gb-chips");
        acts.append(btnE("Play it", () => { S.sel = i; closeSheet(); setView("inst"); }, "primary"));
        acts.append(btnE("Duplicate track", () => {
          if (S.tracks.length >= 32) { gbSay("A song holds 32 tracks"); return; }
          gbDo(); const c = JSON.parse(JSON.stringify(tr)); c.id = uid(); c.name = tr.name + " copy"; c.regions.forEach(x => { x.id = uid(); });
          S.tracks.splice(i + 1, 0, c); S.sel = i + 1; prep(c); dirty(); saveSong(); closeSheet(); setView("tracks");
        }));
        const upB = btnE("Move up", () => { gbDo(); S.tracks.splice(i, 1); S.tracks.splice(i - 1, 0, tr); S.sel = i - 1; saveSong(); reSheet(); }), dnB = btnE("Move down", () => { gbDo(); S.tracks.splice(i, 1); S.tracks.splice(i + 1, 0, tr); S.sel = i + 1; saveSong(); reSheet(); });
        upB.disabled = i <= 0; dnB.disabled = i >= S.tracks.length - 1; acts.append(upB, dnB);
        let sure = false; const del = btnE("Delete track", () => {
          if (!sure) { sure = true; del.textContent = "Delete " + tr.name + "?"; setTimeout(() => { sure = false; del.textContent = "Delete track"; }, 3000); return; }
          gbDo(); S.tracks.splice(i, 1); dropPlug(tr.id); const N = AU.trk.get(tr.id); if (N) { try { N.g.disconnect(); N.p.disconnect(); N.s.disconnect(); } catch (e) {} AU.trk.delete(tr.id); }
          S.sel = clamp(S.sel, 0, Math.max(0, S.tracks.length - 1)); dirty(); fitLen(); saveSong(); closeSheet(); setView(S.tracks.length ? "tracks" : "browse");
          gbSay(tr.name + " deleted: Undo brings it back");
        });
        acts.append(del); box.append(acts);
      });
    }
    function mixSheet() {
      openSheet("Mixer", S.tracks.length + (S.tracks.length === 1 ? " track" : " tracks"), box => {
        if (!S.tracks.length) { box.append(gbEl("p", "gb-p", "No tracks yet: choose an instrument to make one.")); return; }
        S.tracks.forEach(tr => {
          groupH(box, tr.name + " · " + (tr.kind === "audio" ? "audio" : soundName(tr.snd)));
          let r = row2(box, "", ""); r.firstChild.remove();
          const m = btnE("M", () => { tr.mute = !tr.mute; m.setAttribute("aria-pressed", String(tr.mute)); applyLevels(); saveSong(); }, "", "Mute " + tr.name), so = btnE("S", () => { tr.solo = !tr.solo; so.setAttribute("aria-pressed", String(tr.solo)); applyLevels(); saveSong(); }, "", "Solo " + tr.name);
          m.setAttribute("aria-pressed", String(!!tr.mute)); so.setAttribute("aria-pressed", String(!!tr.solo)); r.append(m, so);
          slider(r, "Volume", 0, 1.2, 0.01, tr.vol, dbTxt, v => { tr.vol = v; applyLevels(); vaTouch(tr, v); });
          r = row2(box, "", ""); r.firstChild.remove();
          slider(r, "Pan", -1, 1, 0.01, tr.pan, panTxt, v => { tr.pan = v; applyLevels(); });
          slider(r, "Reverb", 0, 1, 0.01, tRv(tr), v => Math.round(v * 100) + "%", v => { tr.rv = v; applyLevels(); });
        });
        groupH(box, "The whole song");
        const r = row2(box, "", ""); r.firstChild.remove();
        slider(r, "Level", 0, 1.5, 0.01, S.mvol != null ? S.mvol : 1, v => (v < 0.001 ? "−∞" : (20 * Math.log10(v)).toFixed(1)) + " dB", v => { S.mvol = v; applyLevels(); });
        box.append(gbEl("p", "gb-tip", "The song goes into Nate Bloom's master (its volume and limiter), past the effects panel: each track's Reverb sends it to the shared hall."));
      });
    }
    function setSheet() {
      openSheet("Song settings", S.name, box => {
        let r = row2(box, "Tempo", "beats per minute");
        const num = document.createElement("input"); num.type = "number"; num.className = "gb-in gb-num"; num.min = "40"; num.max = "240"; num.value = String(S.bpm); num.setAttribute("aria-label", "Tempo");
        const setBpm = v => { v = clamp(Math.round(v), 40, 240); if (v === S.bpm) return; if (TP.on && ctx) { const now = ctx.currentTime, b = beatAt(now); TP.t0 = now; TP.b0 = b; } S.bpm = v; num.value = String(v); saveSong(); paintBar(); };
        num.addEventListener("change", () => setBpm(+num.value || S.bpm));
        const taps = []; const tap = btnE("Tap", () => { const t = performance.now(); if (taps.length && t - taps[taps.length - 1] > 2000) taps.length = 0; taps.push(t); if (taps.length > 6) taps.shift(); if (taps.length >= 3) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1))); }, "", "Tap the tempo");
        r.append(btnE("−", () => setBpm(S.bpm - 1), "", "Slower"), num, btnE("+", () => setBpm(S.bpm + 1), "", "Faster"), tap);
        groupH(box, "Key: the Smart chord strips follow it");
        let ch = gbEl("div", "gb-chips");
        NN.forEach((n, i) => { const b = btnE(n, () => { S.key = i; saveSong(); reSheet(); paintBar(); }); b.setAttribute("aria-pressed", String(S.key === i)); ch.append(b); });
        box.append(ch); ch = gbEl("div", "gb-chips");
        [[false, "Major"], [true, "Minor"]].forEach(([m, t]) => { const b = btnE(t, () => { S.minor = m; saveSong(); reSheet(); paintBar(); }); b.setAttribute("aria-pressed", String(S.minor === m)); ch.append(b); });
        box.append(ch);
        groupH(box, "Time signature"); ch = gbEl("div", "gb-chips");
        [2, 3, 4, 5, 6, 7].forEach(n => { const b = btnE(n + "/4", () => { gbDo(); S.sig = n; fitLen(); saveSong(); reSheet(); paintBar(); }); b.setAttribute("aria-pressed", String(S.sig === n)); ch.append(b); });
        box.append(ch);
        groupH(box, "Song length");
        r = row2(box, S.auto ? "Automatic" : S.bars + " bars", S.auto ? "grows as you record" : "fixed: playback stops here");
        const au = btnE("Automatic", () => { S.auto = !S.auto; fitLen(); saveSong(); reSheet(); }); au.setAttribute("aria-pressed", String(!!S.auto));
        r.append(au, btnE("−", () => { S.auto = false; S.bars = Math.max(1, S.bars - 1); saveSong(); reSheet(); }, "", "One bar shorter"), btnE("+", () => { S.auto = false; S.bars = Math.min(999, S.bars + 1); saveSong(); reSheet(); }, "", "One bar longer"));
        groupH(box, "Recording");
        const tog = (title, sub, key) => { const rr = row2(box, title, sub), b = btnE(S[key] ? "On" : "Off", () => { S[key] = !S[key]; saveSong(); reSheet(); paintBar(); }); b.setAttribute("aria-pressed", String(!!S[key])); rr.append(b); };
        tog("Metronome", "clicks while you play and record (never in an export)", "metro");
        tog("Count-in", "one bar of clicks before recording starts", "cin");
        tog("Merge recordings", "a new take adds to the notes already there instead of replacing them (Cycle always merges)", "merge");
        groupH(box, "Playing");
        tog("The Seq beat plays along", "the beat from Seq plays with the song, at the song's tempo", "beat");
        tog("Free placement", "move and resize regions anywhere, without snapping to beats and bars", "free");
      });
    }
    function loopNotes(i) {
      const L = BEATS[i]; if (!L) return null;
      const [, , , swing, P] = L, MAP = { kick: 36, snare: 38, clap: 39, ch: 42, oh: 46, rim: 37, tom: 45, cow: 56 };
      let len = 16; const notes = [];
      Object.keys(P).forEach(k => {
        const m = MAP[k]; if (!m) return; len = Math.max(len, P[k].length);
        [...P[k]].forEach((c, s) => { if (c === "." || c === " ") return; const v = c === "X" ? 1 : c === "x" ? 0.82 : 0.6; notes.push([+(s * 0.25 + (s % 2 ? (swing || 0) * 0.125 : 0)).toFixed(4), m, 0.25, v]); });
      });
      return { notes: notes.sort((a, b) => a[0] - b[0]), len: len * 0.25, bpm: L[2], name: L[0] };
    }
    function addLoop(i) {
      const L = loopNotes(i); if (!L) return;
      let tr = curTr(); if (!tr || tr.kind !== "drums") tr = S.tracks.find(t => t.kind === "drums") || addTrack("drums", { stay: true });
      if (!tr) return;
      gbDo();
      if (!songEndBeat()) { S.bpm = L.bpm; gbSay("Tempo set to " + L.bpm + " to match " + L.name); }
      const a = Math.floor(S.ph / S.sig + 1e-9) * S.sig, R = { id: uid(), start: a, len: L.len, rep: 4, notes: L.notes, name: L.name };
      placeRegion(tr, R, false); S.sel = S.tracks.indexOf(tr); V.rsel = R.id; fitLen(); dirty(); saveSong(); closeSheet(); setView("tracks");
    }
    function loopsSheet() {
      openSheet("Drum loops", "Nate Bloom's beats, ready to drop into a song", box => {
        box.append(gbEl("p", "gb-tip", "Add puts four bars of the beat on a Drums track at the playhead (the first loop in an empty song sets the tempo). Edit it like any recording."));
        let g = null;
        BEATS.forEach((B, i) => {
          if (B[1] !== g) { g = B[1]; groupH(box, g); }
          const r = row2(box, B[0], B[2] + " bpm");
          r.append(btnE("▶", () => {
            start(); if (!ctx) return; const L = loopNotes(i), kit = (S.tracks.find(t => t.kind === "drums") || {}).snd || "kit:studio";
            const ph = { id: "gb-preview", kind: "drums", snd: kit, vol: 0.8, pan: 0, solo: true, regions: [] }; prep(ph);
            const t = ctx.currentTime + 0.08, b = 60 / L.bpm; L.notes.forEach(n => drumHit(ph, n[1], t + n[0] * b, n[3]));
          }, "", "Hear " + B[0]), btnE("Add", () => addLoop(i), "primary"));
        });
      });
    }
    // songs and export
    const fmtT = t => { if (!t) return ""; const d = new Date(t); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
    function dropAll() {
      AU.plug.forEach((P, id) => dropPlug(id));
      AU.trk.forEach(N => { try { N.g.disconnect(); N.p.disconnect(); N.s.disconnect(); } catch (e) {} }); AU.trk.clear();
    }
    function switchSong(s) {
      if (TP.on) stop(); apStop(); liveAllOff(); edClose(); hideMenu(); saveNow();
      dropAll(); S = s; UNDO.length = 0; V.rsel = ""; saveNow(); dirty();
      start(); S.tracks.forEach(t => prep(t)); loadSongAudio();
    }
    function songKeys(s) { return (s && s.tracks || []).flatMap(t => t.regions.filter(r => r.key).map(r => r.key)); }
    function songsSheet() {
      openSheet("My Songs", "kept on this device, and in your projects", box => {
        const top = gbEl("div", "gb-chips");
        top.append(btnE("+ New song", () => { switchSong(newSong()); closeSheet(); setView("browse"); }, "primary"), btnE("Export " + S.name, exportSheet));
        box.append(top);
        IDX.songs.forEach(e => {
          const cur = e.id === S.id, n = cur ? S.tracks.length : e.n;
          const r = row2(box, e.name, (cur ? "open now · " : "") + (n != null ? n + (n === 1 ? " track · " : " tracks · ") : "") + fmtT(e.t), cur);
          if (!cur) r.append(btnE("Open", () => { const s = readSong(e.id); if (!s) { gbSay("Couldn't open that song"); return; } switchSong(s); closeSheet(); setView(s.view || (s.tracks.length ? "tracks" : "browse")); }, "primary"));
          r.append(btnE("Rename", () => {
            const inp = document.createElement("input"); inp.className = "gb-in"; inp.value = e.name; inp.maxLength = 40; inp.setAttribute("aria-label", "Song name");
            const g = r.querySelector(".grow"); g.replaceChildren(inp); inp.focus(); inp.select();
            const done = () => { const v = inp.value.trim(); if (v) { e.name = v; if (cur) S.name = v; else { const s = readSong(e.id); if (s) { s.name = v; try { localStorage.setItem(GBP + e.id, JSON.stringify(s)); } catch (x) {} } } saveIdx(); if (cur) saveNow(); } reSheet(); };
            inp.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); inp.blur(); } });
            inp.addEventListener("blur", done, { once: true });
          }));
          r.append(btnE("Duplicate", () => {
            const s = cur ? JSON.parse(JSON.stringify(S)) : readSong(e.id); if (!s) return; saveNow();
            s.id = uid(); s.name = e.name + " copy"; try { localStorage.setItem(GBP + s.id, JSON.stringify(s)); } catch (x) { gbSay("No room for a copy on this device"); return; }
            IDX.songs.unshift({ id: s.id, name: s.name, t: Date.now(), n: s.tracks.length }); saveIdx(); reSheet();
          }));
          let sure = false; const del = btnE("Delete", () => {
            if (!sure) { sure = true; del.textContent = "Delete it?"; setTimeout(() => { sure = false; del.textContent = "Delete"; }, 3000); return; }
            const s = cur ? S : readSong(e.id), keys = songKeys(s);
            IDX.songs = IDX.songs.filter(x => x.id !== e.id); try { localStorage.removeItem(GBP + e.id); } catch (x) {}
            const others = new Set(IDX.songs.flatMap(x => songKeys(x.id === S.id && !cur ? S : readSong(x.id)))); keys.forEach(k => { if (!others.has(k)) idbDel(k); });
            if (cur) { const nx = IDX.songs[0] && readSong(IDX.songs[0].id); switchSong(nx || newSong()); setView(S.tracks.length ? "tracks" : "browse"); }
            saveIdx(); reSheet();
          });
          r.append(del);
        });
      });
    }
    // export: the song plays once from the top and Nate Bloom records what comes out (the effects and master included)
    const EXP = { st: "", t0: 0, timer: 0 };
    let GBNAME = "";
    { const tn = takeName; takeName = function () { return GBNAME || tn.apply(this, arguments); }; }
    function expStart() {
      if (take.rec) { gbSay("Nate Bloom's ● Rec is already recording: stop it first"); return; }
      start(); if (!ctx) return;
      if (TP.on) stop();
      apStop(); liveAllOff();
      TP.exp = { end: songEndBeat() + 2.2 / spb() }; EXP.st = "run"; EXP.t0 = ctx.currentTime;
      S.ph = 0; startTake(); play(false);
      clearInterval(EXP.timer); EXP.timer = setInterval(() => { if (EXP.st !== "run") { clearInterval(EXP.timer); return; } const el = $("gbExpT"); if (el) el.textContent = fmtClock(Math.max(0, ctx.currentTime - EXP.t0)) + " / " + fmtClock(TP.exp ? TP.exp.end * spb() : 0); }, 250);
      reSheet();
    }
    function expDone() { TP.exp = null; stop(); stopTake(); EXP.st = take.done ? "ready" : ""; S.ph = 0; placePh(); paintBar(); reSheet(); }
    function expCancel() { TP.exp = null; if (TP.on) stop(); if (take.rec) stopTake(); EXP.st = ""; reSheet(); }
    const fileName = () => (S.name || "song").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "song";
    function exportSheet() {
      if (!songEndBeat()) { gbSay("Record something first: the song is empty"); return; }
      openSheet("Export " + S.name, Math.round(songEndBeat() / S.sig) + " bars · " + fmtClock(songEndBeat() * spb()), box => {
        if (EXP.st === "run") {
          box.append(gbEl("p", "gb-p", "Playing the song through and recording it…"));
          const t = gbEl("p", "gb-p"); t.id = "gbExpT"; t.textContent = "0:00"; box.append(t);
          box.append(btnE("Cancel", expCancel));
          return;
        }
        if (EXP.st === "ready" && take.done) {
          box.append(gbEl("p", "gb-p", "Your song is ready (" + fmtClock(take.done.len / take.done.rate) + "). Save it:"));
          const c = gbEl("div", "gb-chips");
          const save = id => () => { GBNAME = fileName(); $(id).click(); setTimeout(() => { GBNAME = ""; }, 4000); };
          c.append(btnE("Save WAV", save("takeExport"), "primary"), btnE("Save MP3", save("takeMp3")), btnE("Bounce to a track", bounceTake, "", "Put the mix on a new audio track and mute the others"), btnE("Record it again", expStart));
          box.append(c); return;
        }
        box.append(gbEl("p", "gb-p", "The song plays once from the start while Nate Bloom records it: everything you hear goes in, the reverb and master included, the metronome left out. Then save it as a WAV (full quality) or an MP3 (small, for messages)."));
        box.append(btnE("Export now", expStart, "primary"));
      });
    }
    function helpSheet() {
      openSheet("How the Garage works", "a GarageBand-style studio", box => {
        [["Audio", "An audio track records the microphone, or Nate Bloom itself: pick Nate Bloom, press ●, and the Garage steps into a small bar so you can play the keys, pads, Beats or DJ while the song plays (it plays around the recording, not into it). Import audio adds WAV, MP3, M4A, AIFF or FLAC files. Tap an audio region for Gain & fades (and Normalize). Play along keeps the song going in the small bar while you play. + Automation adds a lane for a plugin's control: draw on it, or ● and turn the control. A track's Volume automation (in its sheet) records as you move its volume while the song plays. Bounce (after Export) puts the mix on a new track."], ["Instruments", "Each card makes a track: Keyboard (piano, organ, electric pianos), Drums (the kits from the Rhythm Creator), Smart Bass, Guitar and Strings (chord strips in the song's key, with Autoplay patterns), Synths (Nate Bloom's engines and presets), Your Plugins, the Sampler and the Audio Recorder. ◫ at the top left adds another."],
         ["Recording", "Press ● to record the selected track: one bar of count-in, then play. Each take becomes a region on the track, starting on a bar; recording over a region replaces that part, unless Merge recordings (in Song settings) or Cycle is on. MIDI keyboards and the computer keyboard record too."],
         ["Cycle", "In Tracks, ⟳ Cycle loops the yellow bars. Record in a cycle and each pass adds to the take, so you can build a drum part one sound at a time."],
         ["Tracks", "Tap a region for Edit, Cut, Copy, Paste, Duplicate, Loop, Split and Delete. Drag it to move it (onto another track too), drag its right edge to make it longer or shorter. Tap a track's name to select it, tap it again for its settings; its icon opens the instrument. M mutes, S solos."],
         ["Editing notes", "Edit (or double-tap a region) opens the piano roll: tap to add a note, drag a note to move it, drag its right end to change its length, double-tap to delete it. Drag empty space to scroll. Quantize snaps notes to the grid; Velocity sets how hard the selected notes play."],
         ["Musical Typing", "⌨ in the bar shows the computer keyboard as an instrument, as in GarageBand: A is middle C and the home row (A S D F G H J K L ; ') the white keys, W E T Y U O P the black keys; Z and X move an octave, C and V set how hard. With Smart chords, 1–8 play the chord strips; on drums A is the kick, S the snare, D the clap, F G H the hats, J K L the toms, ; and ' the cymbals, W the rim. Space plays and stops, R records, Return goes back to the start, Delete removes the selected region or notes."],
         ["Songs", "Songs stay on this device and go into your Nate Bloom projects. Songs (top left) makes, opens, renames and exports them: Export plays the song once and saves it as WAV or MP3."]].forEach(([h, t]) => { const p = gbEl("p", "gb-p"); p.append(gbEl("b", "", h + ": "), document.createTextNode(t)); box.append(p); });
      });
    }

    // ---------- the bar ----------
    $("gbPlay").addEventListener("click", () => { if (TP.exp) { expCancel(); return; } if (TP.on) stop(); else play(false); });
    $("gbRec").addEventListener("click", () => { if (TP.exp) return; if (TP.on && TP.rec) stop(); else play(true); });
    $("gbHome").addEventListener("click", () => { if (TP.exp) return; gbSeek(S.cyc.on ? S.cyc.a : 0); placePh(true); });
    $("gbMetro").addEventListener("click", () => { S.metro = !S.metro; saveSong(); paintBar(); });
    $("gbLcd").addEventListener("click", setSheet); $("gbSetBtn").addEventListener("click", setSheet);
    $("gbSongsBtn").addEventListener("click", songsSheet); $("gbMixBtn").addEventListener("click", mixSheet);
    $("gbLoopsBtn").addEventListener("click", loopsSheet); $("gbHelpBtn").addEventListener("click", helpSheet);
    $("gbBrowseBtn").addEventListener("click", () => setView("browse"));
    $("gbViewBtn").addEventListener("click", () => setView(S.view === "tracks" ? (curTr() ? "inst" : "browse") : "tracks"));
    function gbPut(json) {
      const keep = { id: S.id, view: S.view, zoom: S.zoom, ph: S.ph }, ids = new Set(S.tracks.map(t => t.id));
      S = Object.assign(fixSong(JSON.parse(json)), keep);
      ids.forEach(id => { if (!S.tracks.some(t => t.id === id)) { dropPlug(id); const N = AU.trk.get(id); if (N) { try { N.g.disconnect(); N.p.disconnect(); N.s.disconnect(); } catch (e) {} AU.trk.delete(id); } } });
      S.tracks.forEach(t => prep(t)); ED.sel.clear(); if (ED.open && !edFind()) edClose();
      dirty(); applyLevels(); saveSong(); setView(S.view); if (ED.open) { edHead(); edDraw(); }
      $("gbUndo").disabled = !UNDO.length;
    }
    $("gbUndo").addEventListener("click", () => { if (UNDO.length) gbPut(UNDO.pop()); });

    // ---------- the Garage tab ----------
    let FR = 0, frLast = 0;
    function frame() { if (!FR && V.open) FR = requestAnimationFrame(loop); }
    function loop(ts) {
      FR = 0; if (!V.open) return;
      if (ts - frLast >= (window.NB_LITE ? 50 : 30)) { frLast = ts; paintPos(); if (TP.on) placePh(); meter(); if (!TP.on && $("gbPlay").classList.contains("on")) paintBar(); }
      FR = requestAnimationFrame(loop);
    }
    function gbOpen() {
      start(); ensureSong();
      V.open = true; view.hidden = false; V.mini = false; { const mn = $("gbMini"); if (mn) mn.hidden = true; }
      S.tracks.forEach(t => prep(t)); loadSongAudio();
      setView(S.view === "inst" && !curTr() ? "browse" : (S.view || (S.tracks.length ? "tracks" : "browse")));
      frame();
    }
    function gbClose() {
      if (TP.exp) expCancel();
      if (TP.on) stop();
      apStop(); liveAllOff(); sustainOff(); if (SREC) sampRecStop();
      micMonitor(null, false); micClose(); edClose(); hideMenu();
      if (!sheet.hidden) { sheet.hidden = true; SH = null; }
      V.open = false; V.keys = null; view.hidden = true; saveNow();
      gbPlugsRest();
    }
    // (159) a closed Garage costs nothing: its tracks' plugin copies keep running otherwise. Their settings are kept on
    // the track and they load again when the Garage opens (prep).
    function gbPlugsRest() {
      try {
        [...AU.plug.keys()].forEach(id => {
          const P = AU.plug.get(id), tr = S && S.tracks.find(t => t.id === id);
          const done = () => { try { dropPlug(id); } catch (e) {} };
          if (P && P.node && tr && P.node.getState) Promise.resolve().then(() => P.node.getState()).then(st => { try { const j = JSON.stringify(st); if (j.length < 400000) { tr.pst = JSON.parse(j); saveNow(); } } catch (e) {} }).catch(() => {}).then(done);
          else done();
        });
      } catch (e) {}
    }
    $("gbDone").addEventListener("click", e => {
      if (!e.isTrusted) {   // (Back or Escape: what's open inside the Garage closes first)
        const g = $("wamGui"); if (g && !g.hidden) { __wam.closeGui(); return; }
        if (ED.open) { edClose(); renderTbar(); return; }
        if (V.menu) { hideMenu(); return; }
      }
      gbClose();
    });
    $("gbBtn").addEventListener("click", gbOpen);
    $("stopAll").addEventListener("click", () => { if (TP.exp) expCancel(); else if (TP.on) stop(); apStop(); liveAllOff(); });
    let rzT = 0;
    addEventListener("resize", () => { if (!V.open) return; clearTimeout(rzT); rzT = setTimeout(() => { if (S.view === "inst") renderInst(); else if (S.view === "tracks") renderTracks(); if (ED.open) { edSize(); edDraw(); } if (V.menu) showMenu(); }, 160); });
    // MIDI, the sustain pedal and the computer keyboard play the selected track while the Garage is open
    const gbKeys = () => V.open && sheet.hidden && curTr() && curTr().kind !== "audio";
    // (159) a note-off goes where its note-on went. Before, the Garage took every note-off while it was open, even
    // for a note that had gone to the keys (a sheet open, an audio track selected): that note never stopped.
    const GBN = new Map();   // note → the track it plays on
    window.__gbNotes = GBN;
    {
      const n0 = noteOn, f0 = noteOff, ns0 = nbSustain;
      noteOn = function (m) { if (gbKeys()) { const tr = curTr(); if (GBN.has(m)) { try { liveOff(GBN.get(m), m); } catch (e) {} } GBN.set(m, tr); liveOn(tr, m, clamp(NB_VEL, 0.05, 1)); lit(m, true); return; } return n0.apply(this, arguments); };
      noteOff = function (m) { if (GBN.has(m)) { const tr = GBN.get(m); GBN.delete(m); try { liveOff(tr, m); } catch (e) {} lit(m, false); if (!voices.has(m)) return; } return f0.apply(this, arguments); };
      nbSustain = function (on) { if (V.open) { if (on) sustain = true; else sustainOff(); if (V.susBtn) V.susBtn.setAttribute("aria-pressed", String(sustain)); } return ns0.apply(this, arguments); };
    }
    const KD = new Map();
    window.addEventListener("keydown", e => {
      if (!V.open || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target; if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
      if (!sheet.hidden) return;
      const code = e.code || "", tr = curTr(), stopIt = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (code === "Space") { stopIt(); if (!e.repeat) $("gbPlay").click(); return; }
      if (code === "KeyR") { stopIt(); if (!e.repeat) $("gbRec").click(); return; }   // (R records, as in GarageBand)
      if (code === "Enter" || code === "NumpadEnter" || code === "Home") { if (t && t.closest && t.closest("button")) return; stopIt(); $("gbHome").click(); return; }
      if (code === "Delete" || code === "Backspace") {
        if (ED.open && ED.sel.size) { stopIt(); edDelete(); return; }
        const f = findRegion(V.rsel); if (f && S.view === "tracks") { stopIt(); delRegion(f.tr, f.r); }
        return;
      }
      if (e.shiftKey || !tr || tr.kind === "audio") return;
      if (code === "KeyZ" || code === "KeyX") { stopIt(); if (!e.repeat && tr.kind !== "drums") mtOct(tr, code === "KeyX" ? 1 : -1); return; }
      if (code === "KeyC" || code === "KeyV") { stopIt(); if (!e.repeat) mtVel(code === "KeyV" ? 0.1 : -0.1); return; }
      if (SMART[tr.kind] && tr.mode !== "notes" && /^Digit[1-8]$/.test(code)) { stopIt(); if (e.repeat || KD.has(code)) return; KD.set(code, { chord: true }); chordDown(tr, +code.slice(5) - 1, "k" + code, MT.vel); mtLit(code, true); return; }
      const m = mtNote(tr, code); if (m == null) return;
      stopIt(); if (e.repeat || KD.has(code)) return;
      KD.set(code, { m, tr: tr.id }); liveOn(tr, m, MT.vel); lit(m, true); mtLit(code, true);
    }, true);
    window.addEventListener("keyup", e => {
      const code = e.code || "", k = KD.get(code); if (!k) return; KD.delete(code); e.stopImmediatePropagation(); mtLit(code, false);
      if (k.chord) chordUp("k" + code); else { const tr = trById(k.tr); if (tr) liveOff(tr, k.m); lit(k.m, false); }
    }, true);
    addEventListener("blur", () => { KD.forEach((k, code) => { if (k.chord) chordUp("k" + code); else { const tr = trById(k.tr); if (tr) liveOff(tr, k.m); } }); KD.clear(); });
    // ======================================================================
    // 127: what Tracks did, in the Garage
    // ======================================================================
    // ---- the audio track's source: the microphone or Nate Bloom ----
    function inSw(tr) {
      const sw = gbEl("div", "gb-chips gb-insw");
      [["mic", "Microphone"], ["nb", "Nate Bloom"]].forEach(([v, t]) => { const b = btnE(t, () => { if ((tr.input || "mic") === v) return; gbDo(); tr.input = v; if (v === "nb") { micMonitor(null, false); } saveSong(); renderInst(); }); b.setAttribute("aria-pressed", String((tr.input || "mic") === v)); sw.append(b); });
      return sw;
    }
    function nbUI(box, tr) {
      const w = gbEl("div", "gb-audio");
      w.append(inSw(tr));
      w.append(gbEl("div", "big", "Record Nate Bloom"));
      w.append(gbEl("div", "gb-tip", "Press ● and play: the Garage steps into a small bar at the bottom so you can play the keys, pads, Beats or the DJ while the song plays. Everything you play goes onto this track, lined up with the song; the song itself plays around the recording, not into it. ■ in the small bar stops."));
      const row = gbEl("div", "gb-row3");
      row.append(btnE("● Record now", () => play(true), "primary"), btnE("Import an audio file…", () => importPick(tr)));
      w.append(row);
      const takes = tr.regions.length; w.append(gbEl("div", "gb-tip", takes ? takes + (takes === 1 ? " take" : " takes") + " on this track." : "No takes yet."));
      box.append(w);
    }
    const NBR = { proc: null, mute: null, L: [], R: [], len: 0, t0: null };
    function nbRecStart(tr) {
      if (!B || !B.betaOut || !B.trackBus) { gbSay("Recording Nate Bloom isn't available here"); return; }
      AU.nb = B.trackBus; gbOut(); applyLevels();
      AU.trk.forEach(N => { try { N.s.disconnect(); } catch (e) {} }); AU.vin = null;   // (the shared hall would carry the song into the take)
      const proc = ctx.createScriptProcessor(4096, 2, 2), mute = ctx.createGain(); mute.gain.value = 0;
      NBR.L = []; NBR.R = []; NBR.len = 0; NBR.t0 = null; NBR.full = false;
      proc.onaudioprocess = e => {
        if (!TP.on || !TP.rec) return;
        const ib = e.inputBuffer, n = ib.length, tEnd = ctx.currentTime, tStart = tEnd - n / ctx.sampleRate;
        if (tEnd < TP.t0 - 0.05) return;   // (still counting in)
        if (NBR.t0 == null) NBR.t0 = tStart;
        NBR.L.push(new Float32Array(ib.getChannelData(0))); NBR.R.push(new Float32Array(ib.numberOfChannels > 1 ? ib.getChannelData(1) : ib.getChannelData(0))); NBR.len += n;
        if (NBR.len >= ctx.sampleRate * GB_MAX_REC_SEC && !NBR.full) { NBR.full = true; recFull(); }
      };
      B.betaOut.connect(proc); proc.connect(mute).connect(ctx.destination); NBR.proc = proc; NBR.mute = mute;
      gbMini(true);
      gbSay("Recording Nate Bloom into " + tr.name + ": play, then ■");
    }
    async function nbRecFinish(tr, bStop) {
      try { B.betaOut.disconnect(NBR.proc); NBR.proc.disconnect(); NBR.mute.disconnect(); } catch (e) {}
      NBR.proc = null; AU.nb = null; gbOut(); applyLevels();
      const L = NBR.L, R = NBR.R, total = NBR.len, t0 = NBR.t0; NBR.L = []; NBR.R = []; NBR.len = 0; NBR.t0 = null;
      if (!total || t0 == null) return;
      const sr = ctx.sampleRate, buf = ctx.createBuffer(2, total, sr), dl = buf.getChannelData(0), dr = buf.getChannelData(1); let o = 0;
      L.forEach((c, i) => { dl.set(c, o); dr.set(R[i], o); o += c.length; });
      L.length = 0; R.length = 0;   // (the take is in the buffer now: let the pieces go before the WAV copy is made)
      // you play to what you hear, which reaches you a little late: line the take up with the song
      const lat = (ctx.outputLatency || ctx.baseLatency || 0.02) + 4096 / sr;
      const a = REC.b0, off = Math.max(0, timeAt(a) - (t0 - lat));
      if (buf.duration - off < 0.15) { gbSay("That take was too short to keep"); return; }
      const endB = REC.cyc ? Math.min(bStop, REC.cyc.b) : bStop, len = Math.max(0.5, Math.min(endB - a, (buf.duration - off) / spb()));
      const key = "gb:" + S.id + ":" + uid();
      ABUF.set(key, buf); gbDo();
      placeRegion(tr, { id: uid(), start: a, len: +len.toFixed(4), rep: 1, key, off: +off.toFixed(4), dur: buf.duration, name: "Nate Bloom take" }, false);
      fitLen(); dirty(); saveSong();
      gbSay("Recorded " + (buf.duration - off).toFixed(1) + " s of Nate Bloom into " + tr.name);
      if (V.open && S.view === "tracks") renderTracks();
      try { const wav = bufferToWav(buf); await idbPut(key, { name: tr.name + " take", data: wav instanceof Blob ? await wav.arrayBuffer() : wav }); } catch (e) { gbSay("Couldn't keep the recording: storage is full"); }
    }

    // ---- audio files ----
    let impIn = null, impTr = null;
    function importPick(tr) {
      start(); impTr = tr ? tr.id : null;
      if (!impIn) { impIn = document.createElement("input"); impIn.type = "file"; impIn.multiple = true; impIn.accept = "audio/*,.wav,.mp3,.m4a,.aif,.aiff,.flac,.ogg"; impIn.hidden = true; document.body.append(impIn);
        impIn.addEventListener("change", () => { const fs = [...impIn.files]; impIn.value = ""; if (fs.length) importFiles(fs, impTr); }); }
      impIn.click();
    }
    async function importFiles(files, trId) {
      start(); if (!ctx) return 0; ensureSong();
      let n = 0, first = trId ? trById(trId) : null; const at = Math.max(0, S.ph || 0);
      for (const f of files) {
        let data, buf; try { data = await f.arrayBuffer(); buf = await decode(data.slice(0)); } catch (e) { gbSay("Couldn't read " + f.name); continue; }
        if (!buf) continue;
        const name = (f.name || "Audio").replace(/\.[^.]+$/, "").slice(0, 40);
        let tr = first && first.kind === "audio" ? first : null; first = null;
        if (!tr) { tr = addTrack("audio", { stay: true }); if (!tr) break; tr.name = name; tr.input = "nb"; tr.rv = 0; } else gbDo();
        const key = "gb:" + S.id + ":" + uid(); ABUF.set(key, buf);
        placeRegion(tr, { id: uid(), start: at, len: +(buf.duration / spb()).toFixed(4), rep: 1, key, off: 0, dur: buf.duration, name }, false);
        try { await idbPut(key, { name, data }); } catch (e) { gbSay("Couldn't keep " + name + ": storage is full"); }
        n++;
      }
      if (n) { fitLen(); dirty(); saveSong(); if (!V.open && !V.mini) gbOpen(); setView("tracks"); gbSay("Imported " + n + (n > 1 ? " files" : " file") + " at the playhead"); }
      return n;
    }
    // audio from elsewhere in Nate Bloom (a take, the DJ's mashup, Beat Pads): onto audio tracks
    async function storeBuf(key, buf, name) { try { const wav = bufferToWav(buf); await idbPut(key, { name, data: wav instanceof Blob ? await wav.arrayBuffer() : wav }); } catch (e) { gbSay("Couldn't keep " + name + ": storage is full"); } }
    function gbAudioIn(items, opt = {}) {
      start(); if (!ctx || !items.length) return null;
      if (V.open && TP.on) stop();
      ensureSong();
      if (opt.bpm) {
        const bpm = clamp(Math.round(opt.bpm), 40, 240);
        if (S.tracks.some(t => t.regions.length) && bpm !== S.bpm) { const ns = newSong(opt.song || "Song"); ns.bpm = bpm; switchSong(ns); }
        else if (bpm !== S.bpm) { gbDo(); S.bpm = bpm; }
      }
      const keys = new Map(), byTrack = new Map();
      for (const it of items) {
        let key = keys.get(it.buf); if (!key) { key = "gb:" + S.id + ":" + uid(); keys.set(it.buf, key); ABUF.set(key, it.buf); storeBuf(key, it.buf, it.name); }
        const tn = it.track || it.name; let tr = byTrack.get(tn);
        if (!tr) { tr = addTrack("audio", { stay: true }); if (!tr) break; tr.name = tn.slice(0, 40); tr.input = "nb"; tr.rv = 0; byTrack.set(tn, tr); }
        const off = it.off || 0, dur = it.dur != null ? it.dur : it.buf.duration - off;
        tr.regions.push({ id: uid(), start: +(Math.max(0, it.start || 0) / spb()).toFixed(4), len: +(Math.max(0.05, dur) / spb()).toFixed(4), rep: 1, key, off: +off.toFixed(4), dur: it.buf.duration, name: it.label || it.name });
      }
      if (!byTrack.size) { gbSay("A song holds 32 tracks"); return null; }
      byTrack.forEach(tr => tr.regions.sort((a, b) => a.start - b.start));
      S.view = "tracks"; fitLen(); dirty(); saveNow();
      if (opt.open !== false) { if (!V.open) gbOpen(); setView("tracks"); }
      if (opt.say) setTimeout(() => gbSay(opt.say), 400);
      return { song: S.id, tracks: [...byTrack.values()].map(t => t.id) };
    }
    function bounceTake() {
      const d = take.done; if (!d) return;
      const buf = new AudioBuffer({ length: d.len, numberOfChannels: 2, sampleRate: d.rate }), L = buf.getChannelData(0), R = buf.getChannelData(1); let o = 0;
      for (let c = 0; c < d.L.length; c++) { const l = d.L[c], r = d.R[c]; for (let i = 0; i < l.length && o < d.len; i++, o++) { L[o] = l[i] / 32767; R[o] = r[i] / 32767; } }
      const others = S.tracks.slice(), res = gbAudioIn([{ buf, name: "Bounce", start: 0 }], { open: false });
      if (!res) return;
      others.forEach(t => { t.mute = true; }); applyLevels(); saveSong(); closeSheet(); setView("tracks");
      gbSay("Bounced to a new track; the others are muted");
    }

    // ---- Gain & fades ----
    function clipSheet(tr, r) {
      const buf = ABUF.get(r.key), L = () => Math.min(r.len * spb(), buf ? buf.duration - (r.off || 0) : r.len * spb());
      openSheet("Gain & fades", (r.name || tr.name) + " · " + L().toFixed(1) + " s", box => {
        const dB = g => (g < 0.0005 ? "−∞" : (20 * Math.log10(g) >= 0 ? "+" : "") + (20 * Math.log10(g)).toFixed(1)) + " dB";
        let row = row2(box, "", ""); row.firstChild.remove();
        slider(row, "Gain", -30, 12, 0.5, Math.round(20 * Math.log10(r.g != null ? r.g : 1) * 2) / 2, v => (v >= 0 ? "+" : "") + v.toFixed(1) + " dB", v => { r.g = Math.pow(10, v / 20); dirty(); });
        const mx = () => Math.max(0.05, Math.min(10, L() / 2));
        row = row2(box, "", ""); row.firstChild.remove();
        slider(row, "Fade in", 0, mx(), 0.01, Math.min(r.fi || 0, mx()), v => v.toFixed(2) + " s", v => { r.fi = v; dirty(); });
        row = row2(box, "", ""); row.firstChild.remove();
        slider(row, "Fade out", 0, mx(), 0.01, Math.min(r.fo || 0, mx()), v => v.toFixed(2) + " s", v => { r.fo = v; dirty(); });
        const acts = gbEl("div", "gb-chips");
        acts.append(btnE("Normalize", () => {
          if (!buf) return; const a = Math.floor((r.off || 0) * buf.sampleRate), b = Math.min(buf.length, a + Math.floor(L() * buf.sampleRate)); let pk = 0;
          for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = a; i < b; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > pk) pk = v; } }
          if (pk < 1e-5) { gbSay("That region is silent"); return; }
          gbDo(); r.g = Math.min(Math.pow(10, 1.2), 0.98 / pk); dirty(); saveSong(); reSheet(); gbSay("Normalized: the loudest moment now peaks just under 0 dB (" + dB(r.g) + ")");
        }, "", "Turn it up or down so its loudest moment peaks just under 0 dB"));
        acts.append(btnE("Reset", () => { gbDo(); r.g = 1; r.fi = 0; r.fo = 0; dirty(); saveSong(); reSheet(); }));
        box.append(acts);
        box.append(gbEl("p", "gb-tip", "The fades shape every time the region plays (each loop of a looped region too)."));
      });
    }

    // ---- volume automation: a curve per track, recorded by moving its volume while the song plays ----
    const VA = { touch: new Set(), last: new Map(), timers: new Map(), beat: false };
    const vaLvl = (tr, v) => (tr.mute || (soloOn() && !tr.solo)) ? 0 : Math.pow(clamp(v, 0, 1.2), 2) * 1.25;
    const vaOn = tr => !!(tr.va && tr.va.on && tr.va.pts && tr.va.pts.length);
    function vaAt(tr, b) {
      const P = tr.va.pts; if (b <= P[0][0]) return P[0][1];
      for (let i = 1; i < P.length; i++) if (b <= P[i][0]) { const [b0, v0] = P[i - 1], [b1, v1] = P[i]; return b1 > b0 ? v0 + (v1 - v0) * (b - b0) / (b1 - b0) : v1; }
      return P[P.length - 1][1];
    }
    function vaSchedOne(tr, b, t, P, sp) {
      try { P.cancelScheduledValues(t); } catch (e) {}
      P.setValueAtTime(vaLvl(tr, vaAt(tr, b)), t);
      for (const [pb, v] of tr.va.pts) if (pb > b) P.linearRampToValueAtTime(vaLvl(tr, v), t + (pb - b) * sp);
    }
    function vaSched(b, t) {
      if (!ctx || !S) return;
      S.tracks.forEach(tr => { if (!vaOn(tr) || VA.touch.has(tr.id)) return; const N = tNode(tr); if (N) vaSchedOne(tr, b, Math.max(t, ctx.currentTime), N.g.gain, spb()); });
    }
    function vaRest() { if (!ctx || !S) return; const now = ctx.currentTime; S.tracks.forEach(tr => { const N = AU.trk.get(tr.id); if (N && vaOn(tr)) { try { N.g.gain.cancelScheduledValues(now); } catch (e) {} } }); applyLevels(); }
    { const al = applyLevels; applyLevels = function () { const r = al.apply(this, arguments); try { if (TP.on && ctx) vaSched(beatAt(ctx.currentTime), ctx.currentTime); } catch (e) {} return r; }; }
    function vaTouch(tr, v) {
      if (!tr.va || !tr.va.on || !TP.on || !ctx) return;
      const now = Math.round(beatAt(ctx.currentTime) * 1000) / 1000;
      const P = tr.va.pts, from = VA.touch.has(tr.id) ? (VA.last.get(tr.id) ?? now) : now - 0.05;
      if (!VA.touch.has(tr.id)) { VA.touch.add(tr.id); const N = AU.trk.get(tr.id); if (N) { try { N.g.gain.cancelScheduledValues(ctx.currentTime); } catch (e) {} N.g.gain.setTargetAtTime(vaLvl(tr, v), ctx.currentTime, 0.02); } }
      for (let i = P.length - 1; i >= 0; i--) if (P[i][0] > from && P[i][0] <= now + 0.001) P.splice(i, 1);
      P.push([now, Math.round(v * 1000) / 1000]); P.sort((a, b) => a[0] - b[0]); VA.last.set(tr.id, now);
      clearTimeout(VA.timers.get(tr.id));
      VA.timers.set(tr.id, setTimeout(() => { VA.touch.delete(tr.id); VA.last.delete(tr.id); if (TP.on && ctx) { const N = tNode(tr); if (N && vaOn(tr)) vaSchedOne(tr, beatAt(ctx.currentTime), ctx.currentTime, N.g.gain, spb()); } saveSong(); }, 450));
    }
    function vaRow(box, tr) {
      const on = !!(tr.va && tr.va.on), n = tr.va && tr.va.pts ? tr.va.pts.length : 0;
      const r = row2(box, "Volume automation", on ? (n ? n + " points · move Volume while the song plays to record over them" : "move Volume while the song plays to record it") : (n ? "off (the curve is kept)" : "off"));
      const b = btnE(on ? "On" : "Off", () => { gbDo(); tr.va = tr.va || { on: false, pts: [] }; tr.va.on = !tr.va.on; if (tr.va.on && !tr.va.pts.length) tr.va.pts = [[0, tr.vol]]; saveSong(); applyLevels(); reSheet(); });
      b.setAttribute("aria-pressed", String(on)); r.append(b);
      if (n) r.append(btnE("Clear", () => { gbDo(); tr.va.pts = []; tr.va.on = false; saveSong(); applyLevels(); reSheet(); }));
    }
    function vaDraw(ln, tr, P, RH, W) {
      if (!vaOn(tr)) return;
      const H = RH - 2, y = v => (1 - clamp(v, 0, 1.2) / 1.2) * (H - 10) + 5, pts = tr.va.pts;
      const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), pl = document.createElementNS(NS, "polyline");
      svg.setAttribute("class", "gb-va"); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      pl.setAttribute("points", [[0, y(pts[0][1])]].concat(pts.map(([b, v]) => [b * P, y(v)]), [[W, y(pts[pts.length - 1][1])]]).map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "));
      svg.append(pl); ln.append(svg);
    }

    // ---- lanes for plugin controls ----
    function laneAt(L, b) {
      const P = L.pts; if (!P.length) return null; if (b <= P[0][0]) return P[0][1];
      for (let i = 1; i < P.length; i++) if (b <= P[i][0]) { const [b0, v0] = P[i - 1], [b1, v1] = P[i]; return b1 > b0 ? v0 + (v1 - v0) * (b - b0) / (b1 - b0) : v1; }
      return P[P.length - 1][1];
    }
    const LN = { timer: 0, poll: 0, sent: new Map() };
    function laneTick() {
      if (!TP.on || !ctx || !S || !window.__wl) return;
      const b = beatAt(ctx.currentTime);
      (S.lanes || []).forEach(L => { if (!L.on || L.rec || !L.pts.length) return; const v = laneAt(L, b); if (v == null) return; const last = LN.sent.get(L.id); if (last == null || Math.abs(last - v) > 0.002) { if (__wl.set(L.ref, L.pid, v)) LN.sent.set(L.id, v); } });
    }
    async function laneRec() {
      if (!TP.on || !ctx || !S || !window.__wl) return;
      for (const L of S.lanes || []) {
        if (!L.rec) continue;
        const v = await __wl.get(L.ref, L.pid); if (v == null || !TP.on) continue;
        const pos = Math.round(beatAt(ctx.currentTime) * 1000) / 1000, vv = Math.round(v * 1000) / 1000;
        if (L._lr == null) { gbDo(); L._lr = pos - 0.001; L._lp = -9; L._lv = null; L._pp = pos; }
        L.pts = L.pts.filter(q => !(q[0] > L._lr && q[0] <= pos + 0.0005));
        if (L._lv == null || Math.abs(vv - L._lv) > 0.003 || pos - L._lp > 2) { if (L._lv != null && L._pp > L._lp + 0.001) L.pts.push([L._pp, L._lv]); L.pts.push([pos, vv]); L._lp = pos; L._lv = vv; }
        L.pts.sort((a, b) => a[0] - b[0]); L._lr = pos; L._pp = pos;
        laneDraw(L);
      }
    }
    function laneRun() {
      clearInterval(LN.timer); clearInterval(LN.poll); LN.timer = LN.poll = 0;
      (S && S.lanes || []).forEach(L => { if (L._lr != null) { if (L._lv != null) L.pts.push([Math.round(L._lr * 1000) / 1000 + 0.001, L._lv]); L._lr = null; saveSong(); } });
      if (!TP.on || !S || !(S.lanes || []).length) return;
      LN.sent.clear(); LN.timer = setInterval(laneTick, 30); laneTick();
      if (S.lanes.some(L => L.rec)) LN.poll = setInterval(laneRec, 70);
    }
    { let was = false; setInterval(() => { if (TP.on !== was) { was = TP.on; laneRun(); } }, 60); }
    function laneDraw(L) {
      const svg = document.querySelector('#gbTlin .gb-alane[data-lane="' + L.id + '"] svg'); if (!svg) return;
      const W = +svg.getAttribute("width"), H = +svg.getAttribute("height"), P = PXB(), y = v => (1 - v) * (H - 10) + 5, pts = L.pts;
      svg.querySelector("polyline").setAttribute("points", pts.length ? [[0, y(pts[0][1])]].concat(pts.map(([b, v]) => [b * P, y(v)]), [[W, y(pts[pts.length - 1][1])]]).map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ") : "");
      const hint = svg.parentNode.querySelector(".gb-ahint"); if (hint) hint.hidden = !!pts.length;
    }
    function laneRows(inn, P, HW, W, RH) {
      (S.lanes || []).forEach(L => {
        const H = Math.round(RH * 0.8), row = gbEl("div", "gb-row gb-arow" + (L.on ? "" : " off")); row.style.height = H + "px";
        const hd = gbEl("div", "gb-head gb-ahead"); hd.style.width = HW + "px";
        const hn = gbEl("div", "hn"); hn.append(gbEl("b", "", L.name), gbEl("small", "", "automation")); hd.append(hn);
        const ms = gbEl("div", "ms"), rB = gbEl("button", "r", "●"), aB = gbEl("button", "a", "A"), xB = gbEl("button", "x", "✕");
        rB.setAttribute("aria-pressed", String(!!L.rec)); rB.title = "Record: turn the control while the song plays"; rB.setAttribute("aria-label", "Record " + L.name);
        aB.setAttribute("aria-pressed", String(!!L.on)); aB.title = "Automation on or off"; aB.setAttribute("aria-label", "Automation on or off");
        xB.title = "Remove this lane"; xB.setAttribute("aria-label", "Remove " + L.name);
        rB.addEventListener("click", e => { e.stopPropagation(); L.rec = !L.rec; rB.setAttribute("aria-pressed", String(L.rec)); saveSong(); laneRun(); gbSay(L.rec ? "● " + L.name + ": play the song and turn the control; the lane records it" : L.name + ": recording off"); });
        aB.addEventListener("click", e => { e.stopPropagation(); gbDo(); L.on = !L.on; aB.setAttribute("aria-pressed", String(L.on)); row.classList.toggle("off", !L.on); saveSong(); });
        xB.addEventListener("click", e => { e.stopPropagation(); gbDo(); S.lanes = S.lanes.filter(x => x !== L); saveSong(); renderTracks(); gbSay("Removed " + L.name + " (Undo brings it back)"); });
        ms.append(rB, aB, xB); hd.append(ms);
        const ln = gbEl("div", "gb-lane gb-alane"); ln.style.width = W + "px"; ln.dataset.lane = L.id;
        const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"); svg.setAttribute("width", W); svg.setAttribute("height", H - 2); svg.setAttribute("viewBox", "0 0 " + W + " " + (H - 2)); svg.append(document.createElementNS(NS, "polyline"));
        const hint = gbEl("span", "gb-ahint", "Draw " + L.name + "'s moves here, or ● and turn it while the song plays"); ln.append(svg, hint);
        let d = null;
        const at = e => { const r = ln.getBoundingClientRect(); return [Math.max(0, (e.clientX - r.left) / P), clamp(1 - (e.clientY - r.top - 5) / (r.height - 10), 0, 1)]; };
        ln.addEventListener("pointerdown", e => {
          if (e.button > 0) return; e.preventDefault(); e.stopPropagation(); try { ln.setPointerCapture(e.pointerId); } catch (x) {}
          gbDo(); const [b, v] = at(e); d = { id: e.pointerId, b };
          L.pts = L.pts.filter(q => Math.abs(q[0] - b) > 0.05); L.pts.push([Math.round(b * 1000) / 1000, Math.round(v * 1000) / 1000]); L.pts.sort((x, y) => x[0] - y[0]); laneDraw(L);
          if (!TP.on && window.__wl) __wl.set(L.ref, L.pid, v);
        });
        ln.addEventListener("pointermove", e => {
          if (!d || e.pointerId !== d.id) return;
          const [b, v] = at(e), a0 = Math.min(d.b, b), b0 = Math.max(d.b, b);
          L.pts = L.pts.filter(q => !(q[0] > a0 + 0.002 && q[0] < b0 - 0.002) && Math.abs(q[0] - b) > 0.002); L.pts.push([Math.round(b * 1000) / 1000, Math.round(v * 1000) / 1000]); L.pts.sort((x, y) => x[0] - y[0]);
          d.b = b; laneDraw(L); if (!TP.on && window.__wl) __wl.set(L.ref, L.pid, v);
        });
        const up = e => { if (!d || e.pointerId !== d.id) return; d = null; saveSong(); };
        ln.addEventListener("pointerup", up); ln.addEventListener("pointercancel", up);
        row.append(hd, ln); inn.append(row);
        requestAnimationFrame(() => laneDraw(L));
      });
    }
    function laneAdd() {
      start(); if (!window.__wl || !__wl.pick) return;
      __wl.pick("Automate a plugin control", "Pick the control. Then draw its moves on the lane, or press ● on the lane and turn the control while the song plays.", async c => {
        const v = await __wl.get(c.ref, c.pid);
        gbDo(); S.lanes = S.lanes || [];
        S.lanes.push({ id: "al" + uid(), ref: c.ref, pid: c.pid, name: c.name, on: true, rec: false, pts: v == null ? [] : [[0, Math.round(v * 1000) / 1000]] });
        saveSong(); if (V.open) setView("tracks"); laneRun(); gbSay("Added " + c.name + ": draw on its lane, or ● and turn it while the song plays");
      });
    }

    // ---- the Seq beat along with the song ----
    function beatAlong(on) {
      if (on) { if (S && S.beat && !playing && !TP.exp) { setBpm(S.bpm); startSeq(); VA.beat = true; } }
      else if (VA.beat) { VA.beat = false; if (playing) stopSeq(); }
    }

    // ---- Play along: the song keeps going in a small bar ----
    const mini = $("gbMini");
    function gbMini(on) {
      if (!mini) return;
      if (on) {
        if (TP.exp) return;
        if (!sheet.hidden) { sheet.hidden = true; SH = null; }
        edClose(); hideMenu(); liveAllOff(); apStop();
        V.open = false; V.keys = null; view.hidden = true; V.mini = true; mini.hidden = false; miniPaint();
      } else { V.mini = false; mini.hidden = true; }
    }
    function playAlong() { start(); if (!TP.on) play(false); gbMini(true); }
    function miniPaint() {
      if (!mini || mini.hidden || !S) return;
      const p = $("gbMiniPlay"), r = $("gbMiniRec"), t = $("gbMiniPos"), tr = curTr();
      p.textContent = TP.on && !TP.rec ? "■" : "▶"; p.setAttribute("aria-label", TP.on ? "Stop the song" : "Play the song");
      r.hidden = !(tr && tr.kind === "audio" && tr.input === "nb"); r.classList.toggle("on", !!TP.rec); r.textContent = TP.rec ? "■ Stop" : "●";
      const b = Math.max(0, beatNow()); t.textContent = (Math.floor(b / S.sig) + 1) + " . " + (Math.floor(b % S.sig) + 1);
      mini.classList.toggle("rec", !!TP.rec);
    }
    if (mini) {
      $("gbMiniPlay").addEventListener("click", () => { start(); if (TP.on) stop(); else play(false); miniPaint(); });
      $("gbMiniRec").addEventListener("click", () => { start(); if (TP.rec) stop(); else play(true); miniPaint(); });
      $("gbMiniOpen").addEventListener("click", () => gbOpen());
      $("gbMiniX").addEventListener("click", () => { if (TP.on) stop(); gbMini(false); });
      setInterval(() => { if (V.mini) miniPaint(); }, 200);
    }

    // ---- stems: one WAV per audio track, rendered offline ----
    async function audioStems() {
      ensureSong();
      const trs = S.tracks.filter(t => t.kind === "audio" && t.regions.length); if (!trs.length) return [];
      await Promise.all(trs.flatMap(t => t.regions.map(r => loadAudio(r.key))));
      const rate = (ctx && ctx.sampleRate) || 44100, sp = spb(), end = songEndBeat() * sp + 0.5, out = [];
      for (const tr of trs) {
        const oc = new OfflineAudioContext(2, Math.ceil(end * rate), rate), g = oc.createGain(), p = oc.createStereoPanner();
        g.gain.value = Math.pow(clamp(tr.vol, 0, 1.2), 2) * 1.25; p.pan.value = clamp(tr.pan, -1, 1); g.connect(p).connect(oc.destination);
        if (vaOn(tr)) vaSchedOne(Object.assign({}, tr, { mute: false, solo: true }), 0, 0, g.gain, sp);
        tr.regions.forEach(r => { const buf = ABUF.get(r.key); if (!buf) return; for (let k = 0; k < (r.rep || 1); k++) {
          const t0 = (r.start + k * r.len) * sp, L = Math.min(r.len * sp, buf.duration - (r.off || 0)); if (L <= 0.01) continue;
          const s = oc.createBufferSource(); s.buffer = buf; const G = oc.createGain(); clipEnv(G.gain, r, L, 0, t0, L); s.connect(G).connect(g); s.start(t0, r.off || 0, L);
        } });
        out.push({ name: tr.name, buf: await oc.startRendering() });
      }
      return out;
    }

    // ---- what was in Tracks becomes a Garage song (once) ----
    function migrateTracks() {
      let flag = null; try { flag = localStorage.getItem("nightbloom-trk2gb"); } catch (e) {}
      if (flag) return null;
      let o = null, lanes = [];
      try { o = JSON.parse(localStorage.getItem("nightbloom-tracks") || "null"); } catch (e) {}
      try { lanes = JSON.parse(localStorage.getItem("nightbloom-trklanes") || "[]") || []; } catch (e) {}
      const clips = o && Array.isArray(o.clips) ? o.clips.filter(c => c && c.audio && c.dur > 0) : [];
      lanes = Array.isArray(lanes) ? lanes.filter(L => L && L.ref && L.pid && Array.isArray(L.pts)) : [];
      if (!clips.length && !lanes.length) { try { localStorage.setItem("nightbloom-trk2gb", "none"); } catch (e) {} return null; }
      const bpm = clamp(Math.round((state && state.seq && state.seq.bpm) || 100), 40, 240), sp = 60 / bpm, gv = v => Math.sqrt(clamp(+v || 0, 0, 1.8) / 1.25);
      const song = newSong("Tracks"); song.bpm = bpm; song.view = "tracks";
      (o && o.tracks || []).forEach(t => {
        const cs = clips.filter(c => c.track === t.id).sort((a, b) => a.start - b.start);
        const hasAuto = t.auto && Array.isArray(t.auto.pts) && t.auto.pts.length;
        if (!cs.length && !hasAuto) return;
        const rows = [];   // (clips that overlap go on a second track, so each still plays as before)
        cs.forEach(c => { let R = rows.find(x => x.end <= c.start + 1e-6); if (!R) { R = { end: 0, cs: [] }; rows.push(R); } R.cs.push(c); R.end = c.start + c.dur; });
        if (!rows.length) rows.push({ cs: [] });
        rows.forEach((R, k) => {
          if (song.tracks.length >= 32) return;
          const tr = { id: uid(), kind: "audio", name: ((t.name || "Track") + (k ? " (" + (k + 1) + ")" : "")).slice(0, 40), snd: defaultSound("audio"), vol: gv(t.vol != null ? t.vol : 0.8), pan: clamp(+t.pan || 0, -1, 1), mute: !!t.mute, solo: !!t.solo, oct: 0, auto: 0, p: null, mode: "", rv: 0, input: t.input === "mic" ? "mic" : "nb", regions: [] };
          R.cs.forEach(c => tr.regions.push({ id: uid(), start: +(c.start / sp).toFixed(4), len: +(c.dur / sp).toFixed(4), rep: 1, key: "trk:" + c.audio, off: +(c.offset || 0), dur: +(c.offset || 0) + c.dur, name: c.name || tr.name, g: c.gain != null ? c.gain : 1, fi: c.fadeIn || 0, fo: c.fadeOut || 0 }));
          if (hasAuto && !k) tr.va = { on: !!t.auto.on, pts: t.auto.pts.map(([tt, v]) => [+(tt / sp).toFixed(4), +gv(v).toFixed(3)]) };
          song.tracks.push(tr);
        });
      });
      song.lanes = lanes.map(L => ({ id: L.id || "al" + uid(), ref: L.ref, pid: L.pid, name: L.name || "Plugin control", on: L.on !== false, rec: false, pts: L.pts.map(([tt, v]) => [+(tt / sp).toFixed(4), v]) }));
      let e = 0; song.tracks.forEach(t => t.regions.forEach(r => { e = Math.max(e, r.start + r.len); }));
      song.bars = Math.max(8, Math.ceil(e / song.sig / 4 - 1e-6) * 4);
      try {
        localStorage.setItem(GBP + song.id, JSON.stringify(song));
        IDX.songs.unshift({ id: song.id, name: song.name, t: Date.now(), n: song.tracks.length }); if (!IDX.cur || !readSong(IDX.cur)) IDX.cur = song.id; saveIdx();
        localStorage.setItem("nightbloom-trk2gb", song.id);
      } catch (e2) { return null; }
      return song.id;
    }
    { const mid = migrateTracks(); if (mid) setTimeout(() => gbSay("What was in Tracks is now a song in the Garage, called Tracks"), 2500); }
    window.__gbAudio = gbAudioIn; window.__gbSay = gbSay;
    // Capture (Live, 136): what was just played, as a new track in the current song
    function gbCapture(o) {
      start(); if (!ctx || !o || !Array.isArray(o.notes) || !o.notes.length) return null; ensureSong();
      if (!S.tracks.some(t => t.regions.length) && o.bpm) S.bpm = clamp(Math.round(o.bpm), 40, 240);
      const k = S.tracks.filter(t => /^Capture \d+$/.test(t.name)).length;
      const tr = addTrack(KIND[o.kind] ? o.kind : "synth", { stay: true }); if (!tr) return null;
      tr.name = "Capture " + (k + 1);
      if (o.snd) { tr.snd = o.snd; try { prep(tr); } catch (e) {} }
      const sig = S.sig || 4, len = Math.max(sig, Math.ceil((+o.len || sig) / sig - 1e-6) * sig);
      placeRegion(tr, { id: uid(), start: 0, len, rep: 1, notes: o.notes.map(n => n.slice(0, 4)) }, false);
      fitLen(); dirty(); saveSong();
      if (V.open) { try { if (S.view === "tracks") renderTracks(); paintBar(); } catch (e) {} }
      return { song: S.name, track: tr.name, bars: len / sig, notes: o.notes.length };
    }
    window.__gb_ml = () => ({ curTr, ctlGroups, gbDo, saveSong, song: () => S, SMART, chordsOf, chordDown, chordUp, liveOn, lit, kitPads, applyLevels, renderInst,
      select(i) { if (!S || !S.tracks[i]) return; S.sel = i; if (S.view === "inst") renderInst(); else renderTracks(); paintBar(); saveSong(); },
      seekBy(d) { if (!S || TP.on) return; S.ph = Math.max(0, Math.round(S.ph / S.sig + d) * S.sig); placePh(); paintPos(); },
      cycle() { const b = [...document.querySelectorAll("#gbTbar button")].find(x => x.textContent.includes("Cycle")); if (b) { b.click(); return; } gbDo(); S.cyc.on = !S.cyc.on; if (S.cyc.on && !(S.cyc.b > S.cyc.a)) { S.cyc.a = 0; S.cyc.b = 4 * S.sig; } saveSong(); gbSay(S.cyc.on ? "Cycle on" : "Cycle off"); } });
    window.__gb = { get ml() { return window.__gb_ml(); }, capture: gbCapture, exportSheet, importFiles, audioStems, mini: gbMini, playAlong, clipSheet, vaSched, laneAdd, laneRun, migrateTracks, NBR, VA, put: gbPut, snapSong: () => JSON.stringify(S), song: () => S, idx: () => IDX, TP, AU, REC, ED, V, AP, UNDO, play, stop, liveOn, liveOff, addTrack, setView, renderTracks, openEditor, chordsOf, voicing, soundsFor, defaultSound, soundName, beatNow, saveNow, loopNotes, addLoop, switchSong, newSong, readSong, kitPads, placeRegion, songEndBeat, ABUF, expStart, open: gbOpen, close: gbClose, liveAllOff, gbKeys };
  }


