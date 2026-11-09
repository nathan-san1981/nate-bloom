// Purist Web audio engine.
// Every track is scheduled against one AudioContext clock, so tracks start on the same sample and
// can't drift. A track that plays at its own speed and pitch uses an AudioBufferSourceNode (the
// decoded samples, untouched). A track that is tempo-matched or key-shifted goes through
// Signalsmith Stretch, whose scheduling compensates its own latency so it lines up with the rest.
import SignalsmithStretch from './vendor/SignalsmithStretch.mjs';

export const dbToGain = (db) => (db <= -60 ? 0 : Math.pow(10, db / 20));

const LEAD = 0.15;          // seconds between pressing play and the first sample (room for the stretcher)
const FADE = 0.012;         // click-free starts and stops

/** Decoded audio, shared between views. Keeps the most recent few so switching back is instant. */
export class Loader {
  constructor(ctx) { this.ctx = ctx; this.cache = new Map(); this.max = 8; this.pending = new Map(); }
  async get(url, onProgress) {
    if (this.cache.has(url)) { const b = this.cache.get(url); this.cache.delete(url); this.cache.set(url, b); return b; }
    if (this.pending.has(url)) return this.pending.get(url);
    const p = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('The Beelink answered ' + res.status + ' for ' + decodeURIComponent(url.split('/').pop()));
      const total = +res.headers.get('content-length') || 0;
      let bytes;
      if (res.body && res.body.getReader) {
        const reader = res.body.getReader(); const parts = []; let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value); got += value.length;
          if (onProgress) onProgress(total ? got / total : 0, got);
        }
        bytes = new Uint8Array(got); let o = 0;
        for (const v of parts) { bytes.set(v, o); o += v.length; }
      } else bytes = new Uint8Array(await res.arrayBuffer());
      if (onProgress) onProgress(1, bytes.length, 'decoding');
      let buf;
      try { buf = await this.ctx.decodeAudioData(bytes.buffer); }
      catch (e) { throw new Error('This browser couldn’t decode ' + decodeURIComponent(url.split('/').pop())); }
      this.cache.set(url, buf);
      while (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value);
      return buf;
    })();
    this.pending.set(url, p);
    try { return await p; } finally { this.pending.delete(url); }
  }
}

/** Peaks for drawing a waveform: max |sample| per bucket. */
export function peaksOf(buffer, buckets = 1600) {
  const n = buffer.length, out = new Float32Array(buckets);
  const chans = []; for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  const per = n / buckets;
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor(b * per), e = Math.min(n, Math.floor((b + 1) * per));
    let m = 0;
    for (const ch of chans) for (let i = s; i < e; i += 4) { const v = Math.abs(ch[i]); if (v > m) m = v; }
    out[b] = m;
  }
  return out;
}

/** A rough tempo for songs library.json doesn't cover yet: onset strength, autocorrelated over 70–180 BPM. */
export function estimateBpm(buffer) {
  const sr = buffer.sampleRate, hop = 512, ch = buffer.getChannelData(0);
  const ch2 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch;
  const frames = Math.floor(Math.min(buffer.length, sr * 120) / hop);
  if (frames < 200) return 0;
  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0; const o = f * hop;
    for (let i = 0; i < hop; i++) { const v = ch[o + i] + ch2[o + i]; e += v * v; }
    const l = Math.log(1e-9 + e);
    env[f] = Math.max(0, l - prev); prev = l;
  }
  const fps = sr / hop;
  let best = 0, bestLag = 0;
  const lo = Math.floor(fps * 60 / 180), hi = Math.ceil(fps * 60 / 70);
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let f = lag; f < frames; f++) s += env[f] * env[f - lag];
    // favour the 90–140 band a little, where most of this music sits
    const bpm = 60 * fps / lag;
    const w = 1 - 0.15 * Math.min(1, Math.abs(Math.log2(bpm / 115)));
    s *= w;
    if (s > best) { best = s; bestLag = lag; }
  }
  if (!bestLag) return 0;
  // refine with the neighbouring lags (parabolic)
  const ac = (lag) => { let s = 0; for (let f = lag; f < frames; f++) s += env[f] * env[f - lag]; return s; };
  const a = ac(bestLag - 1), b = ac(bestLag), c = ac(bestLag + 1);
  const d = (a - c) / (2 * (a - 2 * b + c) || 1);
  const lag = bestLag + (Math.abs(d) < 1 ? d : 0);
  return Math.round(600 * fps / lag) / 10;
}

