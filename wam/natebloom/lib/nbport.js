// Your own plugins (CLAP / nih-plug originals), their DSP compiled to WebAssembly and wrapped as Web Audio Modules.
// Each folder has dsp.wasm (the plugin's engine behind a few C functions: nb_init, nb_params, nb_midi, nb_render,
// nb_out, and nb_in for effects) and meta.json (controls, display curves, presets); index.js is one line.
// The engine plays every voice itself; MIDI is delivered at its sample within the block.
import WebAudioModule from "../../wimmics/utils/sdk/src/WebAudioModule.js";
import CompositeAudioNode from "../../wimmics/utils/sdk-parammgr/src/CompositeAudioNode.js";
import ParamMgrFactory from "../../wimmics/utils/sdk-parammgr/src/ParamMgrFactory.js";

const PROCESSOR = String.raw`
const MATHS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, exp2: x => Math.pow(2, x), log: Math.log, log2: Math.log2, log10: Math.log10, pow: Math.pow,
  tanh: Math.tanh, atan: Math.atan, atan2: Math.atan2, asin: Math.asin, acos: Math.acos, sinh: Math.sinh, cosh: Math.cosh, asinf: Math.asin, acosf: Math.acos,
  expm1: Math.expm1, log1p: Math.log1p, cbrt: Math.cbrt, hypot: Math.hypot };
class NBPortProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() { return DESC; }
  constructor(o) {
    super(o);
    const { module, kind } = o.processorOptions, env = {};
    for (const im of WebAssembly.Module.imports(module)) if (im.kind === "function") env[im.name] = MATHS[im.name] || (() => 0);
    this.ex = new WebAssembly.Instance(module, { env }).exports;
    if (this.ex.__wasm_call_ctors) this.ex.__wasm_call_ctors();
    this.ex.nb_init(sampleRate);
    this.fx = kind === "effect"; this.n = this.ex.nb_count(); this.last = new Float32Array(DESC.length).fill(NaN);
    this.q = []; this.dead = false; this.views();
    this.port.onmessage = e => { const d = e.data;
      if (d.midi) { this.q.push(d); if (this.q.length > 1 && this.q[this.q.length - 2].time > d.time) this.q.sort((a, b) => a.time - b.time); }
      else if (d.set) { for (const k in d.set) this.P[+k] = d.set[k]; }
      else if (d.tempo != null) {   // the host's tempo and transport (arps, glitch steps, tempo-synced delays)
        if (this.ex.nb_tempo) this.ex.nb_tempo(d.tempo, d.playing ? 1 : 0);
        if (this.ex.nb_beat && d.playing) this.ex.nb_beat(Math.max(0, currentTime - (d.barStarted || currentTime)) * d.tempo / 60 + (d.bar || 0) * 4);
      }
      else if (d.clear) { this.q.length = 0; this.ex.nb_midi(0xB0, 64, 0); this.ex.nb_midi(0xB0, 120, 0); if (this.ex.nb_reset) this.ex.nb_reset(); }
      else if (d.destroy) this.dead = true; };
  }
  views() {
    const b = this.ex.memory.buffer; this.buf = b;
    this.P = new Float32Array(b, this.ex.nb_params(), this.n);
    this.oL = new Float32Array(b, this.ex.nb_out(0), 512); this.oR = new Float32Array(b, this.ex.nb_out(1), 512);
    if (this.ex.nb_in) { this.iL = new Float32Array(b, this.ex.nb_in(0), 512); this.iR = new Float32Array(b, this.ex.nb_in(1), 512); }
  }
  run(out, inp, from, to) {
    const n = to - from; if (n <= 0) return;
    if (this.fx) { const a = inp && inp[0], c = inp && (inp[1] || inp[0]); for (let i = 0; i < n; i++) { this.iL[i] = a ? a[from + i] : 0; this.iR[i] = c ? c[from + i] : 0; } }
    this.ex.nb_render(n);
    if (this.ex.memory.buffer !== this.buf) this.views();
    const L = out[0], R = out[1] || out[0];
    for (let i = 0; i < n; i++) { L[from + i] = this.oL[i]; if (R !== L) R[from + i] = this.oR[i]; }
  }
  process(inputs, outputs, params) {
    if (this.dead) return false;
    if (this.ex.memory.buffer !== this.buf) this.views();
    for (let i = 0; i < DESC.length; i++) { const v = params[DESC[i].name][0]; if (v !== this.last[i]) { this.last[i] = v; this.P[PIDX[i]] = v; } }
    const out = outputs[0]; if (!out || !out.length) return true;
    const B = out[0].length, t0 = currentTime, end = t0 + B / sampleRate; let at = 0;
    while (this.q.length && this.q[0].time < end) {
      const e = this.q.shift(), off = Math.max(0, Math.min(B, Math.round((e.time - t0) * sampleRate)));
      if (off > at) { this.run(out, inputs[0], at, off); at = off; }
      const m = e.midi; this.ex.nb_midi(m[0] | 0, m[1] | 0, m[2] | 0);
    }
    this.run(out, inputs[0], at, B);
    return true;
  }
}
registerProcessor(NAME, NBPortProcessor);
`;

