// Builds Nate Bloom's own plugins: compiles src/*.dsp with the Faust compiler (libfaust-wasm, from
// github.com/grame-cncm/faustwasm) and writes each plugin folder (dsp.wasm, dsp.json, meta.json, index.js) plus
// catalog-natebloom.json for wam/catalog.json.   usage: node build.mjs <path to libfaust-wasm folder>
import fs from "fs"; import path from "path"; import { pathToFileURL, fileURLToPath } from "url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), LF = path.resolve(process.argv[2] || "libfaust-wasm");
const BUILD = 1;

// type: the group it's listed under; voices: polyphony for instruments; presets: name → values (by parameter id)
const SPEC = [
  { id: "hall", type: "Reverb", blurb: "A big, smooth stereo hall that keeps its low end apart from its shimmer. Long decays for ambient washes.",
    presets: { "Concert hall": { predelay: 40, decay: 3.2, lowdecay: 4, brightness: 6500, width: 100, mix: 25 }, "Cathedral": { predelay: 70, decay: 8.5, lowdecay: 10, brightness: 4200, width: 120, mix: 35 },
      "Ambient wash": { predelay: 110, decay: 14, lowdecay: 12, brightness: 3800, width: 140, mix: 50 }, "Small room": { predelay: 20, decay: 1, lowdecay: 1.1, brightness: 9000, width: 80, mix: 18 } } },
  { id: "plate", type: "Reverb", blurb: "The classic studio plate: dense, bright and quick to bloom. Lovely on vocals, snares and keys.",
    presets: { "Vocal plate": { predelay: 20, decay: 70, damping: 25, bandwidth: 80, mix: 22 }, "Long plate": { predelay: 35, decay: 92, damping: 35, bandwidth: 70, mix: 35 }, "Dark plate": { predelay: 10, decay: 80, damping: 70, bandwidth: 45, mix: 28 } } },
  { id: "cloud", type: "Granular", blurb: "Grains of what you play, scattered in time and pitch and fed back into themselves. Set Pitch to 0 / +12 for shimmering clouds.",
    menus: { pitch: [["−12", 0], ["0", 1], ["+7", 2], ["+12", 3], ["0 / +12", 4]] },
    presets: { "Shimmer cloud": { grainsize: 160, density: 75, pitch: 4, scatter: 50, feedback: 45, spread: 90, mix: 45 }, "Frozen dust": { grainsize: 60, density: 95, pitch: 1, scatter: 90, feedback: 70, spread: 100, mix: 55 },
      "Octave down drone": { grainsize: 400, density: 60, pitch: 0, scatter: 30, feedback: 55, spread: 70, mix: 50 }, "Fifths": { grainsize: 220, density: 70, pitch: 2, scatter: 40, feedback: 40, spread: 80, mix: 40 } } },
  { id: "tapeecho", type: "Delay", blurb: "Repeats that darken, saturate and wobble like worn tape, bouncing left and right. Push Feedback past 100% for runaway echoes.",
    presets: { "Dub": { time: 420, feedback: 72, wowflutter: 30, tone: 1800, saturation: 55, pingpong: 80, mix: 35 }, "Slapback": { time: 110, feedback: 10, wowflutter: 15, tone: 6000, saturation: 25, pingpong: 0, mix: 30 },
      "Space echo": { time: 300, feedback: 60, wowflutter: 55, tone: 2600, saturation: 45, pingpong: 50, mix: 40 }, "Runaway": { time: 520, feedback: 108, wowflutter: 40, tone: 2200, saturation: 70, pingpong: 70, mix: 40 } } },
  { id: "ensemble", type: "Modulation", blurb: "The three-voice string-machine ensemble: slow swirl plus fast shimmer, the sound of a Solina and Vangelis-era pads.",
    presets: { "String machine": { depth: 75, speed: 50, width: 90, mix: 60 }, "Subtle": { depth: 35, speed: 35, width: 70, mix: 35 }, "Seasick": { depth: 100, speed: 85, width: 100, mix: 70 } } },
  { id: "junochorus", type: "Modulation", blurb: "The Juno-60's bucket-brigade chorus: I, II, or both at once for the fast, shimmering vibrato.",
    menus: { mode: [["I", 0], ["II", 1], ["I + II", 2]] } },
  { id: "tape", type: "Saturation", blurb: "A tape machine: soft saturation, a low-end bump, rolled-off highs, wow and flutter and a little hiss. Age takes it from fresh to worn." ,
    presets: { "Warm": { drive: 6, age: 20, wowflutter: 10, hiss: 4, output: 0 }, "Cassette": { drive: 10, age: 60, wowflutter: 45, hiss: 20, output: -1 }, "Old reel": { drive: 14, age: 85, wowflutter: 70, hiss: 35, output: -2 } } },
  { id: "lofi", type: "Saturation", blurb: "Fewer bits, a lower sample rate, a worn-record wobble, crackle and a dark filter.",
    presets: { "Sampler (12-bit)": { bits: 12, samplerate: 26000, wobble: 10, dust: 5, tone: 12000, mix: 100 }, "Dusty record": { bits: 14, samplerate: 32000, wobble: 40, dust: 55, tone: 5000, mix: 100 },
      "Crushed": { bits: 5, samplerate: 6000, wobble: 0, dust: 0, tone: 9000, mix: 80 } } },
  { id: "ladder", type: "Equalizer & Filter", blurb: "A Moog-style ladder filter with an LFO and an envelope follower: slow sweeps, swells, or wah when you play harder.",
    presets: { "Slow sweep": { cutoff: 900, resonance: 45, lforate: 0.08, lfodepth: 70, envelope: 0, drive: 3, mix: 100 }, "Envelope wah": { cutoff: 400, resonance: 60, lforate: 0.5, lfodepth: 0, envelope: 80, drive: 2, mix: 100 },
      "Dark": { cutoff: 700, resonance: 15, lforate: 0.2, lfodepth: 10, envelope: 0, drive: 0, mix: 100 } } },
  { id: "compressor", type: "Dynamics", blurb: "Glue for the whole mix. Lower Mix for parallel (New York) compression: punch without losing the transients.",
    presets: { "Mix glue": { threshold: -14, ratio: 2, attack: 20, release: 200, makeup: 3, mix: 100 }, "Punchy": { threshold: -20, ratio: 4, attack: 15, release: 120, makeup: 6, mix: 100 }, "New York": { threshold: -30, ratio: 8, attack: 3, release: 100, makeup: 10, mix: 40 } } },
  { id: "autopan", type: "Modulation", blurb: "Tremolo (Pan at 0) or auto-pan (Pan at 100): smooth or choppy." },
  { id: "ringmod", type: "Modulation", blurb: "A ring modulator for bells, metallic shimmer and alien drones, with a slow drift on the carrier." },
  // (203) the Linux app's builds of four of these (src/*hq.dsp); not in the catalog: the Linux app points the originals' keys at them
  { id: "ladderhq", hidden: true, type: "Equalizer & Filter", blurb: "The Moog ladder as Huovilainen modelled it: it drives, squelches and self-oscillates. An LFO, free or in time with the song, and an envelope follower move it.",
    menus: { lfosync: [["Free", 0], ["1 bar", 1], ["1/2", 2], ["1/4", 3], ["1/8", 4], ["1/16", 5], ["1/4 dotted", 6], ["1/8 dotted", 7], ["1/4 triplet", 8], ["1/8 triplet", 9]], lfoshape: [["Sine", 0], ["Triangle", 1], ["Saw up", 2], ["Saw down", 3], ["Random", 4]] },
    presets: { "Slow sweep": { cutoff: 900, resonance: 45, lforate: 0.08, lfodepth: 70, envelope: 0, drive: 3, mix: 100 }, "Envelope wah": { cutoff: 400, resonance: 60, lforate: 0.5, lfodepth: 0, envelope: 80, drive: 2, mix: 100 },
      "Dark": { cutoff: 700, resonance: 15, lforate: 0.2, lfodepth: 10, envelope: 0, drive: 0, mix: 100 }, "Acid squelch": { cutoff: 500, resonance: 88, lforate: 1, lfodepth: 35, envelope: 60, drive: 10, mix: 100, lfosync: 4, lfoshape: 0 },
      "1/8 gate wobble": { cutoff: 600, resonance: 55, lforate: 1, lfodepth: 85, envelope: 0, drive: 4, mix: 100, lfosync: 4, lfoshape: 1 }, "Self-oscillating": { cutoff: 880, resonance: 100, lforate: 0.1, lfodepth: 0, envelope: 0, drive: 0, mix: 100 } } },
  { id: "compressorhq", hidden: true, type: "Dynamics", blurb: "Glue for the whole mix on Airwindows Pressure4's gain computer, with Console saturation. Lower Mix for parallel (New York) compression.",
    presets: { "Mix glue": { threshold: -14, ratio: 2, release: 200, makeup: 3, console: 30, mix: 100 }, "Punchy": { threshold: -20, ratio: 4, release: 120, makeup: 6, console: 40, mix: 100 }, "New York": { threshold: -30, ratio: 8, release: 100, makeup: 10, console: 20, mix: 40 }, "Clean": { threshold: -16, ratio: 2.5, release: 250, makeup: 3, console: 0, mix: 100 } } },
  { id: "autopanhq", hidden: true, type: "Modulation", blurb: "Tremolo (Pan at 0) or auto-pan (Pan at 100), free or in time with the song; five waves, smooth or choppy.",
    menus: { sync: [["Free", 0], ["1 bar", 1], ["1/2", 2], ["1/4", 3], ["1/8", 4], ["1/16", 5], ["1/4 dotted", 6], ["1/8 dotted", 7], ["1/4 triplet", 8], ["1/8 triplet", 9]], wave: [["Sine", 0], ["Triangle", 1], ["Saw up", 2], ["Saw down", 3], ["Random", 4]] },
    presets: { "1/8 tremolo": { rate: 2, depth: 80, shape: 30, pan: 0, sync: 4, wave: 0 }, "1/4 auto-pan": { rate: 2, depth: 90, shape: 0, pan: 100, sync: 3, wave: 1 }, "1/16 chop": { rate: 2, depth: 100, shape: 100, pan: 0, sync: 5, wave: 0 }, "Random steps": { rate: 4, depth: 70, shape: 0, pan: 100, sync: 5, wave: 4 } } },
  { id: "ringmodhq", hidden: true, type: "Modulation", blurb: "A ring modulator for bells, metallic shimmer and alien drones: four carrier waves and a sweep, free or in time with the song.",
    menus: { wave: [["Sine", 0], ["Triangle", 1], ["Square", 2], ["Saw", 3]], sync: [["Free", 0], ["1 bar", 1], ["1/2", 2], ["1/4", 3], ["1/8", 4], ["1/16", 5], ["1/4 dotted", 6], ["1/8 dotted", 7], ["1/4 triplet", 8], ["1/8 triplet", 9]] },
    presets: { "Bells": { frequency: 440, drift: 10, mix: 45, wave: 0, sweep: 0 }, "Robot": { frequency: 60, drift: 0, mix: 70, wave: 2, sweep: 0 }, "1 bar sweep": { frequency: 300, drift: 10, mix: 50, wave: 1, sweep: 60, sync: 1 }, "Alien drone": { frequency: 150, drift: 60, mix: 60, wave: 3, sweep: 40, sweeprate: 0.1, sync: 0 } } },
  { id: "marimba", type: "Physical model", kind: "instrument", voices: 8, blurb: "Wooden bars and tube resonators struck with a mallet. Hard mallets bring out the attack; soft ones the tone. Play harder and the mallet hits harder.",
    presets: { "Soft mallets": { mallet: 20, decay: 1.8, brightness: 3500, strikeposition: 1, level: 80 }, "Hard mallets": { mallet: 85, decay: 1.2, brightness: 12000, strikeposition: 1, level: 75 }, "Ringing": { mallet: 50, decay: 4.5, brightness: 7000, strikeposition: 0, level: 75 },
      "Concert marimba": { mallet: 40, decay: 2.2, brightness: 7500, strikeposition: 1, level: 80, velocity: 70, resonator: 100 }, "Xylophone-ish": { mallet: 95, decay: 0.45, brightness: 16000, strikeposition: 2, level: 70, velocity: 50, resonator: 40 },
      "Mellow bass marimba": { mallet: 15, decay: 3.5, brightness: 2500, strikeposition: 1, level: 85, velocity: 50, resonator: 100 }, "Dry wood": { mallet: 60, decay: 0.3, brightness: 9000, strikeposition: 3, level: 80, velocity: 60, resonator: 0 },
      "Kalimba-like": { mallet: 70, decay: 2.8, brightness: 10000, strikeposition: 4, level: 70, velocity: 60, resonator: 30 } } },
  { id: "nylon", type: "Physical model", kind: "instrument", voices: 8, blurb: "A classical guitar string and body. Pluck near the bridge for bite, toward the middle for warmth; letting go damps the string.",
    presets: { "Classical": { pluckposition: 80, tone: 7000, level: 80, body: 55, release: 400 }, "Warm fingers": { pluckposition: 55, tone: 3500, level: 85, body: 70, release: 600 }, "Ponticello": { pluckposition: 92, tone: 14000, level: 75, body: 35, release: 300 },
      "Bossa": { pluckposition: 65, tone: 5000, level: 80, body: 65, release: 250 }, "Harp-like": { pluckposition: 45, tone: 9000, level: 75, body: 30, release: 2500 }, "Muted pluck": { pluckposition: 75, tone: 2500, level: 90, body: 50, release: 60 } } },
  { id: "violin", type: "Physical model", kind: "instrument", voices: 6, blurb: "A bowed string through a violin body: bow pressure and position, slow or sharp attacks, and vibrato that grows as the note sustains.",
    presets: { "Slow swell": { attack: 600, release: 900, bowpressure: 40, bowposition: 70, vibrato: 50, level: 75 }, "Spiccato": { attack: 4, release: 60, bowpressure: 65, bowposition: 80, vibrato: 0, level: 75 },
      "Solo violin": { attack: 120, release: 400, bowpressure: 50, bowposition: 70, vibrato: 60, level: 75, body: 70 }, "Sul tasto": { attack: 250, release: 600, bowpressure: 30, bowposition: 35, vibrato: 35, level: 80, body: 60 },
      "Sul ponticello": { attack: 80, release: 300, bowpressure: 55, bowposition: 92, vibrato: 20, level: 70, body: 45 }, "Fiddle": { attack: 30, release: 150, bowpressure: 60, bowposition: 75, vibrato: 25, level: 75, body: 55 } } },
  { id: "flute", type: "Physical model", kind: "instrument", voices: 6, blurb: "Breath, embouchure and vibrato that blooms as the note holds: breathy and soft or bright and pure.",
    presets: { "Concert flute": { attack: 40, release: 160, breath: 30, embouchure: 50, vibrato: 45, level: 75 }, "Breathy": { attack: 120, release: 300, breath: 75, embouchure: 45, vibrato: 30, level: 80 }, "Pan pipe": { attack: 20, release: 200, breath: 55, embouchure: 30, vibrato: 10, level: 80 },
      "Piccolo bright": { attack: 15, release: 100, breath: 20, embouchure: 75, vibrato: 50, level: 65 }, "Shakuhachi-ish": { attack: 200, release: 400, breath: 90, embouchure: 40, vibrato: 70, level: 80 } } },
  { id: "clarinet", type: "Physical model", kind: "instrument", voices: 6, blurb: "Reed stiffness and bell opening shape a woody, hollow tone; vibrato comes in as the note holds.",
    presets: { "Clarinet": { attack: 30, release: 120, reed: 50, bell: 50, vibrato: 25, level: 70 }, "Soft chalumeau": { attack: 80, release: 250, reed: 30, bell: 30, vibrato: 15, level: 75 }, "Bright reed": { attack: 15, release: 100, reed: 75, bell: 80, vibrato: 30, level: 65 },
      "Klezmer": { attack: 20, release: 150, reed: 65, bell: 60, vibrato: 70, level: 70 }, "Dark woodwind": { attack: 60, release: 200, reed: 35, bell: 15, vibrato: 10, level: 75 } } },
  { id: "voice", type: "Physical model", kind: "instrument", voices: 6, blurb: "A singing voice, bass to soprano, with vowels you can glide between: choirs and vocal pads.",
    menus: { voice: [["Bass", 0], ["Tenor", 1], ["Countertenor", 2], ["Alto", 3], ["Soprano", 4]] },
    presets: { "Choir aah": { voice: 3, vowel: 0, attack: 400, release: 1200, vibrato: 35, level: 70 }, "Deep ooh": { voice: 0, vowel: 4, attack: 300, release: 1500, vibrato: 25, level: 75 }, "Soprano eee": { voice: 4, vowel: 2, attack: 200, release: 900, vibrato: 50, level: 60 }, "Tenor choir": { voice: 1, vowel: 0.5, attack: 350, release: 1200, vibrato: 35, level: 70 }, "Monk drone": { voice: 0, vowel: 3, attack: 800, release: 2500, vibrato: 10, level: 80 }, "Alto ooh pad": { voice: 3, vowel: 4, attack: 900, release: 2000, vibrato: 30, level: 70 }, "Countertenor": { voice: 2, vowel: 1, attack: 200, release: 900, vibrato: 50, level: 70 } } },
];

