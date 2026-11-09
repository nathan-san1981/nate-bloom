// Output clip guard and meter. Gain stays exactly 1 (bit-transparent) unless a sample would
// pass the ceiling; then a 2 ms look-ahead limiter pulls it down and releases over ~120 ms.
// Posts peak levels about 20 times a second for the meters.
class PuristGuard extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ceiling = Math.pow(10, -0.3 / 20);
    this.look = Math.max(1, Math.round(sampleRate * 0.002));
    this.buf = [new Float32Array(this.look), new Float32Array(this.look)];
    this.pos = 0;
    this.gain = 1;
    this.release = 1 - Math.exp(-1 / (sampleRate * 0.12));
    this.peakL = 0; this.peakR = 0; this.reduced = 0;
    this.count = 0;
    this.every = Math.round(sampleRate / 20);
    this.port.onmessage = (e) => { if (e.data && e.data.reset) { this.gain = 1; this.buf[0].fill(0); this.buf[1].fill(0); } };
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const n = out[0].length;
    const iL = inp[0] || null, iR = inp[1] || inp[0] || null;
    const oL = out[0], oR = out[1] || out[0];
    const bL = this.buf[0], bR = this.buf[1], look = this.look;
    for (let i = 0; i < n; i++) {
      const xL = iL ? iL[i] : 0, xR = iR ? iR[i] : 0;
      // the sample leaving the delay line now
      const dL = bL[this.pos], dR = bR[this.pos];
      bL[this.pos] = xL; bR[this.pos] = xR;
      this.pos = this.pos + 1 === look ? 0 : this.pos + 1;
      // target gain from the incoming (future) sample
      const p = Math.max(Math.abs(xL), Math.abs(xR));
      const need = p > this.ceiling ? this.ceiling / p : 1;
      if (need < this.gain) this.gain = need;               // attack: instant, ahead of the sample
      else if (this.gain < 1) { this.gain += (1 - this.gain) * this.release; if (this.gain > 0.99999) this.gain = 1; }
      let yL = dL * this.gain, yR = dR * this.gain;
      if (yL > this.ceiling) yL = this.ceiling; else if (yL < -this.ceiling) yL = -this.ceiling;
      if (yR > this.ceiling) yR = this.ceiling; else if (yR < -this.ceiling) yR = -this.ceiling;
      oL[i] = yL; if (oR !== oL) oR[i] = yR;
      const aL = Math.abs(dL), aR = Math.abs(dR);
      if (aL > this.peakL) this.peakL = aL;
      if (aR > this.peakR) this.peakR = aR;
      if (this.gain < 1) this.reduced = 1;
    }
    this.count += n;
    if (this.count >= this.every) {
      this.port.postMessage({ l: this.peakL, r: this.peakR, limited: this.reduced });
      this.count = 0; this.peakL = 0; this.peakR = 0; this.reduced = 0;
    }
    return true;
  }
}
registerProcessor('purist-guard', PuristGuard);
