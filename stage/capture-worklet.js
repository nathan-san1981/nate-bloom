/* Nate Bloom Stage: the capture worklet (160). It copies what reaches it, 128 frames at a time on the audio thread,
   into 4096-frame blocks for the page to write. With nothing connected it writes silence, so time never jumps. */
class NBCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false; this.n = 0; this.frames = 0; this.calls = 0;
    this.l = new Float32Array(4096); this.r = new Float32Array(4096);
    this.port.onmessage = e => {
      if (e.data === "start") { this.on = true; this.n = 0; this.frames = 0; this.calls = 0; }
      else if (e.data === "stop") { this.flush(true); this.on = false; }
      else if (e.data === "ping") this.port.postMessage({ pong: true, frames: this.frames, calls: this.calls });
    };
  }
  flush(last) {
    if (!this.n && !last) return;
    const l = this.l.slice(0, this.n), r = this.r.slice(0, this.n);
    this.port.postMessage({ l, r, frames: this.frames, last: !!last }, [l.buffer, r.buffer]);
    this.n = 0;
  }
  process(inputs) {
    if (!this.on) return true;
    const inp = inputs[0], L = inp && inp[0], R = inp && (inp.length > 1 ? inp[1] : inp[0]);
    const n = L ? L.length : 128;
    for (let i = 0; i < n; i++) { this.l[this.n] = L ? L[i] : 0; this.r[this.n] = R ? R[i] : 0; this.n++; }
    this.frames += n; this.calls++;
    if (this.n >= 4096) this.flush(false);
    return true;
  }
}
registerProcessor("nb-capture", NBCapture);
