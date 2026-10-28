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

// ⚡ Fast (in the apps): the same DSP compiled into the app's own low-latency audio (native/nbsynth in the repo).
// Notes and knob changes then go there; this worklet stays loaded (panel, presets, state) but plays nothing.
const FAST = globalThis.__nbFast || (globalThis.__nbFast = { list: null, nodes: new Set() });
const fastApi = () => { const n = globalThis.NBFastPads; return n && typeof n.synthLoad === "function" ? n : null; };
function fastIndex(id) {
  const n = fastApi(); if (!n) return -1;
  if (!FAST.list) { try { FAST.list = JSON.parse(n.synthList()) || []; } catch (e) { FAST.list = []; } }
  return FAST.list.indexOf(id);
}

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
  setup(w, paramMgr) { this._w = w; this._wamNode = paramMgr; this._output = w; if (this._hasInput) this.connect(w, 0, 0); FAST.nodes.add(this); }
  // can this plugin play natively here? (the apps, an instrument the app was built with)
  fastAvailable() { return !this._hasInput && fastIndex(this._M && this._M.id) >= 0; }
  get fast() { return !!this._fast; }
  async setFast(on, gain = 1) {
    const n = fastApi(), i = this._M ? fastIndex(this._M.id) : -1;
    if (!on || !n || i < 0 || this._hasInput) {
      if (this._fast) { clearInterval(this._fast.poll); try { n.synthMidi(i, 0xB0, 123, 0); n.synthOff(this._fast.i); } catch (e) {} this._fast = null; }
      return false;
    }
    if (this._fast) { n.synthGain(i, gain); return true; }
    try { if (n.start) n.start(); } catch (e) {}
    if (!n.synthLoad(i)) return false;
    n.synthGain(i, gain);
    if (this._tp) n.synthTempo(this._tp.tempo, this._tp.playing ? 1 : 0);
    this._w.port.postMessage({ clear: true });   // (the worklet's own notes stop)
    const F = this._fast = { i, last: {}, poll: 0 };
    // every control's value, now and whenever it changes (the panel, presets, MIDI learn, automation)
    const push = async () => {
      if (this._fast !== F) return;
      try { const v = await this._wamNode.getParameterValues(false); for (const id in v) { const x = v[id].value, k = this._pidx[id]; if (k != null && F.last[id] !== x) { F.last[id] = x; n.synthParam(i, k, x); } } } catch (e) {}
    };
    await push(); F.poll = setInterval(push, 100);
    return true;
  }
  scheduleEvents(...events) {
    const rest = [], F = this._fast, n = F && fastApi();
    for (const e of events) {
      if (e && e.type === "wam-midi" && e.data && e.data.bytes) {
        if (n) {   // live notes go at once; notes the sequencer scheduled ahead wait for their time (and the browser's own output delay)
          const b = Array.from(e.data.bytes), dt = (e.time || 0) - this.context.currentTime, go = () => { if (this._fast === F) n.synthMidi(F.i, b[0] | 0, b[1] | 0, b[2] | 0); };
          if (dt > 0.008) setTimeout(go, dt * 1000 + Math.max(0, ((this.context.outputLatency || this.context.baseLatency || 0) * 1000) - 12)); else go();
        } else this._w.port.postMessage({ midi: Array.from(e.data.bytes), time: e.time || 0 });
      }
      else if (e && e.type === "wam-transport" && e.data) { const d = e.data; this._tp = { tempo: d.tempo || 120, playing: !!d.playing }; this._w.port.postMessage({ tempo: d.tempo || 120, playing: !!d.playing, barStarted: d.currentBarStarted, bar: d.currentBar || 0 }); if (n) n.synthTempo(d.tempo || 120, d.playing ? 1 : 0); }
      else rest.push(e);
    }
    if (rest.length) return this._wamNode.scheduleEvents(...rest);
  }
  clearEvents() { this._w.port.postMessage({ clear: true }); if (this._fast) { const n = fastApi(); try { n.synthMidi(this._fast.i, 0xB0, 64, 0); n.synthMidi(this._fast.i, 0xB0, 123, 0); } catch (e) {} } return this._wamNode.clearEvents(); }
  destroy() { this.setFast(false); FAST.nodes.delete(this); try { this._w.port.postMessage({ destroy: true }); this._w.disconnect(); } catch (e) {} return super.destroy(); }
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
      const node = new NBPortNode(ctx); node._hasInput = M.kind !== "instrument"; node._M = M; node._pidx = Object.fromEntries(M.params.map(p => [p.id, p.index])); node.setup(w, pm);
      if (initialState) { try { await node.setState(initialState); } catch (e) {} }
      return node;
    }
    async createGui() { const { panel } = await import("./panel.js"); return panel(this, this._A.meta); }
    destroyGui(el) { if (el && el._nbStop) el._nbStop(); }
  };
}
