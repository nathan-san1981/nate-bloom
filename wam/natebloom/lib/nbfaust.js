// Nate Bloom's own plugins: Faust DSP compiled to WebAssembly, run in an AudioWorklet, wrapped as a Web Audio Module
// (WAM 2.0) with the community SDK's parameter manager. Each plugin folder has dsp.wasm, dsp.json (the compiler's
// description) and meta.json (names, ranges, presets); its index.js is one line: export default make(import.meta.url).
// Effects run one instance; instruments run a pool of voices in the same WebAssembly memory, played by MIDI events
// scheduled at their audio time.
import WebAudioModule from "../../wimmics/utils/sdk/src/WebAudioModule.js";
import CompositeAudioNode from "../../wimmics/utils/sdk-parammgr/src/CompositeAudioNode.js";
import ParamMgrFactory from "../../wimmics/utils/sdk-parammgr/src/ParamMgrFactory.js";

const PROCESSOR = String.raw`
const MATH = { _abs: Math.abs, _acosf: Math.acos, _asinf: Math.asin, _atanf: Math.atan, _atan2f: Math.atan2, _ceilf: Math.ceil, _cosf: Math.cos, _expf: Math.exp,
  _floorf: Math.floor, _fmodf: (x, y) => x % y, _logf: Math.log, _log10f: Math.log10, _max_f: Math.max, _min_f: Math.min, _remainderf: (x, y) => x - Math.round(x / y) * y,
  _powf: Math.pow, _roundf: Math.round, _sinf: Math.sin, _sqrtf: Math.sqrt, _tanf: Math.tan, _acoshf: Math.acosh, _asinhf: Math.asinh, _atanhf: Math.atanh,
  _coshf: Math.cosh, _sinhf: Math.sinh, _tanhf: Math.tanh, _isnanf: Number.isNaN, _isinff: x => !isFinite(x), _copysignf: (x, y) => Math.sign(x) === Math.sign(y) ? x : -x,
  _acos: Math.acos, _asin: Math.asin, _atan: Math.atan, _atan2: Math.atan2, _ceil: Math.ceil, _cos: Math.cos, _exp: Math.exp, _floor: Math.floor, _fmod: (x, y) => x % y,
  _log: Math.log, _log10: Math.log10, _max_: Math.max, _min_: Math.min, _remainder: (x, y) => x - Math.round(x / y) * y, _pow: Math.pow, _round: Math.round,
  _sin: Math.sin, _sqrt: Math.sqrt, _tan: Math.tan, _acosh: Math.acosh, _asinh: Math.asinh, _atanh: Math.atanh, _cosh: Math.cosh, _sinh: Math.sinh, _tanh: Math.tanh,
  _isnan: Number.isNaN, _isinf: x => !isFinite(x), _copysign: (x, y) => Math.sign(x) === Math.sign(y) ? x : -x };
class NBFaustProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() { return DESC; }
  constructor(o) {
    super(o);
    const { module, json, voices, poly } = o.processorOptions;
    const J = JSON.parse(json), B = 128, al = n => (n + 63) & ~63;
    this.nIn = J.inputs; this.nOut = J.outputs; this.V = Math.max(1, voices | 0); this.poly = poly || null;
    const S = al(J.size); this.dsp = []; for (let v = 0; v < this.V; v++) this.dsp.push(v * S);
    let p = this.V * S; this.inPtrs = p; p += Math.max(1, this.nIn) * 4; this.outPtrs = [];
    for (let v = 0; v < this.V; v++) { this.outPtrs.push(p); p += this.nOut * 4; }
    p = al(p); this.inBuf = p; p += Math.max(1, this.nIn) * B * 4; this.outBuf = [];
    for (let v = 0; v < this.V; v++) { this.outBuf.push(p); p += this.nOut * B * 4; }
    this.mem = new WebAssembly.Memory({ initial: Math.ceil(p / 65536) + 2 });
    const env = Object.assign({ memory: this.mem, memoryBase: 0, tableBase: 0, table: new WebAssembly.Table({ initial: 0, element: "anyfunc" }) }, MATH);
    this.ex = new WebAssembly.Instance(module, { env }).exports;
    const H32 = new Int32Array(this.mem.buffer), buf = this.mem.buffer;
    this.inV = []; for (let c = 0; c < this.nIn; c++) { const a = this.inBuf + c * B * 4; H32[(this.inPtrs >> 2) + c] = a; this.inV.push(new Float32Array(buf, a, B)); }
    this.outV = [];
    for (let v = 0; v < this.V; v++) { const ch = []; for (let c = 0; c < this.nOut; c++) { const a = this.outBuf[v] + c * B * 4; H32[(this.outPtrs[v] >> 2) + c] = a; ch.push(new Float32Array(buf, a, B)); } this.outV.push(ch); }
    for (const d of this.dsp) this.ex.init(d, sampleRate);
    this.last = new Float32Array(DESC.length).fill(NaN);
    this.vs = Array.from({ length: this.V }, (_, i) => ({ i, note: -1, on: false, live: false, quiet: 0, age: 0, retrig: false, pan: 0 }));
    this.age = 0; this.q = []; this.dead = false;
    this.port.onmessage = e => { const d = e.data; if (d.midi) { this.q.push(d); if (this.q.length > 1 && this.q[this.q.length - 2].time > d.time) this.q.sort((a, b) => a.time - b.time); }
      else if (d.clear) { this.q.length = 0; this.allOff(true); } else if (d.destroy) this.dead = true; };
  }
  setAll(idx, v) { for (const d of this.dsp) this.ex.setParamValue(d, idx, v); }
  noteOn(n, vel) {
    const P = this.poly; if (!P) return;
    let v = this.vs.find(x => x.note === n && x.live) || this.vs.find(x => !x.live) || this.vs.filter(x => !x.on).sort((a, b) => a.age - b.age)[0] || this.vs.slice().sort((a, b) => a.age - b.age)[0];
    const d = this.dsp[v.i];
    this.ex.setParamValue(d, P.freq, 440 * Math.pow(2, (n - 69) / 12));
    if (P.gain >= 0) this.ex.setParamValue(d, P.gain, Math.max(0.05, vel / 127));
    if (v.live) { this.ex.setParamValue(d, P.gate, 0); v.retrig = true; } else this.ex.setParamValue(d, P.gate, 1);
    v.note = n; v.on = true; v.live = true; v.quiet = 0; v.age = ++this.age; v.pan = Math.max(-0.6, Math.min(0.6, (n - 60) / 40));
  }
  noteOff(n) { const P = this.poly; if (!P) return; for (const v of this.vs) if (v.on && v.note === n) { v.on = false; v.retrig = false; this.ex.setParamValue(this.dsp[v.i], P.gate, 0); } }
  allOff(hard) { const P = this.poly; if (!P) return; for (const v of this.vs) { v.on = false; v.retrig = false; this.ex.setParamValue(this.dsp[v.i], P.gate, 0); if (hard) { v.live = false; v.note = -1; this.ex.instanceClear(this.dsp[v.i]); } } }
  midi(b) {
    const st = b[0] & 0xf0;
    if (st === 0x90 && b[2] > 0) this.noteOn(b[1], b[2]);
    else if (st === 0x80 || (st === 0x90 && b[2] === 0)) this.noteOff(b[1]);
    else if (st === 0xb0 && (b[1] === 123 || b[1] === 120)) this.allOff(b[1] === 120);
  }
  process(inputs, outputs, params) {
    if (this.dead) return false;
    const ex = this.ex, B = 128;
    for (let i = 0; i < DESC.length; i++) { const v = params[DESC[i].name][0]; if (v !== this.last[i]) { this.last[i] = v; this.setAll(PIDX[i], v); } }
    if (this.poly) for (const v of this.vs) if (v.retrig) { v.retrig = false; ex.setParamValue(this.dsp[v.i], this.poly.gate, 1); }
    if (this.q.length) { const end = currentTime + B / sampleRate; let k = 0; while (k < this.q.length && this.q[k].time < end) this.midi(this.q[k++].midi); if (k) this.q.splice(0, k); }
    const out = outputs[0]; if (!out || !out.length) return true;
    if (!this.poly) {
      const inp = inputs[0] || [];
      for (let c = 0; c < this.nIn; c++) { const s = inp[c] || inp[0]; if (s) this.inV[c].set(s); else this.inV[c].fill(0); }
      ex.compute(this.dsp[0], B, this.inPtrs, this.outPtrs[0]);
      for (let c = 0; c < out.length; c++) out[c].set(this.outV[0][Math.min(c, this.nOut - 1)]);
      return true;
    }
    for (let c = 0; c < out.length; c++) out[c].fill(0);
    const L = out[0], R = out[1] || out[0];
    for (const v of this.vs) {
      if (!v.live) continue;
      ex.compute(this.dsp[v.i], B, this.inPtrs, this.outPtrs[v.i]);
      const a = this.outV[v.i][0], b = this.outV[v.i][Math.min(1, this.nOut - 1)];
      const gl = Math.cos((v.pan + 1) * Math.PI / 4) * 1.41, gr = Math.sin((v.pan + 1) * Math.PI / 4) * 1.41;
      let pk = 0;
      for (let s = 0; s < B; s++) { const x = a[s], y = b[s]; L[s] += x * gl; if (R !== L) R[s] += y * gr; const m = x < 0 ? -x : x; if (m > pk) pk = m; }
      if (!v.on) { if (pk < 2e-4) { if ((v.quiet += B) > sampleRate * 0.25) { v.live = false; v.note = -1; } } else v.quiet = 0; }
    }
    return true;
  }
}
registerProcessor(NAME, NBFaustProcessor);
`;