const js = path.join(LF, "libfaust-wasm.js");
let code = fs.readFileSync(js, "utf8"); const fname = code.match(/var (\w+)\s*=\s*\(/)[1];
code = `import process from "process"; import * as path from "path"; import { createRequire } from "module"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const __filename = fileURLToPath(import.meta.url); const require = createRequire(import.meta.url);
${code}
export default ${fname};`;
const tmp = path.join(LF, "_nb_lf.mjs"); fs.writeFileSync(tmp, code);
const Factory = (await import(pathToFileURL(tmp).href)).default; fs.unlinkSync(tmp);
const data = fs.readFileSync(path.join(LF, "libfaust-wasm.data")), wasmBin = fs.readFileSync(path.join(LF, "libfaust-wasm.wasm"));
const M = await Factory({ wasmBinary: wasmBin, getPreloadedPackage: n => n === "libfaust-wasm.data" ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : new ArrayBuffer(0) });
const faust = new M.libFaustWasm();
console.log("Faust", faust.version());

const idOf = label => label.toLowerCase().replace(/[^a-z0-9]+/g, "");
const walk = (items, out) => { for (const it of items) { if (it.items) walk(it.items, out); else out.push(it); } return out; };
const catalog = [], ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;   // ONLY=violin,flute rebuilds just those
// (214) these four now run C++ ports (Airwindows, KR-106) built in portsrc/; the Faust originals stay in src/ for reference
const PORTED = ["junochorus", "tapeecho", "tape", "lofi", "cloud", "ensemble"];   // (229) Ensemble: string machine + Airwindows Ensemble
for (const S of SPEC) {
  if (ONLY && !ONLY.includes(S.id)) continue;
  if (PORTED.includes(S.id) && !process.env.FAUST_ORIGINALS) {
    const M = JSON.parse(fs.readFileSync(path.join(HERE, S.id, "meta.json"), "utf8"));
    catalog.push({ key: "natebloom/" + S.id, name: M.name, vendor: "Nate Bloom", kind: "effect", type: S.type, desc: M.description, url: "natebloom/" + S.id + "/index.js", site: "https://nathan-san1981.github.io/nate-bloom/" });
    continue;
  }
  const dsp = fs.readFileSync(path.join(HERE, "src", S.id + ".dsp"), "utf8");
  let r;
  try { r = faust.createDSPFactory(S.id, dsp, "-ftz 2", false); }
  catch (e) { console.error(S.id, "FAILED:", faust.getErrorAfterException()); faust.cleanupAfterException(); process.exit(1); }
  const n = r.data.size(), bytes = new Uint8Array(n); for (let i = 0; i < n; i++) bytes[i] = r.data.get(i); r.data.delete();
  const J = JSON.parse(r.json), meta = Object.assign({}, ...J.meta);
  const widgets = walk(J.ui, []), inst = S.kind === "instrument";
  const poly = inst ? { freq: -1, gain: -1, gate: -1 } : null, params = []; let tempoIndex = -1;
  for (const w of widgets) {
    if (inst && ["freq", "gain", "gate"].includes(w.label)) { poly[w.label] = w.index; continue; }
    if (w.label === "bpm") { tempoIndex = w.index; continue; }   // (203) set from the song's tempo by lib/nbfaust.js
    const m = Object.assign({}, ...(w.meta || [])), id = idOf(w.label);
    const p = { id, label: w.label, index: w.index, min: w.min ?? 0, max: w.max ?? 1, init: w.init ?? 0, step: w.step ?? 1 };
    if (m.unit) p.unit = m.unit; if (m.scale) p.scale = m.scale;
    if (S.menus && S.menus[id]) p.menu = S.menus[id];
    if (w.type === "button" || w.type === "checkbox") { p.min = 0; p.max = 1; p.step = 1; p.menu = p.menu || [["Off", 0], ["On", 1]]; }
    params.push(p);
  }
  if (inst && (poly.freq < 0 || poly.gate < 0)) { console.error(S.id, "needs freq and gate"); process.exit(1); }
  for (const [pn, vals] of Object.entries(S.presets || {})) for (const k of Object.keys(vals)) if (!params.some(p => p.id === k)) { console.error(S.id, "preset", pn, "has an unknown parameter", k, "(have", params.map(p => p.id).join(","), ")"); process.exit(1); }
  const out = path.join(HERE, S.id); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "dsp.wasm"), bytes);
  fs.writeFileSync(path.join(out, "dsp.json"), r.json);
  const name = meta.name || S.id, description = (meta.description || "").replace(/-s /g, "'s ");
  const M2 = { id: S.id, build: BUILD, name, kind: inst ? "instrument" : "effect", type: S.type, description, blurb: S.blurb, voices: inst ? S.voices || 8 : 1, poly,
    params, presets: Object.entries(S.presets || {}).map(([name, values]) => ({ name, values })), faust: faust.version() };
  // (225) presets added to meta.json since (the effects' banks of 220) stay, as long as their controls are still there
  try { const old = JSON.parse(fs.readFileSync(path.join(out, "meta.json"), "utf8")); for (const pr of old.presets || []) if (!M2.presets.some(x => x.name === pr.name) && Object.keys(pr.values || {}).every(k => params.some(p => p.id === k))) M2.presets.push(pr); } catch (e) {}
  if (tempoIndex >= 0) M2.tempo = tempoIndex;
  fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(M2, null, 1));
  fs.writeFileSync(path.join(out, "index.js"), `// ${name}: Nate Bloom's own plugin (Faust, src/${S.id}.dsp)\nimport { make } from "../lib/nbfaust.js";\nexport default make(import.meta.url);\n`);
  if (!S.hidden) catalog.push({ key: "natebloom/" + S.id, name, vendor: "Nate Bloom", kind: M2.kind, type: S.type, desc: S.blurb, url: "natebloom/" + S.id + "/index.js", site: "https://nathan-san1981.github.io/nate-bloom/" });
  console.log(S.id.padEnd(11), (bytes.length / 1024).toFixed(1).padStart(6), "KB wasm,", (J.size / 1024).toFixed(0).padStart(5), "KB state,", params.length, "controls" + (inst ? ", " + M2.voices + " voices" : ""));
}
if (!ONLY) fs.writeFileSync(path.join(HERE, "catalog-natebloom.json"), JSON.stringify(catalog, null, 1));