/** One playing layer: a decoded buffer plus how it sits on the mix timeline. */
export class Track {
  constructor(id) {
    this.id = id;
    this.buffer = null;
    this.url = '';
    this.label = '';
    this.volDb = 0; this.pan = 0; this.mute = false; this.solo = false;
    this.start = 0;               // mix time (s) where this track's 0:00 sits; negative = starts partway in
    this.loop = { on: false, start: 0, end: 0 };
    this.rate = 1;                // playback speed (tempo match)
    this.semis = 0;               // key shift
    this.extraGain = 1;           // crossfader, set by the owner
  }
  get duration() { return this.buffer ? this.buffer.duration : 0; }
  get processed() { return Math.abs(this.rate - 1) > 1e-6 || this.semis !== 0; }
  /** Mix time where this track stops making sound (Infinity when it loops). */
  get mixEnd() {
    if (!this.buffer) return 0;
    if (this.loop.on && this.loop.end > this.loop.start) return Infinity;
    return this.start + this.duration / this.rate;
  }
  /** Track position (s) for a mix time, or null before it starts / after it ends. */
  posAt(mixT) {
    if (!this.buffer) return null;
    let tt = (mixT - this.start) * this.rate;
    if (tt < 0) return null;
    const L = this.loop;
    if (L.on && L.end > L.start && tt >= L.end) tt = L.start + ((tt - L.start) % (L.end - L.start));
    if (tt >= this.duration) return null;
    return tt;
  }
}

/** Plays a set of tracks in sync. Used by the mixer (A + B) and the song view (stems). */
export class Player {
  constructor(ctx, out) {
    this.ctx = ctx; this.out = out;
    this.tracks = [];
    this.playing = false;
    this.pos0 = 0; this.t0 = 0; this.pausedAt = 0;
    this.loopMix = { on: false, start: 0, end: 0 };
    this.voices = [];             // live nodes for the current pass
    this.stretchers = new Map();  // track id -> { node, url }
    this.onEnded = null;
    this.timer = null;
    this.nextLoopAt = null;
    this.bus = ctx.createGain(); this.bus.connect(out);
    this.chains = new Map();
  }

