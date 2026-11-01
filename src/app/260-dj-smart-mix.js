  // ======================================================================
  // DJ Smart mix
  // ======================================================================
  {
    const smSheet = document.getElementById("smartSheet"), smBody = document.getElementById("smBody"), smSub = document.getElementById("smSub"), smBtn = document.getElementById("djSmart");
    const fmt = djFmt, sname = l => DJ_SECT_NAME[l] || l;
    const phraseAt = (r, pos) => r.phrases.find(p => pos >= p.start - 0.01 && pos < p.end - 0.01) || r.phrases[r.phrases.length - 1];
    let PLAN = null;

    // the songs: the one playing leads; the other deck's song, or the next one from the songs list, comes in
    async function pickPair() {
      const A = DJ.decks[0], B = DJ.decks[1];
      let from = A.playing && !B.playing ? A : B.playing && !A.playing ? B : A.playing && B.playing ? LEAD() : null;
      if (!from) return { err: "Start the song you're mixing out of, then tap Smart mix" };
      const to = DJ.decks[1 - from.i];
      if (to.playing) return { err: "Both decks are playing: stop the one you're not mixing out of, or load the next song on it" };
      if (!from.bpm0) return { err: "Deck " + "AB"[from.i] + " has no beat grid: tap Tap along with it first" };
      if (!to.buf) {
        const idx = djNextIdx();
        if (idx == null) return { err: "Load the next song on deck " + "AB"[to.i] + ", or add songs to the list" };
        djMsg("Loading " + DJ.crate[idx].name + " on " + "AB"[to.i] + "…", true); await djLoadCrate(to, idx, false);
        if (!to.buf) return { err: "Couldn't load the next song" };
      }
      if (!to.bpm0) return { err: "Deck " + "AB"[to.i] + " has no beat grid: tap Tap along with it first" };
      return { from, to };
    }
    const ensureSect = async (d, onProg) => { if (d.sect && d.sect.buf === d.buf) return d.sect; if (d.sectP) { try { await d.sectP; } catch (e) {} if (d.sect && d.sect.buf === d.buf) return d.sect; } return await djSectFor(d, onProg); };

    function inPointOf(to, rB) {
      if (to.phrase != null) return { pos: to.phrase, label: "its Phrase mark" };
      const first = rB.first >= -0.02 ? Math.max(0, rB.first) : rB.first + rB.bar;
      const p = phraseAt(rB, first + 0.01);
      return { pos: first, label: p && p.label === "intro" ? "the start of its intro" : "its first downbeat" };
    }
    function plan(from, to, rA, rB, opt) {
      opt = opt || {};
      const perA = djPer(from), barA = perA * 4, spA = from.rate * from.bend, now = djPos(from), durA = from.buf.duration;
      const rec = djRecBpm(from, { bpm: to.bpm0 }), far = !!(rec && rec.far);
      const bpm = DJ.mixBpm || (rec && !far ? rec.bpm : djEff(from) * from.bend);
      // keys: shift the incoming song a semitone or two when that makes them fit
      const camA = camShift(from.cam, from.semi || 0), camB = to.cam;
      let semi = 0; const comp0 = djCompat(camA, camB);
      if (DJ.stretchOK && camA && camB && comp0 < 2) for (const st of [1, -1, 2, -2]) if (djCompat(camA, camShift(camB, st)) >= 2) { semi = st; break; }
      if (opt.semi != null) semi = opt.semi;
      const comp = djCompat(camA, camShift(camB, semi));
      // the incoming song: where it starts and how long until its first drop
      const inn = inPointOf(to, rB), barB = djPer(to) * 4;
      const dropB = rB.phrases.find(p => p.start >= inn.pos - 0.01 && (p.label === "drop" || p.label === "groove"));
      const toDrop = dropB ? Math.round((dropB.start - inn.pos) / barB) : 16;
      // the style and its length
      let style, bars, why = [];
      if (opt.style) { style = opt.style; bars = style === "cut" ? 1 : style === "blend" || style === "swap" ? Math.max(8, Math.min(32, Math.round(toDrop / 8) * 8 || 16)) : 8; }
      else if (DJ.style !== "auto" && DJ_STYLES[DJ.style]) { style = DJ.style; bars = DJ_STYLES[style][1]; }
      else if (far) { style = "cut"; bars = 1; why.push("the tempos are far apart (" + from.bpm0.toFixed(0) + " and " + to.bpm0.toFixed(0) + "), so a clean cut on the phrase"); }
      else if (comp <= 0) { style = "echo"; bars = 8; why.push("the keys clash (" + (camA || "?") + " and " + (camB || "?") + "), so the old song echoes out"); }
      else if (comp === 1) { style = "filter"; bars = 8; why.push("the keys only half fit, so the old song is filtered away"); }
      else {
        bars = Math.max(8, Math.min(32, Math.round(toDrop / 8) * 8 || 16));
        style = (to.energy || 0) > (from.energy || 0) + 0.12 ? "swap" : "blend";
        why.push(style === "swap" ? "it's more energetic: bring it in without bass and drop the bass over halfway" : "the keys fit: a long blend");
      }
      // where to leave the playing song
      const outLen = Math.max(1, bars) * barA, lead = 3 * spA;
      const score = (p, i) => {
        const P = rA.phrases, prev = P[i - 1], afterLastDrop = !P.slice(i).some(q => q.label === "drop");
        let sc = { outro: 5, break: afterLastDrop ? 3.5 : 2.5, groove: afterLastDrop ? 3 : 1.2, build: -0.5, drop: -1.5, intro: -3 }[p.label] || 0;
        if (prev && prev.label === "drop" && p.label !== "drop") sc += 1.5;
        if (p.label === "outro" && prev && prev.label !== "outro") sc += 1;
        sc -= 0.6 * ((p.start - now) / spA) / 60;
        return sc;
      };
      const cands = rA.phrases.map((p, i) => ({ p, i })).filter(({ p }) => p.start >= now + lead && p.start + Math.min(outLen, 8 * barA) <= durA - 0.5);
      let out;
      if (opt.outPos != null) { const p = phraseAt(rA, opt.outPos + 0.01); out = { pos: opt.outPos, label: p ? p.label : "groove" }; }
      else if (cands.length) { let best = cands[0], bs = -1e9; cands.forEach(c => { const v = score(c.p, c.i); if (v > bs) { bs = v; best = c; } }); out = { pos: best.p.start, label: best.p.label }; }
      else { const b = djNextBoundary(from, 4); out = { pos: b.pos, label: "end" }; if (!opt.style) { style = "echo"; bars = 4; why.push("the song is nearly over, so the next one comes in on the next bar"); } }
      // the transition has to fit in what's left of the playing song
      if (style !== "cut") { const left = (durA - out.pos) / barA; if (bars > left) bars = Math.max(4, Math.floor(left / 4) * 4 || 4); }
      // other spots to offer
      const alts = []; const okOut = c => c.p.label === "outro" || c.p.label === "break" || c.p.label === "groove";
      const soon = cands.find(okOut); if (soon && Math.abs(soon.p.start - out.pos) > 0.5) alts.push({ pos: soon.p.start, label: soon.p.label, tag: "Soonest" });
      cands.filter(c => c.p.start > out.pos + 0.5 && (c.p.label === "outro" || c.p.label === "break" || (c.p.label === "groove" && c.i > 0 && rA.phrases[c.i - 1].label === "drop"))).slice(0, 1).forEach(c => alts.push({ pos: c.p.start, label: c.p.label, tag: "Later" }));
      cands.filter(c => c.p.start < out.pos - 0.5 && c.p.start > (soon ? soon.p.start + 0.5 : now) && (c.p.label === "break" || c.p.label === "outro" || c.p.label === "groove")).slice(-1).forEach(c => alts.push({ pos: c.p.start, label: c.p.label, tag: "Sooner" }));
      let inPos = inn.pos, inLabel = inn.label;
      if (style === "cut" && dropB) { inPos = dropB.start; inLabel = "its first " + sname(dropB.label); }
      const wait = (out.pos - now) / spA;
      why.unshift((out.label === "end" ? "Out of " + "AB"[from.i] + " on the next bar" : "Out of " + "AB"[from.i] + " at " + fmt(out.pos) + ", the start of its " + sname(out.label)) + " (in " + fmt(wait) + ")");
      why.splice(1, 0, "Deck " + "AB"[to.i] + " comes in from " + fmt(inPos) + ", " + inLabel + (style !== "cut" && dropB && toDrop > 0 && Math.abs(toDrop - bars) <= 4 ? ", so its first " + sname(dropB.label) + " lands as the mix ends" : ""));
      why.push(DJ_STYLES[style][0] + (style === "cut" ? "" : " over " + bars + " bars") + " at " + bpm.toFixed(1) + " BPM");
      if (semi) why.push("Deck " + "AB"[to.i] + " " + (semi > 0 ? "up " : "down ") + Math.abs(semi) + " semitone" + (Math.abs(semi) > 1 ? "s" : "") + " so the keys fit: " + camB + " → " + camShift(camB, semi) + " against " + camA);
      else if (camA && camB) why.push("Keys: " + camA + " and " + camB + ([" clash", " half fit", " fit", " match"][comp0] || ""));
      why = why.map(t => t.charAt(0).toUpperCase() + t.slice(1));
      return { from, to, rA, rB, outPos: out.pos, outLabel: out.label, inPos, inLabel, style, bars, bpm, semi, comp, camA, camB, why, alts, wait, now, opt };
    }

    // ---- the plan card ----
    function strip(r, dur, marks) {
      const el = document.createElement("div"); el.className = "sm-strip";
      r.sections.forEach(p => { const i = document.createElement("i"); i.style.width = ((p.end - p.start) / dur * 100) + "%"; i.style.background = DJ_SECT_COL[p.label]; if ((p.end - p.start) / dur > 0.06) i.textContent = sname(p.label); i.title = sname(p.label) + " · " + p.bars + " bars · " + fmt(p.start); el.appendChild(i); });
      marks.forEach(m => { const e = document.createElement("div"); e.className = m.cls; e.style.left = (m.a / dur * 100) + "%"; if (m.b != null) e.style.width = Math.max(0.6, (m.b - m.a) / dur * 100) + "%"; el.appendChild(e); });
      return el;
    }
    function render() {
      const P = PLAN; if (!P) return;
      const { from, to } = P, durA = from.buf.duration, durB = to.buf.duration, barA = djPer(from) * 4, barB = djPer(to) * 4;
      smSub.textContent = "AB"[from.i] + " → " + "AB"[to.i];
      smBody.innerHTML = "";
      modeRow("mix");
      const song = (d, r, marks, tag) => { const w = document.createElement("div"); w.className = "sm-song"; const b = document.createElement("b"); b.textContent = "AB"[d.i] + " · " + (d.name || "song"); const sm = document.createElement("small"); sm.textContent = tag; b.appendChild(sm); w.append(b, strip(r, d.buf.duration, marks)); return w; };
      smBody.appendChild(song(from, P.rA, [{ cls: "mk now", a: djPos(from) }, { cls: "zone", a: P.outPos, b: Math.min(durA, P.outPos + (P.style === "cut" ? barA / 2 : P.bars * barA)) }], (djEff(from) * from.bend).toFixed(1) + " BPM" + (P.camA ? " · " + P.camA : "") + " · now " + fmt(djPos(from))));
      smBody.appendChild(song(to, P.rB, [{ cls: "zone", a: P.inPos, b: Math.min(durB, P.inPos + (P.style === "cut" ? barB / 2 : P.bars * barB)) }], to.bpm0.toFixed(1) + " BPM" + (P.camB ? " · " + P.camB : "")));
      const lg = document.createElement("div"); lg.className = "sm-legend"; Object.keys(DJ_SECT_COL).forEach(k => { const s2 = document.createElement("span"); s2.innerHTML = '<i style="background:' + DJ_SECT_COL[k] + '"></i>' + sname(k); lg.appendChild(s2); }); smBody.appendChild(lg);
      const ul = document.createElement("ul"); ul.className = "sm-why"; P.why.forEach(t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); }); smBody.appendChild(ul);
      const row = (lab, items) => { const r = document.createElement("div"); r.className = "sm-row"; const sp = document.createElement("span"); sp.textContent = lab; r.appendChild(sp); items.forEach(([txt, on, fn]) => { const b = document.createElement("button"); b.className = "btn"; b.textContent = txt; b.setAttribute("aria-pressed", String(!!on)); b.addEventListener("click", fn); r.appendChild(b); }); smBody.appendChild(r); };
      const opts = [[fmt(P.outPos) + " · " + sname(P.outLabel), true, () => {}]].concat(P.alts.map(a => [a.tag + " · " + fmt(a.pos) + " " + sname(a.label), false, () => replan({ outPos: a.pos })]));
      row("Mix out", opts);
      row("Style", Object.keys(DJ_STYLES).map(k => [DJ_STYLES[k][0], k === P.style, () => replan({ style: k })]));
      if (DJ.stretchOK && P.camB) row("Key", [-2, -1, 0, 1, 2].map(st => [(st > 0 ? "+" : "") + st + (st ? "" : " st") + " · " + camShift(P.camB, st) + (P.camA && djCompat(P.camA, camShift(P.camB, st)) >= 2 ? " ✓" : ""), st === P.semi, () => replan({ semi: st })]));
    }
    function replan(o) { if (!PLAN) return; PLAN = plan(PLAN.from, PLAN.to, PLAN.rA, PLAN.rB, Object.assign({}, PLAN.opt, o)); render(); }

    let preparing = false;
    async function openSmart() {
      if (preparing) return;
      if (DJ.mash) { renderMash(true); smGoLabel("mash", true); smSheet.hidden = false; return; }
      if (DJ.trans) { if (DJ.trans.smart) { djMixEnd(true); djMsg("Smart mix cancelled"); } else djMsg("A mix is already running"); djPaintAll(); return; }
      if (!djBuild()) return;
      preparing = true; let off = false, tStep = performance.now();
      smBtn.textContent = "✦ Reading…"; smBtn.classList.add("on");
      // the progress banner: each step, its % and roughly how long is left
      const show = (label, p) => {
        let l = "✦ Smart mix · " + label;
        if (p != null && p > 0.05 && p < 0.995) { const left = (performance.now() - tStep) / p * (1 - p) / 1000; l += " · about " + Math.max(1, Math.ceil(left)) + " s left"; }
        jobSet("smart", l, p == null ? null : p, () => { off = true; });
      };
      try {
        const A = DJ.decks[0], B = DJ.decks[1];
        // a song on each deck: the next one from the list goes onto an empty deck
        for (const d of [A, B]) if (!d.buf && !d.playing) { const idx = djNextIdx(); if (idx == null) break; show("loading " + DJ.crate[idx].name + " on deck " + "AB"[d.i] + "…", null); await djLoadCrate(d, idx, false); if (off) break; }
        if (off) { djMsg("Smart mix cancelled"); return; }
        if (!A.buf || !B.buf) { djMsg("Put a song on each deck (or add songs to the list), then tap ✦ Smart mix"); return; }
        if (!A.bpm0 && !B.bpm0) { djMsg("Neither deck has a beat grid: tap Tap along with the instrumental first"); return; }
        const need = [A, B].filter(d => d.bpm0 && !(d.sect && d.sect.buf === d.buf)), done = {};
        tStep = performance.now();
        const prog = d => p => { done[d.i] = p; const tot = need.reduce((a, x) => a + (done[x.i] || 0), 0) / Math.max(1, need.length); show("reading " + need.map(x => "AB"[x.i]).join(" and ") + " (intro, drops, breakdowns, outro)", tot); };
        if (need.length) show("reading " + need.map(x => "AB"[x.i]).join(" and ") + " (intro, drops, breakdowns, outro)", 0);
        const [rA, rB] = await Promise.all([A, B].map(d => d.bpm0 ? ensureSect(d, prog(d)) : Promise.resolve(loneSect(d))));
        if (off) { djMsg("Smart mix cancelled"); return; }
        if (!rA || !rB) { djMsg("Couldn't read the songs' structure"); return; }
        tStep = performance.now(); const dn = [0, 0];
        const vp = i => p => { dn[i] = p; show("listening for the vocals", (dn[0] + dn[1]) / 2); };
        const [vA, vB] = await Promise.all([mashScan(A, rA, vp(0)), mashScan(B, rB, vp(1))]);
        if (off) { djMsg("Smart mix cancelled"); return; }
        if (!vA || !vB) { djMsg("Couldn't listen to the songs"); return; }
        show("planning…", 1);
        MASH = mashPlan(A, B, vA, vB, {});
        if (MASH.err) { const alt = mashPlan(A, B, vA, vB, { top: 1 - DJ.decks.indexOf(MASH.top || A) }); if (!alt.err) MASH = alt; else { djMsg(MASH.err); MASH = null; return; } }
        // a transition needs one song playing and the other waiting, both with a beat grid
        const pl = A.playing !== B.playing && A.bpm0 && B.bpm0 ? (A.playing ? A : B) : null;
        PLAN = pl ? plan(pl, DJ.decks[1 - pl.i], pl.sect, DJ.decks[1 - pl.i].sect, {}) : null;
        const mode = PLAN ? SM_MODE : "mash";
        showMode(mode); smSheet.hidden = false;
        djMsg(mode === "mash" ? "✦ Mashup: " + MASH.why[MASH.stems ? 2 : 1] : "Smart mix: " + PLAN.why[0]);
      } finally { preparing = false; jobEnd("smart"); smBtn.classList.remove("on"); djPaintAll(); }
    }
    function startSmart(P) {
      if (!P || DJ.trans || !djBuild()) return;
      const { from, to, style } = P;
      if (!from.playing) { djMsg("Deck " + "AB"[from.i] + " stopped: start it and plan again"); return; }
      DJ.lead = from.i;
      if (P.bpm) djSetRate(from, Math.max(0.5, Math.min(2, P.bpm / from.bpm0)));
      const mr = djMatchRate(); if (mr) { if (mr.m !== 1) to.bpm0 *= mr.m; to.rate = Math.max(0.5, Math.min(2, mr.r)); } to.bend = 1;
      to.semi = P.semi || 0; to.loop = null; to.p0 = P.inPos;
      const beat = 60 / (djEff(from) * from.bend), eqFrom = Object.assign({}, from.eq), eqTo = Object.assign({}, to.eq);
      if (style === "blend" || style === "swap") to.eq.lo = -26;
      if (style === "filter") to.eq.filt = -0.8;
      djApplyEq(to);
      const wait = Math.max(0.05, (P.outPos - djPos(from)) / (from.rate * from.bend));
      const T = { from, to, idx: to.crate, style, bars: Math.max(1, P.bars), beat, t0: ctx.currentTime + wait, eqFrom, eqTo, xf0: DJ.xf, target: to.i === 0 ? 0 : 1, cutAt: ctx.currentTime + wait, done: false, smart: { outPos: P.outPos, inPos: P.inPos, pending: true } };
      DJ.sync = true; DJ.trans = T; djTickOn();
      djMsg("✦ Smart mix: " + "AB"[to.i] + " comes in at " + fmt(P.outPos) + " (" + sname(P.outLabel) + ") · " + DJ_STYLES[style][0] + (style === "cut" ? "" : " over " + T.bars + " bars") + (P.semi ? " · " + (P.semi > 0 ? "+" : "") + P.semi + " st" : "") + " · tap ✦ to cancel", true);
      djPaintAll(); djPaintDeck(to);
    }
    // ======================================================================
    // ✦ Mashup: both songs at once, one under the other
    // ======================================================================
    let MASH = null, CUR_MODE = "mash";
    let SM_MODE = "mash"; try { SM_MODE = localStorage.getItem("nightbloom-smmode") || "mash"; } catch (e) {}
    const smGo = document.getElementById("smGo");
    // how vocal each phrase is: energy in the voice range, in the middle of the stereo picture; and whether the song
    // is a vocal on its own (little low end, silence between lines), and where its first line starts
    async function mashScan(d, r, onProg) {
      if (d.vox && d.vox.buf === d.buf && d.vox.r === r) return d.vox;
      const b = d.buf, sr = b.sampleRate, L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
      const D = window.NB_LITE ? 8 : 4, fs = sr / D, n = L.length, P = r.phrases;
      const aH = Math.exp(-2 * Math.PI * 250 / fs), aL = Math.exp(-2 * Math.PI * 2800 / fs), aLo = Math.exp(-2 * Math.PI * 80 / fs);
      const em = new Float64Array(P.length), es = new Float64Array(P.length), ea = new Float64Array(P.length), cnt = new Float64Array(P.length);
      let ml = 0, mx = 0, sl = 0, sx = 0, lo = 0, lo2 = 0, pi = 0, midAll = 0, sideAll = 0, loAll = 0, bandAll = 0, cAll = 0;
      const W = Math.max(1, Math.round(fs * 0.25)), win = []; let wc = 0, wv = 0, wa = 0;
      for (let s0 = 0; s0 < n; s0 += 1 << 18) {
        const s1 = Math.min(n, s0 + (1 << 18));
        for (let i = s0; i < s1; i += D) {
          const m = (L[i] + R[i]) * 0.5, sd = (L[i] - R[i]) * 0.5;
          ml = ml * aH + m * (1 - aH); mx = mx * aL + (m - ml) * (1 - aL);
          sl = sl * aH + sd * (1 - aH); sx = sx * aL + (sd - sl) * (1 - aL);
          lo = lo * aLo + m * (1 - aLo); lo2 = lo2 * aLo + lo * (1 - aLo);   // below 80 Hz: bass and kick
          const t = i / sr; while (pi < P.length - 1 && t >= P[pi].end) pi++;
          em[pi] += mx * mx; es[pi] += sx * sx; ea[pi] += m * m; cnt[pi]++;
          midAll += m * m; sideAll += sd * sd; loAll += lo2 * lo2; bandAll += mx * mx; cAll++;
          wv += mx * mx; wa += m * m; if (++wc >= W) { win.push([wv / wc, wa / wc]); wc = 0; wv = 0; wa = 0; }
        }
        if (onProg) { try { onProg(s1 / n); } catch (e) {} }
        await new Promise(res => setTimeout(res, 0));
        if (d.buf !== b) return null;
      }
      const bands = P.map((p, k) => em[k] / Math.max(1, cnt[k])).filter(x => x > 0).sort((x, y) => x - y), med = bands[Math.floor(bands.length / 2)] || 1e-9;
      const phrases = P.map((p, k) => {
        const c = Math.max(1, cnt[k]), m = em[k] / c, sd = es[k] / c;
        const center = m / (m + sd + 1e-12), loud = Math.sqrt(m / med);
        const vox = center * center * Math.min(1.2, loud) * (p.label === "intro" || p.label === "outro" ? 0.6 : 1);
        return { start: p.start, end: p.end, label: p.label, vox, center, loud };
      });
      const best = phrases.slice().sort((x, y) => y.vox - x.vox)[0] || null;
      // the gaps and the first line
      const lv = win.map(w => w[1]).sort((x, y) => x - y), p90 = lv[Math.floor(lv.length * 0.9)] || 1e-9;
      const vv = win.map(w => w[0]).sort((x, y) => x - y), v90 = vv[Math.floor(vv.length * 0.9)] || 1e-9;
      const silent = win.filter(w => w[1] < p90 * 0.003).length / Math.max(1, win.length);
      const act = win.filter(w => w[1] >= p90 * 0.003), actRms = Math.sqrt(act.reduce((a, w) => a + w[1], 0) / Math.max(1, act.length));
      let first = 0; for (let k = 0; k < win.length - 1; k++) if (win[k][0] > v90 * 0.06 && win[k + 1][0] > v90 * 0.06) { first = k * W * D / sr; break; }
      const lowShare = loAll / (midAll + 1e-12), voiceShare = bandAll / (midAll + 1e-12);
      const stem = lowShare < 0.1 && voiceShare > 0.2 && silent > 0.08;
      d.vox = { buf: b, r, phrases, best, mono: sideAll < midAll * 0.004, loud: Math.sqrt(midAll / Math.max(1, cAll)), actRms, first, stem, lowShare, voiceShare, silent };
      return d.vox;
    }
    // a vocal with no beat grid gets one long section until its tempo is set
    const loneSect = d => ({ buf: d.buf, phrases: [{ start: 0, end: d.buf.duration, label: "groove" }], sections: [{ start: 0, end: d.buf.duration, label: "groove" }] });
    // each deck can play full; with its vocals down (under); just its middle (over); a vocal with its rumble cut (vox);
    // or an instrumental with a little room for the voice (pocket)
    function mashStage(d) {
      if (d.mash) return d.mash;
      const c = ctx, M = { on: {} };
      M.out = c.createGain();
      ["dry", "under", "over", "vox", "pocket"].forEach(k => { M[k] = c.createGain(); M[k].gain.value = k === "dry" ? 1 : 0; M[k].connect(M.out); });
      const half = v => { const g = c.createGain(); g.gain.value = v; return g; };
      const bq = (type, f, q, g) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q == null ? 0.7 : q; if (g != null) x.gain.value = g; return x; };
      // a mono song is spread to both sides first, so its "sides" are silent and its middle is the whole song
      M.pre = c.createGain(); M.pre.channelCount = 2; M.pre.channelCountMode = "explicit"; M.pre.channelInterpretation = "speakers";
      const sp = c.createChannelSplitter(2); M.pre.connect(sp);
      const mid = c.createGain(), side = c.createGain();
      sp.connect(half(0.5), 0).connect(mid); sp.connect(half(0.5), 1).connect(mid);
      sp.connect(half(0.5), 0).connect(side); sp.connect(half(-0.5), 1).connect(side);
      // under: the sides plus the middle's lows and highs: the drums, bass and width stay, the voice goes
      const mg = c.createChannelMerger(2), inv = half(-1);
      side.connect(mg, 0, 0); side.connect(inv).connect(mg, 0, 1); mg.connect(M.under);
      mid.connect(bq("lowpass", 170)).connect(M.under); mid.connect(bq("highpass", 7000)).connect(M.under);
      // over: just the middle, 170 Hz to 7 kHz
      mid.connect(bq("highpass", 170)).connect(bq("lowpass", 7000)).connect(M.over);
      // vox: a vocal on its own, everything but the rumble
      M.voxIn = bq("highpass", 90); M.voxIn.connect(M.vox);
      // pocket: an instrumental with a little room where the voice sits
      M.pocketIn = bq("peaking", 2600, 1, -3.5); M.pocketIn.connect(M.pocket);
      try { d.in.disconnect(d.lo); } catch (e) {}
      d.in.connect(M.dry); M.out.connect(d.lo);
      M.mode = "full";
      d.mash = M; return M;
    }
    const MASH_IN = { under: "pre", over: "pre", vox: "voxIn", pocket: "pocketIn" };
    function mashSet(d, mode, at, tc) {
      const M = mashStage(d), t = Math.max(at || 0, ctx.currentTime); tc = tc || 0.02;
      const need = MASH_IN[mode];
      if (need && !M.on[need]) { d.in.connect(M[need]); M.on[need] = true; }
      const g = d.mashGain || 1, lv = { dry: 0, under: 0, over: 0, vox: 0, pocket: 0 };
      if (mode === "under") lv.under = 1.25; else if (mode === "over") lv.over = 1.55 * g; else if (mode === "vox") lv.vox = g; else if (mode === "pocket") lv.pocket = 1; else lv.dry = 1;
      for (const k in lv) M[k].gain.setTargetAtTime(lv[k], t, tc);
      M.mode = mode;
      // the paths not in use are let go once they've faded, so they cost nothing
      const tok = M.tok = (M.tok || 0) + 1;
      setTimeout(() => { if (M.tok !== tok) return; for (const k in M.on) if (M.on[k] && k !== MASH_IN[M.mode]) { try { d.in.disconnect(M[k]); } catch (e) {} M.on[k] = false; } }, (t - ctx.currentTime + tc * 6) * 1000 + 200);
    }
    function mashPlan(A, B, vA, vB, opt) {
      opt = opt || {};
      const L = x => "AB"[x.i];
      const stemsAuto = vA.stem !== vB.stem;
      const stems = opt.stems != null ? opt.stems : stemsAuto;
      let top;
      if (opt.top != null) top = DJ.decks[opt.top];
      else if (stems && stemsAuto) top = vA.stem ? A : B;
      else {
        // the song whose best part has the most of its voice range in the middle goes on top
        const sA = vA.best ? vA.best.center : 0, sB = vB.best ? vB.best.center : 0;
        if (Math.abs(sA - sB) < 0.08 * Math.max(sA, sB, 1e-9)) top = A.playing && !B.playing ? B : B.playing && !A.playing ? A : B;
        else top = sA > sB ? A : B;
      }
      const bed = DJ.decks[1 - top.i];
      const vT = top === A ? vA : vB, vU = bed === A ? vA : vB, rU = vU.r;
      if (!bed.bpm0) return { err: "Deck " + L(bed) + " has no beat grid: tap Tap along with it first, or swap which one is on top" };
      const bedNow = bed.playing ? djEff(bed) * bed.bend : bed.bpm0 * (bed.rate || 1);
      // the top song's own tempo: what was heard, unless you set it (a lone vocal's beat is hard to hear)
      const heard = top.bpm0 || 0;
      let vbpm = opt.vbpm || heard || bedNow, m = 1;
      if (!opt.vbpm && heard) { let err = 9; for (const k of [0.5, 1, 2]) { const e = Math.abs(Math.log(bedNow / (heard * k))); if (e < err) { err = e; m = k; } } vbpm = heard * m; }
      if (stems && !opt.vbpm && Math.abs(bedNow / vbpm - 1) < 0.04) vbpm = bedNow;   // within 4%: it's the same tempo
      // the tempo both play at: the bottom song's, or, when they're far apart, met in the middle so neither is stretched too far
      const far = Math.abs(Math.log(bedNow / vbpm)) > Math.log(1.12);
      const tempo = opt.tempo || (far && !bed.playing ? "mid" : "bed");
      const bpm = tempo === "mid" ? Math.sqrt(bedNow * vbpm) : tempo === "top" ? vbpm : bedNow;
      const bedRate = bpm / bed.bpm0, rate = bpm / vbpm, stretch = rate - 1, bedStretch = bpm / bedNow - 1;
      // key: shift the top song when that makes it fit
      const camU = camShift(bed.cam, bed.semi || 0), camT = top.cam, comp0 = djCompat(camU, camT);
      let semi = 0;
      if (DJ.stretchOK && camU && camT && comp0 < 2) for (const st of [1, -1, 2, -2, 3, -3]) if (djCompat(camU, camShift(camT, st)) >= 2) { semi = st; break; }
      if (opt.semi != null) semi = opt.semi;
      const comp = djCompat(camU, camShift(camT, semi));
      const pc = (x, d) => (Math.abs(x) < 0.004 ? L(d) + " stays as it is" : L(d) + (x > 0 ? " sped up " : " slowed down ") + Math.abs(x * 100).toFixed(1) + "%");
      const tempoLine = "Tempo " + bpm.toFixed(1) + " BPM" + (tempo === "mid" ? ", met in the middle: " + pc(bedStretch, bed) + ", " + pc(stretch, top) : tempo === "top" ? ", " + L(top) + "'s: " + pc(bedStretch, bed) : ": " + (Math.abs(stretch) < 0.004 ? L(top) + " already matches" : pc(stretch, top)))
        + (DJ.stretchOK && (Math.abs(stretch) > 0.004 || Math.abs(bedStretch) > 0.004) ? " (key lock keeps the pitch)" : "") + (Math.max(Math.abs(stretch), Math.abs(bedStretch)) > 0.12 ? ". That's a big stretch: it may sound a little smeared" : "");
      const keyLine = semi ? "Key: " + L(top) + " " + (semi > 0 ? "up " : "down ") + Math.abs(semi) + " semitone" + (Math.abs(semi) > 1 ? "s" : "") + " so it fits: " + camT + " → " + camShift(camT, semi) + " over " + camU
        : camU && camT ? "Keys: " + camT + " over " + camU + ([" clash, and a small shift doesn't fix it: expect some clash", " half fit", " fit", " match"][comp] || "") : "";
      const gainOf = () => Math.max(0.4, Math.min(2.5, (vU.actRms || vU.loud || 1) / (vT.actRms || vT.loud || 1) * (stems ? 0.85 : 1)));
      const base = { bed, top, bpm, bedNow, bedRate, tempo, vbpm, heard, rate, semi, comp, camU, camT, opt, vA, vB, stems, stemsAuto, gain: gainOf() };
      if (stems) {
        // where the vocal comes in: a phrase of the instrumental (after its intro, or the next one when it's playing)
        const barU = 4 * 60 / bed.bpm0, now = bed.playing ? djPos(bed) : 0;
        const ins = rU.phrases.filter(p => p.start >= (bed.playing ? now + 2.5 * bed.rate * bed.bend : 0) - 0.01).filter((p, i, a) => i === 0 || p.start - a[i - 1].start > 1).slice(0, 6);
        let P = opt.P;
        if (P == null) { const g = ins.find(p => p.label !== "intro" && p.start > 0.5) || ins[0]; P = g ? g.start : 0; }
        // the vocal: from just before its first line (a beat of pickup kept), so the line lands on that downbeat
        const v0 = vT.first || 0, lead = Math.min(v0, 60 / vbpm * 2), topAt = Math.max(0, v0 - lead);
        const bedStart = bed.playing ? null : Math.max(0, P - 8 * barU);
        const room = opt.room != null ? opt.room : true;
        const pin = rU.phrases.find(p => Math.abs(p.start - P) < 0.05);
        const why = [
          "Instrumental: " + L(bed) + " · " + (bed.name || "song") + ", full" + (room ? ", with a little room made where the voice sits" : ""),
          "Vocal: " + L(top) + " · " + (top.name || "song") + ", full, rumble below 90 Hz cut",
          "The first line (" + fmt(v0) + " in the vocal) lands on " + L(bed) + "'s " + (pin ? sname(pin.label) : "phrase") + " at " + fmt(P) + (bed.playing ? " (in " + fmt(Math.max(0, (P - djPos(bed)) / (bed.rate * bed.bend))) + ")" : ", " + L(bed) + " starts " + Math.round((P - bedStart) / barU) + " bars before"),
          tempoLine + (opt.vbpm ? " (vocal tempo set by you: " + vbpm.toFixed(1) + ")" : heard ? " (vocal heard at " + vbpm.toFixed(1) + " BPM: check it on Vocal tempo)" : " (no beat heard in the vocal: it's taken as " + vbpm.toFixed(1) + ", set it on Vocal tempo)"),
        ];
        if (keyLine) why.push(keyLine);
        return Object.assign(base, { P, ins, v0, lead, topAt, bedStart, room, why, cands: [], bedVox: false, topVox: false, topMode: "vox", bedMode: room ? "pocket" : "full" });
      }
      // two full songs: the top one's most vocal parts, its middle only; the bottom one with its vocals turned down
      const barT = 4 * 60 / vbpm;
      const cands = vT.phrases.filter(p => p.end - p.start >= 6 * barT - 0.5).sort((x, y) => y.vox - x.vox).slice(0, 3);
      if (!cands.length && vT.best) cands.push(vT.best);
      const topAt = opt.topAt != null ? opt.topAt : (cands[0] ? cands[0].start : 0);
      const topP = vT.phrases.find(p => Math.abs(p.start - topAt) < 0.05);
      let bedAt;
      if (bed.playing) { const now = djPos(bed), lead = 2.5 * bed.rate * bed.bend; const nx = rU.phrases.find(p => p.start >= now + lead); bedAt = nx ? nx.start : djNextBoundary(bed, 16).pos; }
      else { const g = rU.phrases.find(p => ["build", "groove", "drop"].includes(p.label)); bedAt = opt.bedAt != null ? opt.bedAt : (g && g.start < 0.4 * bed.buf.duration ? g.start : 0); }
      const bedVox = vU.mono ? false : (opt.bedVox != null ? opt.bedVox : true), topVox = opt.topVox != null ? opt.topVox : true;
      const why = [
        "Underneath: " + L(bed) + " · " + (bed.name || "song") + (bedVox ? ", with its vocals turned down (its drums, bass and width stay)" : vU.mono ? " (it's mono, so its vocals can't be turned down)" : ", full"),
        "On top: " + L(top) + " · " + (top.name || "song") + " from " + fmt(topAt) + (topP ? (topP === cands[0] ? ", its most vocal part" : ", its " + sname(topP.label)) : "") + (topVox ? ", just its middle: vocals and leads, no bass or kick" : ", full"),
        tempoLine,
      ];
      if (keyLine) why.push(keyLine);
      why.push(bed.playing ? "It starts on " + L(bed) + "'s next phrase, at " + fmt(bedAt) + " (in " + fmt(Math.max(0, (bedAt - djPos(bed)) / (bed.rate * bed.bend))) + "), so the phrases line up" : "Both start together, " + L(bed) + " from " + fmt(bedAt) + ", phrases lined up");
      return Object.assign(base, { topAt, bedAt, cands, bedVox, topVox, mono: vU.mono, why, topMode: topVox ? "over" : "full", bedMode: bedVox ? "under" : "full" });
    }
    function replanMash(o) { if (!MASH) return; const nx = mashPlan(DJ.decks[0], DJ.decks[1], MASH.vA, MASH.vB, Object.assign({}, MASH.opt, o)); if (nx.err) { djMsg(nx.err); return; } MASH = nx; renderMash(false); }
    const smRow = (lab, items) => { const r = document.createElement("div"); r.className = "sm-row"; const sp = document.createElement("span"); sp.textContent = lab; r.appendChild(sp); items.forEach(([txt, on, fn]) => { const b = document.createElement("button"); b.className = "btn"; b.textContent = txt; b.setAttribute("aria-pressed", String(!!on)); b.addEventListener("click", fn); r.appendChild(b); }); smBody.appendChild(r); return r; };
    function modeRow(cur) {
      if (!PLAN || !MASH) return;
      const r = document.createElement("div"); r.className = "seg sm-mode"; r.setAttribute("role", "group"); r.setAttribute("aria-label", "Smart mix kind");
      [["mash", "Mashup", "Both songs at once, one under the other"], ["mix", "Transition", "From one song into the next"]].forEach(([k, t, tip]) => {
        const b = document.createElement("button"); b.textContent = t; b.title = tip; b.setAttribute("aria-pressed", String(cur === k));
        b.addEventListener("click", () => { SM_MODE = k; try { localStorage.setItem("nightbloom-smmode", k); } catch (e) {} showMode(k); });
        r.appendChild(b);
      });
      smBody.appendChild(r);
    }
    function smGoLabel(mode, live) { CUR_MODE = mode; document.getElementById("smCancel").textContent = live ? "Close" : "Cancel"; smGo.textContent = mode === "mash" ? (live ? "End the mashup" : "Start the mashup") : "Start the mix"; smGo.dataset.act = mode === "mash" ? (live ? "end" : "mash") : "mix"; }
    function showMode(k) { if (k === "mash" && MASH) { renderMash(false); smGoLabel("mash"); } else if (PLAN) { render(); smGoLabel("mix"); } }
    function renderMash(live) {
      const M = live && DJ.mash ? DJ.mash.M : MASH; if (!M) return;
      const R = live ? DJ.mash : null, bed = R ? R.bed : M.bed, top = R ? R.top : M.top, L = x => "AB"[x.i];
      smSub.textContent = (live ? "running · " : "") + (M.stems ? L(top) + " vocal over " + L(bed) + " instrumental" : L(bed) + " under · " + L(top) + " on top");
      smBody.innerHTML = "";
      if (!live) modeRow("mash");
      const songEl = (d, r, marks, tag) => { const w = document.createElement("div"); w.className = "sm-song"; const b = document.createElement("b"); b.textContent = "AB"[d.i] + " · " + (d.name || "song"); const sm = document.createElement("small"); sm.textContent = tag; b.appendChild(sm); w.append(b, strip(r, d.buf.duration, marks)); return w; };
      const rOf = d => (d.vox && d.vox.r) || d.sect || loneSect(d);
      const bpmTxt = d => d.bpm0 ? (djEff(d) * d.bend).toFixed(1) + " BPM" : "no beat grid";
      const markNow = d => d.playing ? [{ cls: "mk now", a: djPos(d) }] : [];
      if (M.stems) {
        smBody.appendChild(songEl(bed, rOf(bed), markNow(bed).concat(live ? [] : [{ cls: "zone", a: M.P, b: Math.min(bed.buf.duration, M.P + 8 * 4 * 60 / bed.bpm0) }]), "instrumental · " + bpmTxt(bed) + (M.camU ? " · " + M.camU : "")));
        smBody.appendChild(songEl(top, rOf(top), markNow(top).concat(live ? [] : [{ cls: "mk", a: M.v0 }]), "vocal · " + (M.heard ? M.heard.toFixed(1) + " BPM heard" : "no beat heard") + (M.camT ? " · " + M.camT : "")));
      } else {
        const tp = M.cands.find(p => Math.abs(p.start - M.topAt) < 0.05);
        smBody.appendChild(songEl(bed, rOf(bed), markNow(bed).concat(live ? [] : [{ cls: "zone", a: M.bedAt, b: Math.min(bed.buf.duration, M.bedAt + 16 * 4 * 60 / bed.bpm0) }]), "under · " + bpmTxt(bed) + (M.camU ? " · " + M.camU : "")));
        smBody.appendChild(songEl(top, rOf(top), markNow(top).concat(live ? [] : [{ cls: "zone", a: M.topAt, b: tp ? tp.end : Math.min(top.buf.duration, M.topAt + 16 * 4 * 60 / M.vbpm) }]), "on top · " + bpmTxt(top) + (M.camT ? " · " + M.camT : "")));
      }
      const ul = document.createElement("ul"); ul.className = "sm-why"; M.why.forEach(t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); }); smBody.appendChild(ul);
      if (live) {
        if (M.stems) {
          smRow("Nudge vocal", [["−1 bar", false, () => nudgeMash(-4)], ["−1 beat", false, () => nudgeMash(-1)], ["+1 beat", false, () => nudgeMash(1)], ["+1 bar", false, () => nudgeMash(4)]]);
          smRow("Room", [["On", R.bedMode === "pocket", () => { R.bedMode = "pocket"; mashSet(R.bed, "pocket", 0, 0.05); renderMash(true); }], ["Off", R.bedMode === "full", () => { R.bedMode = "full"; mashSet(R.bed, "full", 0, 0.05); renderMash(true); }]]);
        } else {
          smRow("Swap", [["Put " + L(R.bed) + " on top (next bar)", false, () => { swapMash(); renderMash(true); }]]);
          smRow(L(R.bed) + " under", [["Vocals down", R.bedMode === "under", () => { R.bedMode = "under"; mashSet(R.bed, "under", 0, 0.05); renderMash(true); }], ["Full", R.bedMode === "full", () => { R.bedMode = "full"; mashSet(R.bed, "full", 0, 0.05); renderMash(true); }]]);
          smRow(L(R.top) + " on top", [["Middle only", R.topMode === "over", () => { R.topMode = "over"; mashSet(R.top, "over", 0, 0.05); renderMash(true); }], ["Full", R.topMode === "full", () => { R.topMode = "full"; mashSet(R.top, "full", 0, 0.05); renderMash(true); }]]);
        }
        return;
      }
      smRow("Kind", [["Vocal + instrumental", M.stems, () => replanMash({ stems: true })], ["Two full songs", !M.stems, () => replanMash({ stems: false })]]);
      smRow(M.stems ? "Vocal is" : "On top", [0, 1].map(i => ["AB"[i] + " · " + (DJ.decks[i].name || "song").slice(0, 22), top.i === i, () => replanMash({ top: i, topAt: null, semi: null, P: null, vbpm: null })]));
      if (M.stems) {
        if (M.ins.length) smRow("Vocal in at", M.ins.map(p => [fmt(p.start) + " · " + sname(p.label), Math.abs(p.start - M.P) < 0.05, () => replanMash({ P: p.start })]));
        smRow("Vocal tempo", [["÷2", false, () => replanMash({ vbpm: M.vbpm / 2 })], ["−1", false, () => replanMash({ vbpm: Math.max(40, Math.round(M.vbpm) - 1) })], [M.vbpm.toFixed(1) + (M.opt.vbpm ? "" : " ?"), true, () => {}], ["+1", false, () => replanMash({ vbpm: Math.round(M.vbpm) + 1 })], ["×2", false, () => replanMash({ vbpm: M.vbpm * 2 })], ["= " + L(bed), Math.abs(M.vbpm - M.bpm) < 0.05, () => replanMash({ vbpm: M.bpm })]]);
        smRow("Room", [["Make room for the voice", M.room, () => replanMash({ room: true })], ["Off", !M.room, () => replanMash({ room: false })]]);
      } else {
        if (M.cands.length) smRow(L(top) + " from", M.cands.map((p, k) => [fmt(p.start) + " · " + (k === 0 ? "most vocal" : sname(p.label)), Math.abs(p.start - M.topAt) < 0.05, () => replanMash({ topAt: p.start })]));
        smRow(L(bed) + " under", M.mono ? [["Full (it's mono)", true, () => {}]] : [["Vocals down", M.bedVox, () => replanMash({ bedVox: true })], ["Full", !M.bedVox, () => replanMash({ bedVox: false })]]);
        smRow(L(top) + " on top", [["Middle only", M.topVox, () => replanMash({ topVox: true })], ["Full", !M.topVox, () => replanMash({ topVox: false })]]);
      }
      if (DJ.stretchOK && Math.abs(Math.log(M.bedNow / M.vbpm)) > 0.01) smRow("Tempo", [["= " + L(bed) + " " + M.bedNow.toFixed(0), M.tempo === "bed", () => replanMash({ tempo: "bed" })], ["Middle " + Math.sqrt(M.bedNow * M.vbpm).toFixed(0), M.tempo === "mid", () => replanMash({ tempo: "mid" })], ["= " + L(top) + " " + M.vbpm.toFixed(0), M.tempo === "top", () => replanMash({ tempo: "top" })]]);
      if (DJ.stretchOK && M.camT) smRow("Key", [-2, -1, 0, 1, 2].map(st => [(st > 0 ? "+" : "") + st + (st ? "" : " st") + " · " + camShift(M.camT, st) + (M.camU && djCompat(M.camU, camShift(M.camT, st)) >= 2 ? " ✓" : ""), st === M.semi, () => replanMash({ semi: st })]));
    }
    // move the vocal a beat or a bar against the instrumental
    function nudgeMash(beats) {
      const R = DJ.mash; if (!R || !R.top.playing) return;
      const per = 60 / R.M.vbpm, p = djPos(R.top) - beats * per;
      djStartSrc(R.top, ctx.currentTime + 0.02, Math.max(0, p));
      djMsg("✦ Vocal moved " + (beats > 0 ? "later" : "earlier") + " by " + (Math.abs(beats) === 4 ? "a bar" : "a beat"));
    }
    function startMash(M) {
      if (!M || M.err || !djBuild()) { if (M && M.err) djMsg(M.err); return; }
      const { bed, top } = M;
      if (DJ.trans) djMixEnd(true);
      if (DJ.mash) endMash();
      if (top.playing) { top.p0 = djPos(top); djStopSrc(top, ctx.currentTime); top.playing = false; }
      if (DJ.stretchOK && DJ.keylock === false && (Math.abs(M.rate - 1) > 0.004 || M.semi)) { const kb = document.getElementById("djKeyLock"); if (kb) kb.click(); }
      DJ.lead = bed.i;
      top.bpm0 = M.vbpm; top.rate = Math.max(0.5, Math.min(2, M.bpm / top.bpm0)); top.bend = 1; top.semi = M.semi || 0; top.loop = null; bed.loop = null;
      top.mashGain = M.gain;
      if (Math.abs((bed.rate || 1) - M.bedRate) > 0.0005) djSetRate(bed, M.bedRate);
      DJ.xf = 0.5; djApplyXf();
      const now = ctx.currentTime;
      let T0, Tv;
      if (M.stems) {
        // the instrumental keeps time; the vocal just plays at the matched speed, so a doubtful vocal grid can't pull it
        DJ.sync = false;
        let bedT, bedPos;
        if (bed.playing) { bedT = now; bedPos = djPos(bed); } else { bedT = now + 0.3; bedPos = M.bedStart; djStartSrc(bed, bedT, bedPos); }
        const TP = bedT + (M.P - bedPos) / (bed.rate * bed.bend);
        Tv = TP - M.lead / top.rate; let from = M.topAt;
        if (Tv < now + 0.05) { from = M.topAt + (now + 0.05 - Tv) * top.rate; Tv = now + 0.05; }
        T0 = Tv;
        mashSet(bed, M.room ? "pocket" : "full", Tv, 0.05);
        mashSet(top, "vox", Tv, 0.01);
        djStartSrc(top, Tv, from);
      } else {
        DJ.sync = true;
        if (bed.playing) T0 = now + Math.max(0.06, (M.bedAt - djPos(bed)) / (bed.rate * bed.bend));
        else { T0 = now + 0.3; djStartSrc(bed, T0, M.bedAt); }
        mashSet(bed, M.bedVox ? "under" : "full", T0 - 0.005, 0.01);
        mashSet(top, M.topVox ? "over" : "full", T0, 0.01);
        djStartSrc(top, T0, M.topAt);
      }
      DJ.mash = { bed, top, T0, M, stems: M.stems, bedMode: M.bedMode, topMode: M.topMode };
      djPaintAll(); djPaintDeck(top); djPaintDeck(bed);
      djMsg("✦ Mashup: " + (M.stems ? "the vocal from " + "AB"[top.i] + " over " + "AB"[bed.i] : "AB"[top.i] + " on top of " + "AB"[bed.i]) + (T0 - now > 1 ? " in " + fmt(T0 - now) : "") + (M.semi ? " · " + (M.semi > 0 ? "+" : "") + M.semi + " st" : "") + " · tap ✦ Mashup to change or end it");
    }
    function swapMash() {
      const R = DJ.mash; if (!R) return;
      if (R.stems) { djMsg("A vocal over an instrumental: nudge the vocal instead"); return; }
      const nb = djNextBoundary(R.bed, 4), t = ctx.currentTime + Math.max(0.03, (nb.pos - djPos(R.bed)) / (R.bed.rate * R.bed.bend));
      const was = { bed: R.bed, top: R.top, bm: R.bedMode, tm: R.topMode };
      R.bed = was.top; R.top = was.bed;
      R.bedMode = R.bed.vox && R.bed.vox.mono ? "full" : "under"; R.topMode = "over";
      R.top.mashGain = Math.max(0.5, Math.min(2, ((R.bed.vox && R.bed.vox.loud) || 1) / ((R.top.vox && R.top.vox.loud) || 1)));
      mashSet(R.bed, R.bedMode, t, 0.01); mashSet(R.top, R.topMode, t, 0.01);
      djMsg("✦ Mashup: " + "AB"[R.top.i] + " goes on top on the next bar");
    }
    function endMash(msg) {
      const R = DJ.mash; if (!R) return; DJ.mash = null;
      [R.bed, R.top].forEach(d => { if (d.mash) mashSet(d, "full", ctx.currentTime, 0.15); });
      if (msg) djMsg(msg);
      djPaintAll();
    }
    setInterval(() => { const R = DJ.mash; if (R && ctx && ctx.currentTime > R.T0 + 1 && (!R.bed.playing || !R.top.playing)) endMash("✦ Mashup over: " + "AB"[(!R.bed.playing ? R.bed : R.top).i] + " stopped, the other plays on full"); }, 500);
    window.__nbMash = { plan: () => MASH, live: () => DJ.mash, scan: mashScan };

    // ---- what Smart mix is doing, where you can see it ----
    {
      const top0 = document.querySelector("#djView .dj-top");
      const bar = document.createElement("div"); bar.className = "sm-live"; bar.id = "smLive"; bar.hidden = true; bar.setAttribute("role", "status");
      bar.innerHTML = '<span class="sml-dot"></span><span class="sml-txt"><b></b><small></small></span><span class="sml-step"></span><span class="sml-btns"></span>';
      if (top0) top0.after(bar);
      const txB = bar.querySelector(".sml-txt b"), txS = bar.querySelector(".sml-txt small"), stepEl = bar.querySelector(".sml-step"), btns = bar.querySelector(".sml-btns");
      let btnSig = "";
      const setBtns = (sig, list) => { if (sig === btnSig) return; btnSig = sig; btns.innerHTML = ""; list.forEach(([t, fn, cls]) => { const b = document.createElement("button"); b.className = "btn" + (cls ? " " + cls : ""); b.textContent = t; b.addEventListener("click", fn); btns.appendChild(b); }); };
      const set = (el, t) => { if (el.textContent !== t) el.textContent = t; };
      // how far apart the two songs' beats are, in fractions of a beat
      const beatGap = (a, b) => {
        if (!a.bpm0 || !b.bpm0 || !a.playing || !b.playing) return null;
        const ph = d => { const x = (djPos(d) - (d.off || 0)) / djPer(d); return x - Math.floor(x); };
        let g = Math.abs(ph(a) - ph(b)); if (g > 0.5) g = 1 - g; return g;
      };
      const badge = (d, t, cls) => {
        const el = deckEls[d.i]; if (!el) return; let b = el.querySelector(".dj-role");
        if (!b) { b = document.createElement("span"); b.className = "dj-role"; const dh = el.querySelector(".dj-dh"); if (!dh) return; dh.insertBefore(b, dh.querySelector(".dj-name")); }
        b.hidden = !t; set(b, t || ""); b.dataset.k = cls || "";
      };
      function paintLive() {
        if (djEl.hidden) return;
        const R = DJ.mash, T = DJ.trans && DJ.trans.smart ? DJ.trans : null;
        bar.hidden = !R && !T;
        if (!R && !T) { DJ.decks.forEach(d => badge(d, "")); return; }
        const now = ctx ? ctx.currentTime : 0, L = d => "AB"[d.i];
        if (R) {
          const waiting = R.T0 > now + 0.05;
          bar.dataset.k = "mash";
          set(txB, waiting ? "✦ Mashup starts in " + fmt(R.T0 - now) : "✦ Mashup on");
          set(txS, (R.stems ? L(R.top) + "'s vocal over " + L(R.bed) + "'s instrumental" + (R.bedMode === "pocket" ? " (room made for the voice)" : "") : L(R.top) + " on top" + (R.topMode === "over" ? " (vocals and leads)" : " (full)") + " · " + L(R.bed) + " underneath" + (R.bedMode === "under" ? " (vocals down)" : " (full)")) + " · " + (djEff(R.bed) * R.bed.bend).toFixed(1) + " BPM" + (R.top.semi ? " · " + L(R.top) + " " + (R.top.semi > 0 ? "+" : "") + R.top.semi + " st" : ""));
          badge(R.top, R.stems ? "VOCAL" : "ON TOP", "top"); badge(R.bed, R.stems ? "INSTRUMENTAL" : "UNDERNEATH", "under");
          setBtns(R.stems ? "mashS" : "mash", (R.stems ? [["−1 beat", () => nudgeMash(-1)], ["+1 beat", () => nudgeMash(1)]] : [["Swap", () => { swapMash(); }]]).concat([["Card", () => { renderMash(true); smGoLabel("mash", true); smSheet.hidden = false; }], ["End", () => endMash("✦ Mashup ended: both songs play full"), "sml-end"]]));
        } else {
          const { from, to } = T, barS = T.beat * 4;
          bar.dataset.k = "mix";
          if (T.smart.pending) {
            const left = Math.max(0, (T.t0 - now) / barS);
            set(txB, "✦ Smart mix: " + L(to) + " comes in " + (left < 1 ? "on the next bar" : "in " + Math.ceil(left) + " bar" + (Math.ceil(left) > 1 ? "s" : "")));
            set(txS, "out of " + L(from) + " at " + fmt(T.smart.outPos) + " · " + DJ_STYLES[T.style][0] + (T.style === "cut" ? "" : " over " + T.bars + " bars") + " · keep " + L(from) + " playing");
            badge(from, "OUT IN " + Math.max(0, Math.ceil(left)), "out"); badge(to, "WAITING", "in");
          } else {
            const done = Math.min(T.bars, Math.max(0, (now - T.t0) / barS));
            set(txB, "✦ Mixing " + L(from) + " → " + L(to) + ": bar " + Math.min(T.bars, Math.floor(done) + 1) + " of " + T.bars);
            set(txS, DJ_STYLES[T.style][0] + " · " + (djEff(to) * to.bend).toFixed(1) + " BPM");
            badge(from, "MIXING OUT", "out"); badge(to, "COMING IN", "in");
          }
          setBtns("mix", [["Card", () => { if (window.__nbSmart) openSmart(); }], ["Cancel", () => { djMixEnd(true); djMsg("Smart mix cancelled"); djPaintAll(); }, "sml-end"]]);
        }
        // in step: the two songs' beats land together
        const a = R ? R.bed : T.from, b = R ? R.top : T.to, g = R && R.stems ? (a.playing && b.playing && Math.abs(djEff(a) * a.bend - djEff(b) * b.bend) < 0.05 ? 0 : 1) : beatGap(a, b);
        if (g == null) { set(stepEl, ""); stepEl.dataset.k = ""; }
        else if (R && R.stems) { const ok = g === 0; set(stepEl, ok ? "● same tempo" : "● tempos differ"); stepEl.dataset.k = ok ? "ok" : "off"; }
        else { const ok = g < 0.06; set(stepEl, ok ? "● in step" : "● drifting " + Math.round(g * 100) + "% of a beat"); stepEl.dataset.k = ok ? "ok" : "off"; }
      }
      setInterval(paintLive, 250);
      const pa2 = djPaintAll; djPaintAll = function () { const r = pa2.apply(this, arguments); try { paintLive(); } catch (e) {} return r; };
    }

    // the incoming song starts exactly when the playing one reaches the mix-out point
    { const ms = djMixStep; djMixStep = function () {
        const T = DJ.trans;
        if (T && T.smart && T.smart.pending && ctx) {
          const { from, to } = T;
          if (!from.playing) { djMixEnd(true); djMsg("Smart mix cancelled: " + "AB"[from.i] + " stopped"); return; }
          if (to.playing) T.smart.pending = false;   // "go now" on MIX IN
          else {
            const sp = from.rate * from.bend, rem = (T.smart.outPos - djPos(from)) / sp;
            if (rem < -0.5) { T.smart.outPos = djNextBoundary(from, 4).pos; return; }   // jumped past it: the next bar
            if (rem <= 0.6) {
              const at = ctx.currentTime + Math.max(0.03, rem); T.t0 = at; T.cutAt = at;
              djStartSrc(to, at, T.smart.inPos);
              if (T.style === "cut") {
                to.xfg.gain.setValueAtTime(to.i === 0 ? Math.cos(DJ.xf * Math.PI / 2) : Math.sin(DJ.xf * Math.PI / 2), ctx.currentTime); to.xfg.gain.setValueAtTime(1, at);
                from.xfg.gain.setValueAtTime(from.i === 0 ? Math.cos(DJ.xf * Math.PI / 2) : Math.sin(DJ.xf * Math.PI / 2), ctx.currentTime); from.xfg.gain.setValueAtTime(0, at);
              }
              if (T.idx >= 0 && DJ.crate[T.idx]) DJ.crate[T.idx].played = Date.now();
              T.smart.pending = false;
            } else { T.t0 = ctx.currentTime + rem; T.cutAt = T.t0; }
          }
        }
        return ms.apply(this, arguments);
      }; }
    { const pa = djPaintAll; djPaintAll = function () {
        const r = pa.apply(this, arguments);
        const T = DJ.trans, on = !!(T && T.smart);
        if (preparing) return r;
        smBtn.classList.toggle("on", on || !!DJ.mash);
        smBtn.textContent = on ? (T.smart.pending ? "✦ In " + Math.max(0, Math.ceil((T.t0 - ctx.currentTime) / T.beat / 4)) + " bars · ✕" : "✦ Mixing · ✕") : DJ.mash ? "✦ Mashup" : "✦ Smart mix";
        return r;
      }; }
    setInterval(() => {
      const T = DJ.trans; if (!T || !T.smart || djEl.hidden || preparing) return;
      const tx = T.smart.pending ? "✦ In " + Math.max(0, Math.ceil((T.t0 - ctx.currentTime) / T.beat / 4)) + " bars · ✕" : "✦ Mixing · ✕";
      if (smBtn.textContent !== tx) smBtn.textContent = tx;
    }, 500);
    smBtn.addEventListener("click", openSmart);
    document.getElementById("smCancel").addEventListener("click", () => { smSheet.hidden = true; if (!DJ.mash) { PLAN = null; MASH = null; djMsg(djHint()); } });
    smGo.addEventListener("click", () => {
      const act = smGo.dataset.act || "mix"; smSheet.hidden = true;
      if (act === "end") { endMash("✦ Mashup ended: both songs play full"); return; }
      if (act === "mash") { const M = MASH; MASH = null; PLAN = null; startMash(M); return; }
      const P = PLAN; PLAN = null; MASH = null; startSmart(P);
    });
    window.__nbSmart = { plan: () => PLAN, open: openSmart, seek: (i, p) => djSeek(DJ.decks[i], p) };
  }
