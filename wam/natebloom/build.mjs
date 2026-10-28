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
  { id: "marimba", type: "Physical model", kind: "instrument", voices: 8, blurb: "Wooden bars and tube resonators struck with a mallet. Hard mallets bring out the attack; soft ones the tone.",
    presets: { "Soft mallets": { mallet: 15, decay: 2, brightness: 3500, strikeposition: 1, level: 85 }, "Hard mallets": { mallet: 85, decay: 1.2, brightness: 12000, strikeposition: 2, level: 75 }, "Ringing": { mallet: 40, decay: 5, brightness: 7000, strikeposition: 0, level: 75 } } },
  { id: "nylon", type: "Physical model", kind: "instrument", voices: 8, blurb: "A classical guitar string and body. Pluck near the bridge for bite, toward the middle for warmth." },
  { id: "violin", type: "Physical model", kind: "instrument", voices: 6, blurb: "A bowed string: bow pressure and position, slow or sharp attacks, and vibrato that grows as the note sustains.",
    presets: { "Slow swell": { attack: 700, release: 900, bowpressure: 40, bowposition: 70, vibrato: 50, level: 75 }, "Spiccato": { attack: 8, release: 60, bowpressure: 60, bowposition: 80, vibrato: 0, level: 80 } } },
  { id: "flute", type: "Physical model", kind: "instrument", voices: 6, blurb: "Breath, embouchure and vibrato: breathy and soft or bright and pure." },
  { id: "clarinet", type: "Physical model", kind: "instrument", voices: 6, blurb: "Reed stiffness and bell opening shape a woody, hollow tone." },
  { id: "voice", type: "Physical model", kind: "instrument", voices: 6, blurb: "A singing voice, bass to soprano, with vowels you can glide between: choirs and vocal pads.",
    menus: { voice: [["Bass", 0], ["Tenor", 1], ["Countertenor", 2], ["Alto", 3], ["Soprano", 4]] },
    presets: { "Choir aah": { voice: 3, vowel: 0, attack: 400, release: 1200, vibrato: 35, level: 70 }, "Deep ooh": { voice: 0, vowel: 4, attack: 300, release: 1500, vibrato: 25, level: 75 }, "Soprano eee": { voice: 4, vowel: 2, attack: 200, release: 900, vibrato: 50, level: 60 } } },
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
for (const S of SPEC) {
  if (ONLY && !ONLY.includes(S.id)) continue;
  const dsp = fs.readFileSync(path.join(HERE, "src", S.id + ".dsp"), "utf8");
  let r;
  try { r = faust.createDSPFactory(S.id, dsp, "-ftz 2", false); }
  catch (e) { console.error(S.id, "FAILED:", faust.getErrorAfterException()); faust.cleanupAfterException(); process.exit(1); }
  const n = r.data.size(), bytes = new Uint8Array(n); for (let i = 0; i < n; i++) bytes[i] = r.data.get(i); r.data.delete();
  const J = JSON.parse(r.json), meta = Object.assign({}, ...J.meta);
  const widgets = walk(J.ui, []), inst = S.kind === "instrument";
  const poly = inst ? { freq: -1, gain: -1, gate: -1 } : null, params = [];
  for (const w of widgets) {
    if (inst && ["freq", "gain", "gate"].includes(w.label)) { poly[w.label] = w.index; continue; }
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
  fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(M2, null, 1));
  fs.writeFileSync(path.join(out, "index.js"), `// ${name}: Nate Bloom's own plugin (Faust, src/${S.id}.dsp)\nimport { make } from "../lib/nbfaust.js";\nexport default make(import.meta.url);\n`);
  catalog.push({ key: "natebloom/" + S.id, name, vendor: "Nate Bloom", kind: M2.kind, type: S.type, desc: S.blurb, url: "natebloom/" + S.id + "/index.js", site: "https://nathan-san1981.github.io/nate-bloom/" });
  console.log(S.id.padEnd(11), (bytes.length / 1024).toFixed(1).padStart(6), "KB wasm,", (J.size / 1024).toFixed(0).padStart(5), "KB state,", params.length, "controls" + (inst ? ", " + M2.voices + " voices" : ""));
}
if (!ONLY) fs.writeFileSync(path.join(HERE, "catalog-natebloom.json"), JSON.stringify(catalog, null, 1));