  chain(t) {
    let c = this.chains.get(t.id);
    if (!c) {
      const g = this.ctx.createGain(), p = this.ctx.createStereoPanner();
      g.connect(p); p.connect(this.bus);
      c = { gain: g, pan: p };
      if (this.meters) { c.an = this.ctx.createAnalyser(); c.an.fftSize = 1024; p.connect(c.an); c.buf = new Float32Array(1024); }
      this.chains.set(t.id, c);
    }
    return c;
  }
  gainOf(t) {
    const anySolo = this.tracks.some((x) => x.solo && x.buffer);
    if (t.mute || (anySolo && !t.solo)) return 0;
    return dbToGain(t.volDb) * t.extraGain;
  }
  /** Apply volume, pan, mute, solo and crossfader without restarting. */
  levels() {
    const now = this.ctx.currentTime;
    for (const t of this.tracks) {
      const c = this.chain(t);
      c.gain.gain.setTargetAtTime(this.gainOf(t), now, 0.015);
      c.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, t.pan)), now, 0.015);
    }
  }

  /** Peak level (0..1) of a track's output right now, when meters are on. */
  peak(id) {
    const c = this.chains.get(id);
    if (!c || !c.an || !this.playing) return 0;
    c.an.getFloatTimeDomainData(c.buf);
    let m = 0; for (let i = 0; i < c.buf.length; i++) { const v = Math.abs(c.buf[i]); if (v > m) m = v; }
    return m;
  }
  get length() {
    const ends = this.tracks.filter((t) => t.buffer).map((t) => t.mixEnd);
    const finite = ends.filter((e) => isFinite(e));
    if (finite.length) return Math.max(...finite);
    // only looping tracks: the longest single pass
    const all = this.tracks.filter((t) => t.buffer).map((t) => t.start + t.duration / t.rate);
    return all.length ? Math.max(...all) : 0;
  }
  get position() {
    if (!this.playing) return this.pausedAt;
    let p = this.pos0 + (this.ctx.currentTime - this.t0);
    if (p < this.pos0) p = this.pos0;
    return p;
  }

  async stretcher(t) {
    let s = this.stretchers.get(t.id);
    if (!s) {
      const node = await SignalsmithStretch(this.ctx);
      node.connect(this.chain(t).gain);
      s = { node, url: '' };
      this.stretchers.set(t.id, s);
    }
    if (s.url !== t.url) {
      await s.node.dropBuffers();
      const chans = [];
      for (let c = 0; c < Math.max(2, t.buffer.numberOfChannels) && c < 2; c++) chans.push(t.buffer.getChannelData(Math.min(c, t.buffer.numberOfChannels - 1)).slice());
      await s.node.addBuffers(chans);
      s.url = t.url;
    }
    return s.node;
  }
  /** Get stretchers ready before play is pressed, so starting is instant. */
  async prepare() {
    for (const t of this.tracks) if (t.buffer && t.processed) await this.stretcher(t);
  }

  /** Schedule one pass of every track, starting at mix time `from`, at context time `when`. */
  async schedule(from, when) {
    const made = [];
    for (const t of this.tracks) {
      if (!t.buffer) continue;
      let tt = (from - t.start) * t.rate, at = when;
      if (tt < 0) { at = when + (-tt) / t.rate; tt = 0; }
      const L = t.loop, looping = L.on && L.end > L.start;
      if (looping && tt >= L.end) tt = L.start + ((tt - L.start) % (L.end - L.start));
      if (tt >= t.duration) continue;
      const c = this.chain(t);
      if (!t.processed) {
        const src = this.ctx.createBufferSource();
        src.buffer = t.buffer;
        if (looping) { src.loop = true; src.loopStart = L.start; src.loopEnd = Math.min(L.end, t.duration); }
        src.connect(c.gain);
        src.start(at, tt);
        made.push({ kind: 'src', node: src, t });
      } else {
        const node = await this.stretcher(t);
        node.schedule({
          output: at, active: true, input: tt, rate: t.rate, semitones: t.semis,
          loopStart: looping ? L.start : 0, loopEnd: looping ? Math.min(L.end, t.duration) : 0
        });
        made.push({ kind: 'stretch', node, t });
      }
    }
    return made;
  }
  silenceVoices(voices, at) {
    for (const v of voices) {
      try {
        if (v.kind === 'src') v.node.stop(at);
        else v.node.schedule({ output: at, active: false });
      } catch (e) { /* already stopped */ }
    }
  }

  async play(from) {
    if (this.playing) await this.pause();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (from == null) from = this.pausedAt;
    const len = this.length;
    if (!this.loopMix.on && from >= len - 0.01) from = 0;
    this.levels();
    await this.prepare();
    const when = this.ctx.currentTime + LEAD;
    const g = this.bus.gain;
    g.cancelScheduledValues(0); g.setValueAtTime(0, when - 0.001); g.linearRampToValueAtTime(1, when + FADE);
    this.voices = await this.schedule(from, when);
    this.pos0 = from; this.t0 = when; this.playing = true;
    this.nextLoopAt = null;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 40);
  }

  async pause() {
    if (!this.playing) return;
    const pos = this.position;
    this.playing = false;
    clearInterval(this.timer);
    const now = this.ctx.currentTime, g = this.bus.gain;
    g.cancelScheduledValues(0); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + FADE);
    this.silenceVoices(this.voices, now + FADE + 0.005);
    if (this.oldVoices) this.silenceVoices(this.oldVoices, now + FADE + 0.005);
    this.voices = []; this.oldVoices = null;
    this.pausedAt = Math.max(0, pos);
  }

  async seek(to) {
    to = Math.max(0, to);
    if (this.playing) await this.play(to);
    else this.pausedAt = to;
  }
  /** Settings that change what is scheduled (start offset, loop, tempo, key, source): restart in place. */
  async refresh() {
    if (this.playing) await this.play(this.position);
  }

  tick() {
    if (!this.playing) return;
    const pos = this.position;
    const L = this.loopMix;
    if (L.on && L.end > L.start) {
      // schedule the jump back exactly at the loop end, a little ahead of time
      if (this.nextLoopAt == null && pos >= L.end - 0.35) {
        const boundary = this.t0 + (L.end - this.pos0);
        this.nextLoopAt = boundary;
        const old = this.voices;
        this.schedule(L.start, boundary).then((v) => {
          this.silenceVoices(old.filter((x) => x.kind === 'src'), boundary);
          this.voices = v;
        });
      }
      if (this.nextLoopAt != null && this.ctx.currentTime >= this.nextLoopAt) {
        this.pos0 = L.start; this.t0 = this.nextLoopAt; this.nextLoopAt = null;
      }
      if (pos > L.end + 0.5 && this.nextLoopAt == null) { this.play(L.start); }
      return;
    }
    if (pos >= this.length) {
      this.pause().then(() => { this.pausedAt = 0; if (this.onEnded) this.onEnded(); });
    }
  }

  /** Render [from, to) of the mix offline at `sampleRate`, through the same graph. */
  async render(from, to, sampleRate, onProgress) {
    const frames = Math.ceil((to - from) * sampleRate);
    const look = Math.max(1, Math.round(sampleRate * 0.002));   // the clip guard's look-ahead, trimmed off below
    const off = new OfflineAudioContext(2, frames + look, sampleRate);
    await off.audioWorklet.addModule(new URL('./guard-worklet.js', import.meta.url));
    const guard = new AudioWorkletNode(off, 'purist-guard', { outputChannelCount: [2] });
    guard.connect(off.destination);
    const p = new Player(off, guard);
    p.tracks = this.tracks;                 // same settings
    p.loopMix = { on: false, start: 0, end: 0 };
    p.levels();
    for (const t of p.tracks) {
      const c = p.chain(t);
      c.gain.gain.value = p.gainOf(t); c.pan.pan.value = Math.max(-1, Math.min(1, t.pan));
    }
    await p.prepare();
    await p.schedule(from, 0);
    if (onProgress) {
      const step = Math.max(1, Math.floor((to - from) / 50));
      for (let s = step; s < to - from; s += step) off.suspend(s).then(() => { onProgress(s / (to - from)); off.resume(); });
    }
    const raw = await off.startRendering();
    // the stretcher compensates its own latency; the guard's 2 ms look-ahead is removed here
    const out = new AudioBuffer({ numberOfChannels: 2, length: frames, sampleRate });
    for (let c = 0; c < 2; c++) out.copyToChannel(raw.getChannelData(c).subarray(look, look + frames), c);
    return out;
  }
}