const assets = new Map();
function loadAssets(base) {
  if (!assets.has(base)) assets.set(base, (async () => {
    const [meta, json, wasm] = await Promise.all([fetch(base + "meta.json").then(r => r.json()), fetch(base + "dsp.json").then(r => r.text()), fetch(base + "dsp.wasm").then(r => r.arrayBuffer())]);
    return { meta, json, module: await WebAssembly.compile(wasm) };
  })().catch(e => { assets.delete(base); throw e; }));
  return assets.get(base);
}
const procName = M => "nb-faust-" + M.id + "-" + M.build;
async function ensureProcessor(ctx, M) {
  const done = ctx.__nbFaust || (ctx.__nbFaust = new Map());
  if (!done.has(procName(M))) {
    const desc = M.params.map(p => ({ name: p.id, defaultValue: p.init, minValue: p.min, maxValue: p.max, automationRate: "k-rate" }));
    const src = "const NAME = " + JSON.stringify(procName(M)) + ";\nconst DESC = " + JSON.stringify(desc) + ";\nconst PIDX = " + JSON.stringify(M.params.map(p => p.index)) + ";\n" + PROCESSOR;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    done.set(procName(M), ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url)));
  }
  return done.get(procName(M));
}

class NBFaustNode extends CompositeAudioNode {
  setup(faust, paramMgr) { this.connect(faust, 0, 0); this._wamNode = paramMgr; this._output = faust; this._faust = faust; }
  // notes go straight to the voices, stamped with their audio time
  scheduleEvents(...events) {
    const rest = [];
    for (const e of events) { if (e && e.type === "wam-midi" && e.data && e.data.bytes) this._faust.port.postMessage({ midi: Array.from(e.data.bytes), time: e.time || 0 }); else rest.push(e); }
    if (rest.length) return this._wamNode.scheduleEvents(...rest);
  }
  clearEvents() { this._faust.port.postMessage({ clear: true }); return this._wamNode.clearEvents(); }
  destroy() { try { this._faust.port.postMessage({ destroy: true }); this._faust.disconnect(); } catch (e) {} return super.destroy(); }
}