const assets = new Map();
function loadAssets(base) {
  if (!assets.has(base)) assets.set(base, (async () => {
    const [meta, wasm] = await Promise.all([fetch(base + "meta.json").then(r => r.json()), fetch(base + "dsp.wasm").then(r => r.arrayBuffer())]);
    return { meta, module: await WebAssembly.compile(wasm) };
  })().catch(e => { assets.delete(base); throw e; }));
  return assets.get(base);
}
const procName = M => "nb-port-" + M.id + "-" + M.build;
async function ensureProcessor(ctx, M) {
  const done = ctx.__nbPort || (ctx.__nbPort = new Map());
  if (!done.has(procName(M))) {
    const desc = M.params.map(p => ({ name: p.id, defaultValue: p.init, minValue: p.min, maxValue: p.max, automationRate: "k-rate" }));
    const src = "const NAME = " + JSON.stringify(procName(M)) + ";\nconst DESC = " + JSON.stringify(desc) + ";\nconst PIDX = " + JSON.stringify(M.params.map(p => p.index)) + ";\n" + PROCESSOR;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    done.set(procName(M), ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url)));
  }
  return done.get(procName(M));
}
class NBPortNode extends CompositeAudioNode {
  setup(w, paramMgr) { this._w = w; this._wamNode = paramMgr; this._output = w; if (this._hasInput) this.connect(w, 0, 0); }
  scheduleEvents(...events) {
    const rest = [];
    for (const e of events) {
      if (e && e.type === "wam-midi" && e.data && e.data.bytes) this._w.port.postMessage({ midi: Array.from(e.data.bytes), time: e.time || 0 });
      else if (e && e.type === "wam-transport" && e.data) { const d = e.data; this._w.port.postMessage({ tempo: d.tempo || 120, playing: !!d.playing, barStarted: d.currentBarStarted, bar: d.currentBar || 0 }); }
      else rest.push(e);
    }
    if (rest.length) return this._wamNode.scheduleEvents(...rest);
  }
  clearEvents() { this._w.port.postMessage({ clear: true }); return this._wamNode.clearEvents(); }
  destroy() { try { this._w.port.postMessage({ destroy: true }); this._w.disconnect(); } catch (e) {} return super.destroy(); }
}
export function make(moduleUrl) {
  const base = new URL(".", moduleUrl).href;
  return class NBPortPlugin extends WebAudioModule {
    async initialize(state) {
      const A = this._A = await loadAssets(base), M = A.meta, inst = M.kind === "instrument";
      Object.assign(this._descriptor, { name: M.name, vendor: M.vendor || "Nathan", identifier: M.identifier || "com.nathan." + M.id, description: M.description, version: "1.0." + M.build,
        isInstrument: inst, hasAudioInput: !inst, hasAudioOutput: true, hasMidiInput: true, hasMidiOutput: false, keywords: M.keywords || [] });
      if (!this._audioNode) this.audioNode = await this.createAudioNode(state);
      this.initialized = true;
      return this;
    }
    async createAudioNode(initialState) {
      const ctx = this.audioContext, A = this._A, M = A.meta;
      await ensureProcessor(ctx, M);
      const w = new AudioWorkletNode(ctx, procName(M), { numberOfInputs: M.kind === "instrument" ? 0 : 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { module: A.module, kind: M.kind } });
      const pm = await ParamMgrFactory.create(this, { internalParamsConfig: Object.fromEntries(w.parameters) });
      const node = new NBPortNode(ctx); node._hasInput = M.kind !== "instrument"; node.setup(w, pm);
      if (initialState) { try { await node.setState(initialState); } catch (e) {} }
      return node;
    }
    async createGui() { const { panel } = await import("./panel.js"); return panel(this, this._A.meta); }
    destroyGui(el) { if (el && el._nbStop) el._nbStop(); }
  };
}