/** WAV file (PCM 24-bit or IEEE float 32-bit) from an AudioBuffer. */
export function encodeWav(buffer, bits) {
  const ch = buffer.numberOfChannels, n = buffer.length, sr = buffer.sampleRate;
  const float = bits === 32, bps = bits / 8, block = ch * bps, dataLen = n * block;
  const ab = new ArrayBuffer(44 + dataLen), v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, float ? 3 : 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * block, true); v.setUint16(32, block, true); v.setUint16(34, bits, true);
  w(36, 'data'); v.setUint32(40, dataLen, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  // TPDF dither for 24-bit, so the float mix rounds cleanly
  let seed = 22222;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const x = chans[c][i];
      if (float) { v.setFloat32(o, x, true); o += 4; }
      else {
        let s = Math.round(x * 8388607 + (rnd() - rnd()));
        if (s > 8388607) s = 8388607; else if (s < -8388608) s = -8388608;
        v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); o += 3;
      }
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

/** Keys: "D minor", "F♯ minor", "E♭ major" -> pitch class + mode; transpose; semitone distance. */
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export function parseKey(k) {
  if (!k) return null;
  const m = String(k).trim().match(/^([A-Ga-g])\s*([#♯b♭]?)\s*(m|min|minor|maj|major)?/);
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  const minor = /^m(in(or)?)?$/i.test(m[3] || '') && !/maj/i.test(m[3] || '');
  return { pc: (base + acc + 12) % 12, minor };
}
export function keyName(k) { return k ? NAMES[k.pc] + (k.minor ? ' minor' : ' major') : ''; }
export function transposeKey(k, semis) { return k ? { pc: ((k.pc + semis) % 12 + 12) % 12, minor: k.minor } : null; }
/** Semitones (−6..+5) that put key b on key a; across modes it targets a's relative key. */
export function semisToMatch(a, b) {
  if (!a || !b) return 0;
  let target = a.pc;
  if (a.minor !== b.minor) target = a.minor ? (a.pc + 3) % 12 : (a.pc + 9) % 12;
  let d = ((target - b.pc) % 12 + 12) % 12;
  if (d > 5) d -= 12;
  return d;
}