export function make(moduleUrl) {
  const base = new URL(".", moduleUrl).href;
  return class NBFaustPlugin extends WebAudioModule {
    async initialize(state) {
      const A = this._A = await loadAssets(base), M = A.meta, inst = M.kind === "instrument";
      Object.assign(this._descriptor, { name: M.name, vendor: "Nate Bloom", identifier: "com.natebloom." + M.id, description: M.description, version: "1.0." + M.build,
        isInstrument: inst, hasAudioInput: !inst, hasAudioOutput: true, hasMidiInput: inst, hasMidiOutput: false, keywords: M.keywords || [] });
      if (!this._audioNode) this.audioNode = await this.createAudioNode(state);
      this.initialized = true;
      return this;
    }
    async createAudioNode(initialState) {
      const ctx = this.audioContext, A = this._A, M = A.meta;
      await ensureProcessor(ctx, M);
      const faust = new AudioWorkletNode(ctx, procName(M), { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        processorOptions: { module: A.module, json: A.json, voices: M.voices || 1, poly: M.poly || null } });
      const pm = await ParamMgrFactory.create(this, { internalParamsConfig: Object.fromEntries(faust.parameters) });
      const node = new NBFaustNode(ctx); node.setup(faust, pm);
      if (initialState) { try { await node.setState(initialState); } catch (e) {} }
      return node;
    }
    async createGui() { const { panel } = await import("./panel.js"); return panel(this, this._A.meta); }
    destroyGui(el) { if (el && el._nbStop) el._nbStop(); }
  };
}
