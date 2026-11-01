/* Nate Bloom Stage: Learning (161). The chart beside the instrument: a big keyboard with the tablet's scale, the chord
   the band is on and the notes held right now, the chords of the key with the ones that usually come next, and which
   of Live's pads sit in the key. Everything comes from the state document and the band message; nothing here changes
   the tablet. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const X = () => window.__stage;
  const NN = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const SCALES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], pmaj: [0, 2, 4, 7, 9], pmin: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10], dor: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10], lyd: [0, 2, 4, 6, 7, 9, 11], hmin: [0, 2, 3, 5, 7, 8, 11], phry: [0, 1, 3, 5, 7, 8, 10], whole: [0, 2, 4, 6, 8, 10], jin: [0, 2, 3, 7, 8], arab: [0, 1, 4, 5, 7, 8, 11] };
  const SCALE_NAMES = { off: "no scale", maj: "major", min: "minor", pmaj: "pentatonic major", pmin: "pentatonic minor", blues: "blues", dor: "Dorian", mixo: "Mixolydian", lyd: "Lydian", hmin: "harmonic minor", phry: "Phrygian", whole: "whole tone", jin: "Hirajōshi", arab: "double harmonic" };
  const CHORD_IV = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], sus4: [0, 5, 7], sus2: [0, 2, 7], aug: [0, 4, 8] };
  const QN = { maj: "", min: "m", dim: "°", "7": "7", maj7: "maj7", min7: "m7", sus4: "sus4", sus2: "sus2", aug: "+" };
  // the chords of a key: diatonic triads, with the moves that come up most
  const DIAT = { maj: [["I", 0, "maj"], ["ii", 2, "min"], ["iii", 4, "min"], ["IV", 5, "maj"], ["V", 7, "maj"], ["vi", 9, "min"], ["vii°", 11, "dim"]], min: [["i", 0, "min"], ["ii°", 2, "dim"], ["III", 3, "maj"], ["iv", 5, "min"], ["v", 7, "min"], ["VI", 8, "maj"], ["VII", 10, "maj"]] };
  const NEXT = { maj: { I: ["IV", "V", "vi", "ii"], ii: ["V", "IV", "vii°"], iii: ["vi", "IV"], IV: ["V", "I", "ii"], V: ["I", "vi", "IV"], vi: ["IV", "ii", "V"], "vii°": ["I", "iii"] },
                 min: { i: ["iv", "VI", "VII", "v"], "ii°": ["v", "VII"], III: ["VI", "iv"], iv: ["v", "i", "VII"], v: ["i", "VI"], VI: ["VII", "iv", "III"], VII: ["III", "i"] } };
  const L = { el: null, keys: [], lo: 48, n: 36, sig: "", built: false };
  function keyOf() { try { const d = window.__console && __console.doc, k = d && d.transport && d.transport.key; return k ? { root: ((k.root % 12) + 12) % 12, scale: k.scale || "off" } : { root: 0, scale: "off" }; } catch (e) { return { root: 0, scale: "off" }; } }
  function chordNow() { const S = X(); const b = S && S.band; return b && b.chord && b.on ? { root: ((b.chord.root % 12) + 12) % 12, q: b.chord.q || "maj" } : null; }
  function heldNow() { try { const d = window.__console && __console.doc; return (d && d.keys && d.keys.held) || []; } catch (e) { return []; } }
  const nameToMidi = s => { const m = /^([A-G])(♯|#|♭|b)?(-?\d+)$/.exec(String(s).trim()); if (!m) return null; const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]]; const acc = m[2] === "♯" || m[2] === "#" ? 1 : m[2] ? -1 : 0; return (parseInt(m[3], 10) + 1) * 12 + base + acc; };
  function build() {
    if (L.built) return; L.built = true;
    const kb = $("lnKeys"); kb.innerHTML = ""; L.keys = [];
    const whites = [], blacks = [];
    for (let i = 0; i < L.n; i++) { const m = L.lo + i, pc = m % 12, black = [1, 3, 6, 8, 10].includes(pc); const k = document.createElement("div"); k.className = "lk " + (black ? "lk-b" : "lk-w"); k.dataset.m = m; k.innerHTML = `<span></span><small>${pc === 0 ? "C" + (Math.floor(m / 12) - 1) : ""}</small>`; (black ? blacks : whites).push(k); L.keys.push(k); }
    const nW = whites.length; whites.forEach((k, i) => { k.style.left = (i * 100 / nW) + "%"; k.style.width = (100 / nW) + "%"; kb.appendChild(k); });
    let wi = -1; for (let i = 0; i < L.n; i++) { const m = L.lo + i, pc = m % 12, black = [1, 3, 6, 8, 10].includes(pc); if (!black) { wi++; continue; } const k = L.keys[i]; k.style.left = ((wi + 1) * 100 / nW - 100 / nW * 0.3) + "%"; k.style.width = (100 / nW * 0.6) + "%"; kb.appendChild(k); }
  }
  function paint() {
    const S = X(); if (!S || S.view !== "vLearn") return; build();
    const key = keyOf(), ch = chordNow(), held = heldNow().map(nameToMidi).filter(m => m != null);
    const scaleSet = SCALES[key.scale] ? new Set(SCALES[key.scale].map(i => (i + key.root) % 12)) : null;
    const chordSet = ch ? new Set((CHORD_IV[ch.q] || CHORD_IV.maj).map(i => (i + ch.root) % 12)) : null;
    L.keys.forEach(k => { const m = +k.dataset.m, pc = m % 12; k.classList.toggle("in", !!(scaleSet && scaleSet.has(pc))); k.classList.toggle("out", !!(scaleSet && !scaleSet.has(pc))); k.classList.toggle("root", !!(scaleSet && pc === key.root)); k.classList.toggle("ch", !!(chordSet && chordSet.has(pc))); k.classList.toggle("chroot", !!(ch && pc === ch.root)); k.classList.toggle("held", held.includes(m)); const s = k.querySelector("span"); const t = chordSet && chordSet.has(pc) ? NN[pc] : scaleSet && scaleSet.has(pc) ? NN[pc] : ""; if (s.textContent !== t) s.textContent = t; });
    $("lnKey").textContent = key.scale === "off" ? "No scale on the tablet (Live → Scale): every note shown" : NN[key.root] + " " + (SCALE_NAMES[key.scale] || key.scale) + " · " + (scaleSet ? [...scaleSet].sort((a, b) => ((a - key.root + 12) % 12) - ((b - key.root + 12) % 12)).map(pc => NN[pc]).join(" ") : "");
    $("lnChord").textContent = ch ? NN[ch.root] + (QN[ch.q] != null ? QN[ch.q] : ch.q) + " · " + (CHORD_IV[ch.q] || CHORD_IV.maj).map(i => NN[(i + ch.root) % 12]).join(" ") : "The band is off (Hands → Band): hold a chord on the tablet and it shows here";
    $("lnHeld").textContent = held.length ? heldNow().join("  ") : "—";
    // the chords of the key and what usually comes next
    const mode = key.scale === "min" || key.scale === "pmin" || key.scale === "dor" || key.scale === "hmin" || key.scale === "phry" || key.scale === "blues" ? "min" : "maj";
    const diat = DIAT[mode].map(([num, iv, q]) => ({ num, root: (key.root + iv) % 12, q, name: NN[(key.root + iv) % 12] + QN[q] }));
    const cur = ch ? diat.find(d => d.root === ch.root) : null;
    const nexts = cur ? (NEXT[mode][cur.num] || []) : [];
    const html = diat.map(d => `<span class="chip${cur && d.num === cur.num ? " now" : nexts.includes(d.num) ? " next" : ""}"><b>${d.num}</b> ${d.name}</span>`).join("");
    const box = $("lnChords"); if (box.__html !== html) { box.__html = html; box.innerHTML = html; }
    $("lnNext").textContent = cur ? "After " + cur.name + ", what usually comes: " + nexts.map(n => { const d = diat.find(x => x.num === n); return d ? d.name + " (" + n + ")" : n; }).join(", ") : key.scale === "off" ? "Pick a scale on the tablet and the chords of the key appear here." : "Start the band on a chord of the key and the next moves light up.";
    // Live's pads: those named after a note sit in the key or not
    const d = window.__console && __console.doc, pads = d && d.pads && d.pads.n || [];
    const ph = pads.map((nm, i) => { const m = nameToMidi(String(nm).split(/\s|·/)[0]); const pc = m == null ? null : m % 12; const cls = pc == null ? "" : scaleSet ? (scaleSet.has(pc) ? (chordSet && chordSet.has(pc) ? " now" : " in") : " out") : ""; return `<span class="chip${cls}"><b>${i + 1}</b> ${String(nm).replace(/[&<>]/g, "")}</span>`; }).join("");
    const pb = $("lnPads"); if (pb.__html !== ph) { pb.__html = ph; pb.innerHTML = ph || '<span class="note">No pad names from the tablet yet.</span>'; }
    $("lnPadsSay").textContent = pads.length ? (d.pads.name || "Pads") + ": pads named after a note are marked in the key (green), in the chord (lilac) or out (dim)." : "";
  }
  setInterval(paint, 300);
  window.__learn = { paint, keyOf, chordNow, heldNow, DIAT, NEXT, nameToMidi };
})();
