// (176) Nate Bloom's native synth engine for the Linux app: the synth voices worked out in compiled code on a pool of
// threads (not one browser audio thread), handed to the page through shared memory. The page's AudioWorklet
// ("nb-native-out") reads a ring of finished audio per bus and plays it into Nate Bloom's own channels, so effects,
// the mixer, mute, recording and Log all hear it as before.
//
// Shared memory (made by the page, a SharedArrayBuffer, handed over once with eng_attach):
//   hdr: Float64Array  [0] frame the worklet will read next (it writes)  [1] frame rendered up to (this writes)
//                      [2] underruns counted by the worklet  [3] ring capacity in frames  [4] buses  [5] ahead target
//   ring: Float32Array  planar: ((bus * 2 + channel) * capacity + frame % capacity)
// One render thread keeps the ring `ahead` frames in front of the worklet, in 128-frame blocks; with enough voices
// the block's voices are split across worker threads, each summing into its own buffer, then added up.
//
// Voices: stage 1 has the Juno (kind 1), modelled on the page's Web Audio Juno (020): saw, pulse (a saw minus a
// shifted copy of itself, the shift swept for PWM), the sub an octave down and noise, the HPF, the 24 dB ladder
// with soft saturation (the page's nb-vcf), its filter envelope and amp envelope, per-note drift, and the wheels.
#include <node_api.h>
#include <atomic>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <mutex>
#include <thread>
#include <vector>
#include <algorithm>
#include <pthread.h>
#include <sched.h>
#include <time.h>
#include <unistd.h>

namespace nbeng {

static const int BLOCK = 128, MAXBUS = 8;

static const int NP = 96;   // note parameters: [0] kind, then the kind's own (see Voice and Gen)
struct Cmd { int type; int id; int bus; int64_t frame; int midi; double mix; double p[NP]; };   // type: 1 note on, 2 off, 3 kill, 4 all off, 5 pitch

static inline float satf(float x) { return x < -3.f ? -1.f : x > 3.f ? 1.f : x * (27.f + x * x) / (27.f + 9.f * x * x); }
static inline double polyblep(double t, double dt) {   // band-limits a saw's step
  if (t < dt) { t /= dt; return t + t - t * t - 1.0; }
  if (t > 1.0 - dt) { t = (t - 1.0) / dt; return t * t + t + t + 1.0; }
  return 0.0;
}
static inline double sawAt(double ph, double dt) { return 2.0 * ph - 1.0 - polyblep(ph, dt); }

struct Biquad {   // RBJ high-pass (the Juno's HPF)
  double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
  void highpass(double f, double q, double sr) {
    double w = 2 * M_PI * f / sr, c = cos(w), s = sin(w), al = s / (2 * q), a0 = 1 + al;
    b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; b2 = (1 + c) / 2 / a0; a1 = -2 * c / a0; a2 = (1 - al) / a0;
  }
  inline double run(double x) { double y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y; }
};

// (176, stage 2) the other classic synths from one generic voice: up to 8 oscillators (saw, square, triangle, sine) with
// their own pitch ratio, detune, a scoop or dive into it, and gain; an optional comb (the Hoover's buzz: the stack minus
// a swept, delayed copy) and low-pass after it; the state-variable or ladder filter (the page's nb-vcf) with a static,
// rise-and-settle or peak-and-fall envelope; a noise pick (the Pluck); delayed vibrato (the Tyrell); a glide (the
// Mono); and the amp envelope held, settling to a sustain, or dying away while held (percussive). Params from the
// page: p[1] oscillators; oscillator i at 2 + 7i: wave, ratio, detune, detune start, its ramp, gain; then filter
// 58..65, amp 66..71, drift 72, glide 73..74, comb 75..82, noise 83..86, vibrato 87..89, ladder offset 90.
struct Biquad2 {   // RBJ low-pass and band-pass (Web Audio's shapes)
  double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
  void set(int type, double f, double q, double sr) {
    double w = 2 * M_PI * std::min(f, sr * 0.45) / sr, c = cos(w), sn = sin(w), al = sn / (2 * q), a0 = 1 + al;
    if (type == 0) { b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; b2 = b0; }
    else { b0 = al / a0; b1 = 0; b2 = -al / a0; }
    a1 = -2 * c / a0; a2 = (1 - al) / a0;
  }
  inline double run(double x) { double y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y; }
};
struct Gen {
  int nosc = 0; double wave[8], mul[8], det[8], det0[8], detT[8], gain[8], ph[8];
  int ft = 0; double k = 1, fMode = 0, fBase = 1000, fPeak = 1000, fSettle = 1000, fT1 = 0.01, fTau = 0.3, dr = 1;
  double aAtk = 0.003, aPeak = 0.5, aSus = -1, aTau = 0.4, aMode = 0, release = 0.3, driftC = 0, gFrom = 1, gT = 0;
  bool comb = false; double cD0 = 0, cDep = 0, cRate = 3, cInv = -0.7, cPh = 0; std::vector<float> cBuf; int cW = 0;
  bool post = false; Biquad2 lp; double dry = 1;
  double nG = 0, nDec = 0.02; Biquad2 bp; double vibD = 0, vibOn = 0.75, vibRate = 5.6, vibPh = 0;
  double s1 = 0, s2 = 0, s3 = 0, s4 = 0, ic1 = 0, ic2 = 0, env = 0.0001; int64_t endAt = INT64_MAX;
  double gdrv = 1.9;   // (177) the Analog bar's Drive (1 + 3 × drive; near 0: no saturation, the Analog core off)
  uint32_t rng = 7;
  inline double noise() { rng = rng * 1664525u + 1013904223u; return (double)(int32_t)rng / 2147483648.0; }
  void setup(const double* p, double sr, uint32_t seed) {
    rng = seed; nosc = std::max(0, std::min(8, (int)p[1]));
    for (int i = 0; i < nosc; i++) { const double* o = p + 2 + i * 7; wave[i] = o[0]; mul[i] = o[1]; det[i] = o[2]; det0[i] = o[3]; detT[i] = o[4]; gain[i] = o[5]; rng = rng * 1664525u + 1013904223u; ph[i] = (rng >> 8) / 16777216.0 * o[6]; }
    ft = (int)p[58]; const double qlin = pow(10.0, std::max(-20.0, std::min(30.0, p[59])) / 20.0);
    k = ft == 2 ? std::min(3.85, 4 * (1 - 1 / std::max(1.0, qlin))) : 1 / std::max(0.5, qlin);
    fMode = p[60]; fBase = p[61]; fPeak = p[62]; fSettle = p[63]; fT1 = std::max(0.001, p[64]); fTau = std::max(0.005, p[65]); dr = (p[90] > 0 ? p[90] : 1) * (p[93] > 0 ? p[93] : 1); gdrv = p[91] > 0 ? p[91] : 1.9;
    aAtk = std::max(0.001, p[66]); aPeak = p[67]; aSus = p[68]; aTau = std::max(0.005, p[69]); aMode = p[70]; release = std::max(0.01, p[71]);
    driftC = p[72]; gFrom = p[73] > 0 ? p[73] : 1; gT = p[74];
    comb = p[75] > 0; if (comb) { cD0 = p[76]; cDep = p[77]; cRate = p[78]; cInv = p[79]; cBuf.assign(4096, 0.f); }
    post = p[80] > 0; if (post) lp.set(0, p[80], p[81] > 0 ? p[81] : 0.707, sr); dry = p[82] > 0 ? p[82] : 1;
    nG = p[83]; nDec = std::max(0.002, p[86]); if (nG > 0) bp.set(1, p[84], p[85] > 0 ? p[85] : 1, sr);
    vibD = p[87]; vibOn = std::max(0.001, p[88]); vibRate = p[89] > 0 ? p[89] : 5.6;
  }
  // renders into out (mono, added); false when finished
  bool render(int64_t from, int n, float* out, int64_t start, int64_t rel, double f, double sr, double mix, double bendC, double vibC, double vibPh0, double driftDepth, double& driftPh, double driftRate) {
    const double isr = 1.0 / sr, w = M_PI / sr, ny = sr * 0.45, cR = exp(-1.0 / (std::max(0.005, release / 4) * sr)), cS = exp(-1.0 / (aTau * sr));
    const double drv = gdrv, idr = 1 / drv; double g = 0, G = 0, a1 = 0, a2 = 0, a3 = 0, lastF = -1;
    double inc[8];
    for (int i = 0; i < n; i++) {
      const int64_t fr = from + i;
      if (fr < start) continue;
      if (fr >= endAt) return false;
      const double t = (fr - start) * isr;
      if ((i & 15) == 0 || lastF < 0) {   // pitch, every 16 samples: drift, wheels, vibrato, glide, scoops
        driftPh += driftRate * 16 * isr; if (driftPh >= 1) driftPh -= 1;
        const double vib = vibD > 0 ? vibD * std::min(1.0, t / vibOn) * sin(vibPh) : 0;
        if (vibD > 0) vibPh += 2 * M_PI * vibRate * 16 * isr;
        const double common = driftC + driftDepth * sin(2 * M_PI * driftPh) + bendC + vibC * sin(vibPh0 + 2 * M_PI * 5.6 * i * isr) + vib;
        const double gl = (gT > 0 && t < gT) ? gFrom * pow(1 / gFrom, t / gT) : 1;
        for (int o = 0; o < nosc; o++) {
          const double d = (detT[o] > 0 && t < detT[o]) ? det0[o] + (det[o] - det0[o]) * (t / detT[o]) : det[o];
          inc[o] = f * mul[o] * gl * exp2((common + d) / 1200.0) * isr;
        }
      }
      double x = 0;
      for (int o = 0; o < nosc; o++) {
        const double dt = std::min(0.49, inc[o]); ph[o] += dt; if (ph[o] >= 1) ph[o] -= 1;
        double v; const int wv = (int)wave[o];
        if (wv == 0) v = sawAt(ph[o], dt);
        else if (wv == 1) { double p2 = ph[o] + 0.5; if (p2 >= 1) p2 -= 1; v = (sawAt(ph[o], dt) - sawAt(p2, dt)) * 0.5; }
        else if (wv == 2) v = ph[o] < 0.5 ? 4 * ph[o] - 1 : 3 - 4 * ph[o];
        else v = sin(2 * M_PI * ph[o]);
        x += v * gain[o];
      }
      if (comb) {   // the stack minus a swept, delayed copy of itself
        cBuf[cW] = (float)x; const double d = std::max(1.0 / sr, cD0 + cDep * sin(2 * M_PI * cPh)) * sr; cPh += cRate * isr; if (cPh >= 1) cPh -= 1;
        double rp = cW - d; while (rp < 0) rp += 4096; const int i0 = (int)rp; const double fr2 = rp - i0; const double dl = cBuf[i0 & 4095] * (1 - fr2) + cBuf[(i0 + 1) & 4095] * fr2;
        x = x + cInv * dl; cW = (cW + 1) & 4095;
      }
      if (post) x = lp.run(x);
      double y = x;
      if (ft) {
        if ((i & 3) == 0 || lastF < 0) {
          double fc = fBase;
          if (fMode == 1) fc = t < fT1 ? fBase + (fPeak - fBase) * (t / fT1) : fSettle + (fPeak - fSettle) * exp(-(t - fT1) / fTau);
          else if (fMode == 2) fc = t < fT1 ? fPeak : fBase + (fPeak - fBase) * exp(-(t - fT1) / fTau);
          fc *= dr; if (fc > ny) fc = ny; else if (fc < 10) fc = 10;
          if (fc != lastF) { lastF = fc; g = tan(w * fc); if (ft == 2) G = g / (1 + g); else { a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2; } }
        }
        if (ft == 2) {
          const double G2 = G * G, G4 = G2 * G2, S = (G2 * G * s1 + G2 * s2 + G * s3 + s4) / (1 + g);
          const double y4e = (G4 * x * (1 + k) + S) / (1 + k * G4);
          const double u = satf((float)((x * (1 + k) - k * y4e) * drv)) * idr;
          double v = (u - s1) * G; const double y1 = v + s1; s1 = y1 + v;
          v = (y1 - s2) * G; const double y2 = v + s2; s2 = y2 + v;
          v = (y2 - s3) * G; const double y3 = v + s3; s3 = y3 + v;
          v = (y3 - s4) * G; const double y4 = v + s4; s4 = y4 + v; y = y4;
        } else {
          const double vs = satf((float)(x * drv)) * idr, v3 = vs - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
          ic1 = satf((float)((2 * v1 - ic1) * 0.5)) * 2; ic2 = 2 * v2 - ic2; y = v2;
        }
      } else lastF = 1;
      if (nG > 0 && t < nDec) y += bp.run(noise()) * nG * pow(0.0005 / nG, t / nDec);   // the pick: band-passed noise falling to −60 dB over nDec
      // amp
      if (fr < rel) {
        if (t < aAtk) env = 0.0001 + (aPeak - 0.0001) * (t / aAtk);
        else if (aMode == 1 && aSus >= 0) env = aSus + (env - aSus) * cS;
        else if (aMode == 2) env = 0.0001 + (env - 0.0001) * cS;
        else env = aPeak;
      } else {
        if (endAt == INT64_MAX) endAt = rel + (int64_t)((release * 1.6 + 0.1) * sr);
        env = 0.0001 + (env - 0.0001) * cR;
      }
      out[i] += (float)(y * dry * env * mix);
    }
    if (std::fabs(s1) < 1e-15) s1 = 0;
    if (std::fabs(s4) < 1e-15) s4 = 0;
    if (std::fabs(ic1) < 1e-15) ic1 = 0;
    if (std::fabs(ic2) < 1e-15) ic2 = 0;
    return true;
  }
};

struct Voice {
  int id = 0, bus = 0, kind = 1; bool alive = false; Gen gen;
  int64_t start = 0, rel = INT64_MAX;   // frames (absolute)
  double sr = 48000, mix = 1;
  // Juno
  double f = 440, ph = 0, phSub = 0, mSaw = 0, mPls = 0, mSub = 0, mNse = 0, pwmD = 0, pwmRate = 0.6, pwmPh = 0;
  double cut = 1000, peak = 2000, settle = 1500, fa = 0.02, fd = 0.5, attack = 0.01, release = 0.5, dryG = 1;
  double driftC = 0, driftRate = 0.1, driftDepth = 0, driftPh = 0, drv = 1.9, dr = 1.25, k = 0.476;
  bool hpOn = false; Biquad hp;
  double s1 = 0, s2 = 0, s3 = 0, s4 = 0;   // ladder
  bool svf = false; double ksv = 0.881, ic1 = 0, ic2 = 0;   // (177) the Analog core off: the browser's 12 dB filter (Q 1.1 dB) instead of the ladder
  double env = 0.0001, relLevel = 0; int64_t endAt = INT64_MAX;
  uint32_t rng = 1;
  inline double noise() { rng = rng * 1664525u + 1013904223u; return (double)(int32_t)rng / 2147483648.0; }
  // renders frames [from, from + n) into out (mono; the caller writes it to both channels); returns false when finished
  bool render(int64_t from, int n, float* out, double bendC, double vibC, double vibPh) {
    if (kind == 2) { if (!gen.render(from, n, out, start, rel, f, sr, mix, bendC, vibC, vibPh, driftDepth, driftPh, driftRate)) { alive = false; return false; } return true; }
    const double isr = 1.0 / sr, w = M_PI / sr, ny = sr * 0.45;
    const double tauA = 0.5 * sr, cA = exp(-1.0 / tauA), tauR = std::max(0.005, release / 4) * sr, cR = exp(-1.0 / tauR), cF = exp(-isr / std::max(0.01, fd));
    double g = 0, G = 0, lastF = -1, a1 = 0, a2 = 0, a3 = 0;
    for (int i = 0; i < n; i++) {
      const int64_t fr = from + i;
      if (fr < start) { out[i] += 0; continue; }
      if (fr >= endAt) { alive = false; return false; }
      const double t = (fr - start) * isr;
      // pitch: drift (static + slow wander), the bend wheel and vibrato
      if ((i & 15) == 0 || lastF < 0) {
        driftPh += driftRate * 16 * isr; if (driftPh >= 1) driftPh -= 1;
      }
      const double cents = driftC + driftDepth * sin(2 * M_PI * driftPh) + bendC + vibC * sin(vibPh + 2 * M_PI * 5.6 * i * isr);
      const double fq = f * exp2(cents / 1200.0), dt = fq * isr;
      // oscillators
      ph += dt; if (ph >= 1) ph -= 1;
      phSub += dt * 0.5; if (phSub >= 1) phSub -= 1;
      pwmPh += pwmRate * isr; if (pwmPh >= 1) pwmPh -= 1;
      const double saw = sawAt(ph, dt);
      double x = saw * mSaw;
      if (mPls > 0) {   // pulse: the saw minus a copy shifted by half a cycle, the shift swept by the PWM LFO
        double off = 0.5 + pwmD * sin(2 * M_PI * pwmPh); off = std::min(0.95, std::max(0.05, off));
        double p2 = ph - off; if (p2 < 0) p2 += 1;
        x += (saw - sawAt(p2, dt)) * mPls;
      }
      if (mSub > 0) {   // square an octave down (two band-limited saws)
        const double dts = dt * 0.5; double p2 = phSub + 0.5; if (p2 >= 1) p2 -= 1;
        x += (sawAt(phSub, dts) - sawAt(p2, dts)) * 0.5 * mSub;
      }
      if (mNse > 0) x += noise() * mNse;
      if (hpOn) x = hp.run(x);
      // the filter envelope: up to the peak over fa, then settling back with fd
      if ((i & 3) == 0 || lastF < 0) {
        double fc;
        if (t < fa) fc = cut + (peak - cut) * (t / fa);
        else { const double k2 = exp(-(t - fa) / std::max(0.01, fd)); fc = settle + (peak - settle) * k2; }
        fc *= dr;
        if (fc > ny) fc = ny; else if (fc < 10) fc = 10;
        if (fc != lastF) { lastF = fc; g = tan(w * fc); G = g / (1 + g); a1 = 1 / (1 + g * (g + ksv)); a2 = g * a1; a3 = g * a2; }
      }
      double y4;
      if (svf) {   // the state-variable filter (the page's nb-vcf svf; with no drive it's the browser's biquad)
        const double vs = satf((float)(x * drv)) / drv, v3 = vs - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = satf((float)((2 * v1 - ic1) * 0.5)) * 2; ic2 = 2 * v2 - ic2; y4 = v2;
      } else {
      // the ladder (the page's nb-vcf, lowpass): four TPT one-poles, global feedback, soft saturation
      const double G2 = G * G, G4 = G2 * G2, S = (G2 * G * s1 + G2 * s2 + G * s3 + s4) / (1 + g);
      const double y4e = (G4 * x * (1 + k) + S) / (1 + k * G4);
      const double u = satf((float)((x * (1 + k) - k * y4e) * drv)) / drv;
      double v = (u - s1) * G; const double y1 = v + s1; s1 = y1 + v;
      v = (y1 - s2) * G; const double y2 = v + s2; s2 = y2 + v;
      v = (y2 - s3) * G; const double y3 = v + s3; s3 = y3 + v;
      v = (y3 - s4) * G; y4 = v + s4; s4 = y4 + v;
      }
      // the amp envelope: a linear rise to 0.5 over attack, settling to 0.42; after release, toward silence
      if (fr < rel) {
        if (t < attack) env = 0.0001 + (0.5 - 0.0001) * (t / attack);
        else env = 0.42 + (env - 0.42) * cA;
      } else {
        if (endAt == INT64_MAX) endAt = rel + (int64_t)((release * 1.6 + 0.1) * sr);
        env = 0.0001 + (env - 0.0001) * cR;
      }
      out[i] += (float)(y4 * dryG * env * mix);
    }
    (void)cF;
    if (std::fabs(s1) < 1e-15) s1 = 0;
    if (std::fabs(s2) < 1e-15) s2 = 0;
    if (std::fabs(s3) < 1e-15) s3 = 0;
    if (std::fabs(s4) < 1e-15) s4 = 0;
    if (std::fabs(ic1) < 1e-15) ic1 = 0;
    if (std::fabs(ic2) < 1e-15) ic2 = 0;
    return true;
  }
};

struct Engine {
  std::mutex mu; std::vector<Cmd> q;   // from the page (main thread) to the render thread
  double* hdr = nullptr; float* ring = nullptr; int cap = 0, buses = 0; double sr = 48000; int ahead = 256;
  napi_ref hdrRef = nullptr, ringRef = nullptr;
  std::vector<Voice> voices;   // render thread only
  std::thread th; std::atomic<bool> run{false};
  int64_t wf = 0; double bendC = 0, vibC = 0, vibPh = 0;
  // workers
  int nwork = 0; std::vector<std::thread> workers; std::mutex wmu; std::condition_variable wcv;
  std::atomic<int> gen{0}, done{0}; std::atomic<bool> wstop{false};
  std::vector<std::vector<float>> wbuf;   // per worker: MAXBUS * BLOCK
  int64_t jobFrom = 0; std::vector<int> jobSplit;   // voice index ranges per worker
  // stats
  std::atomic<int> nVoices{0}, peakVoices{0}; std::atomic<double> renderUs{0}, renderMaxUs{0}; std::atomic<int64_t> blocks{0}, late{0};

  void renderRange(int a, int b, float* buf) {
    for (int vi = a; vi < b; vi++) {
      Voice& v = voices[vi]; if (!v.alive) continue;
      float* o = buf + v.bus * BLOCK;
      if (!v.render(jobFrom, BLOCK, o, bendC, vibC, vibPh)) v.alive = false;
    }
  }
  void workerLoop(int w) {
    int seen = 0;   // (from the start: a worker that starts late must still see the first job)
    while (!wstop.load()) {
      { std::unique_lock<std::mutex> lk(wmu); wcv.wait(lk, [&] { return wstop.load() || gen.load() != seen; }); }
      if (wstop.load()) return;
      seen = gen.load();
      float* buf = wbuf[w + 1].data(); std::fill(buf, buf + MAXBUS * BLOCK, 0.f);
      renderRange(jobSplit[w + 1], jobSplit[w + 2], buf);
      done.fetch_add(1);
    }
  }
  void applyCmds() {
    std::vector<Cmd> c; { std::lock_guard<std::mutex> lk(mu); c.swap(q); }
    for (auto& m : c) {
      if (m.type == 1) {
        Voice v; v.id = m.id; v.bus = std::max(0, std::min(buses - 1, m.bus)); v.sr = sr; v.mix = m.mix; v.alive = true;
        v.start = std::max(m.frame, wf);   // (a note already due plays at once)
        v.kind = (int)m.p[0] == 2 ? 2 : 1;
        const double* p = m.p + 1;
        v.f = 440.0 * exp2((m.midi - 69) / 12.0);
        v.rng = (uint32_t)(m.id * 2654435761u + 12345u);
        if (v.kind == 2) {
          v.gen.setup(m.p, sr, v.rng); v.release = v.gen.release; v.driftC = m.p[72];
          v.driftRate = 0.06 + ((v.rng >> 8) & 255) / 255.0 * 0.24; v.driftDepth = std::fabs(v.driftC) > 0 ? (m.p[92] > 0 ? m.p[92] : 0.35) * (3 + ((v.rng >> 16) & 255) / 255.0 * 4) : 0;
          voices.push_back(v); continue;
        }
        v.cut = p[0]; v.peak = p[1]; v.settle = p[2]; v.fa = p[3]; v.fd = p[4]; v.attack = std::max(0.001, p[5]); v.release = std::max(0.01, p[6]);
        v.mSaw = p[7]; v.mPls = p[8]; v.mSub = p[9]; v.mNse = p[10]; v.pwmD = p[11]; v.pwmRate = p[12];
        v.hpOn = p[13] > 0; if (v.hpOn) v.hp.highpass(p[13], 0.6, sr); v.dryG = p[14];
        v.driftC = p[15];
        // per-note wander and the ladder's own offset come from the id (the page sends the static drift)
        v.driftRate = 0.06 + ((v.rng >> 8) & 255) / 255.0 * 0.24; v.driftDepth = std::fabs(v.driftC) > 0 ? (m.p[92] > 0 ? m.p[92] : 0.35) * (3 + ((v.rng >> 16) & 255) / 255.0 * 4) : 0;
        v.ph = ((v.rng >> 4) & 1023) / 1024.0; v.pwmPh = ((v.rng >> 14) & 1023) / 1024.0;
        // (177) the Analog bar: its Drive, each note's filter a little different, and with the Analog core off the browser's 12 dB filter
        if (m.p[91] > 0) v.drv = m.p[91];
        v.svf = m.p[94] > 0.5; v.dr = (v.svf ? 1.0 : 1.25) * (m.p[93] > 0 ? m.p[93] : 1);
        voices.push_back(v);
      } else if (m.type == 2) {
        for (auto& v : voices) if (v.id == m.id && v.rel == INT64_MAX) v.rel = std::max(m.frame, std::max(wf, v.start));
      } else if (m.type == 3) {
        for (auto& v : voices) if (v.id == m.id) { v.rel = wf; v.release = std::min(v.release, 0.03); v.endAt = INT64_MAX; v.gen.release = std::min(v.gen.release, 0.03); v.gen.endAt = INT64_MAX; }
      } else if (m.type == 4) {
        for (auto& v : voices) { if (v.rel == INT64_MAX || v.rel > wf) v.rel = wf; v.release = std::min(v.release, 0.03); v.endAt = INT64_MAX; v.gen.release = std::min(v.gen.release, 0.03); v.gen.endAt = INT64_MAX; }
      } else if (m.type == 5) { bendC = m.p[0]; vibC = m.p[1]; }
    }
  }
  void renderBlock() {
    applyCmds();
    voices.erase(std::remove_if(voices.begin(), voices.end(), [](const Voice& v) { return !v.alive; }), voices.end());
    const int nv = (int)voices.size(); nVoices.store(nv); if (nv > peakVoices.load()) peakVoices.store(nv);
    float* main = wbuf[0].data(); std::fill(main, main + MAXBUS * BLOCK, 0.f);
    jobFrom = wf;
    const int use = (nwork > 0 && nv >= 6) ? std::min(nwork, nv / 3) : 0;
    if (use > 0) {
      const int parts = use + 1; jobSplit.assign(nwork + 2, nv);
      for (int i = 0; i <= parts; i++) jobSplit[i] = (int)((int64_t)nv * i / parts);
      for (int i = parts + 1; i < nwork + 2; i++) jobSplit[i] = nv;
      done.store(0);
      { std::lock_guard<std::mutex> lk(wmu); gen.fetch_add(1); }
      wcv.notify_all();
      renderRange(jobSplit[0], jobSplit[1], main);
      while (done.load() < nwork) { std::this_thread::yield(); }
      for (int w = 1; w <= nwork; w++) { const float* b = wbuf[w].data(); for (int i = 0; i < MAXBUS * BLOCK; i++) main[i] += b[i]; }
    } else renderRange(0, nv, main);
    vibPh += 2 * M_PI * 5.6 * BLOCK / sr; if (vibPh > 2 * M_PI) vibPh -= 2 * M_PI;
    for (int b = 0; b < buses; b++) {
      float* L = ring + (size_t)(b * 2) * cap; float* R = ring + (size_t)(b * 2 + 1) * cap; const float* s = main + b * BLOCK;
      for (int i = 0; i < BLOCK; i++) { const int idx = (int)((wf + i) % cap); L[idx] = s[i]; R[idx] = s[i]; }
    }
    wf += BLOCK;
    double wfd = (double)wf; __atomic_store(&hdr[1], &wfd, __ATOMIC_RELEASE);
  }
  void loop() {
    { sched_param sp; sp.sched_priority = 20; pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp); }   // (when the system allows it)
    while (run.load()) {
      double rfd; __atomic_load(&hdr[0], &rfd, __ATOMIC_ACQUIRE);
      const int64_t rf = (int64_t)rfd;
      if (wf < rf) { late.fetch_add(1); wf = rf - (rf % BLOCK); }   // fell behind (or just started): catch up
      int guard = 0;
      while (wf < rf + ahead && guard++ < 64) {
        timespec a, b; clock_gettime(CLOCK_MONOTONIC, &a);
        renderBlock();
        clock_gettime(CLOCK_MONOTONIC, &b);
        const double us = (b.tv_sec - a.tv_sec) * 1e6 + (b.tv_nsec - a.tv_nsec) / 1e3;
        renderUs.store(renderUs.load() * 0.98 + us * 0.02); if (us > renderMaxUs.load()) renderMaxUs.store(us);
        blocks.fetch_add(1);
      }
      timespec ts{0, 500000}; nanosleep(&ts, nullptr);
    }
  }
  void start() {
    if (run.load()) return;
    unsigned hc = std::thread::hardware_concurrency(); nwork = (int)std::max(0u, std::min(6u, hc > 3 ? hc - 3 : 0u));
    if (const char* e = getenv("NB_ENG_THREADS")) nwork = std::max(0, std::min(12, atoi(e) - 1));   // (testing)
    wbuf.assign(nwork + 1, std::vector<float>(MAXBUS * BLOCK, 0.f)); jobSplit.assign(nwork + 2, 0);
    wstop.store(false);
    for (int w = 0; w < nwork; w++) workers.emplace_back([this, w] { workerLoop(w); });
    run.store(true); th = std::thread([this] { loop(); });
  }
  void stop() {
    run.store(false); if (th.joinable()) th.join();
    wstop.store(true); { std::lock_guard<std::mutex> lk(wmu); gen.fetch_add(1); } wcv.notify_all();
    for (auto& w : workers) { if (w.joinable()) w.join(); }
    workers.clear();
  }
};

static Engine* E = nullptr;

static napi_value num(napi_env env, double d) { napi_value r; napi_create_double(env, d, &r); return r; }
static napi_value boolv(napi_env env, bool b) { napi_value r; napi_get_boolean(env, b, &r); return r; }
static double argd(napi_env env, napi_value v, double d = 0) { double x = d; if (napi_get_value_double(env, v, &x) != napi_ok) return d; return x; }
static size_t getargs(napi_env env, napi_callback_info info, napi_value* argv, size_t n) { size_t argc = n; napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr); return argc; }
static void* typedData(napi_env env, napi_value v, size_t* len) {
  bool is = false; napi_is_typedarray(env, v, &is); if (!is) return nullptr;
  napi_typedarray_type t; size_t n; void* data = nullptr; napi_value ab; size_t off;
  if (napi_get_typedarray_info(env, v, &t, &n, &data, &ab, &off) != napi_ok) return nullptr;
  if (len) *len = n;
  return data;
}

// eng_attach(hdr Float64Array, ring Float32Array, sampleRate, buses, capacity, ahead) -> true when running
static napi_value Attach(napi_env env, napi_callback_info info) {
  napi_value a[6]; size_t n = getargs(env, info, a, 6); if (n < 5) return boolv(env, false);
  size_t hl = 0, rl = 0; double* hdr = (double*)typedData(env, a[0], &hl); float* ring = (float*)typedData(env, a[1], &rl);
  const int buses = (int)argd(env, a[3], 4), cap = (int)argd(env, a[4], 4096);
  if (!hdr || !ring || hl < 8 || buses < 1 || buses > MAXBUS || cap < 1024 || rl < (size_t)buses * 2 * cap) return boolv(env, false);
  if (E) { E->stop(); if (E->hdrRef) napi_delete_reference(env, E->hdrRef); if (E->ringRef) napi_delete_reference(env, E->ringRef); delete E; E = nullptr; }
  E = new Engine(); E->hdr = hdr; E->ring = ring; E->sr = argd(env, a[2], 48000); E->buses = buses; E->cap = cap; E->ahead = n > 5 ? (int)argd(env, a[5], 256) : 256;
  napi_create_reference(env, a[0], 1, &E->hdrRef); napi_create_reference(env, a[1], 1, &E->ringRef);
  double rfd; memcpy(&rfd, &hdr[0], 8); E->wf = (int64_t)rfd; E->wf -= E->wf % BLOCK;
  E->start();
  return boolv(env, true);
}
// eng_note(id, bus, frame, midi, mix, params Float64Array(16))
static napi_value Note(napi_env env, napi_callback_info info) {
  napi_value a[6]; size_t n = getargs(env, info, a, 6); if (!E || n < 6) return boolv(env, false);
  Cmd c{}; c.type = 1; c.id = (int)argd(env, a[0]); c.bus = (int)argd(env, a[1]); c.frame = (int64_t)argd(env, a[2]); c.midi = (int)argd(env, a[3]); c.mix = argd(env, a[4], 1);
  size_t pl = 0; double* p = (double*)typedData(env, a[5], &pl); if (!p || pl < 17) return boolv(env, false);
  memcpy(c.p, p, sizeof(double) * std::min((size_t)NP, pl));
  { std::lock_guard<std::mutex> lk(E->mu); E->q.push_back(c); }
  return boolv(env, true);
}
static napi_value Off(napi_env env, napi_callback_info info) {   // eng_off(id, frame)
  napi_value a[2]; size_t n = getargs(env, info, a, 2); if (!E || n < 2) return boolv(env, false);
  Cmd c{}; c.type = 2; c.id = (int)argd(env, a[0]); c.frame = (int64_t)argd(env, a[1]);
  { std::lock_guard<std::mutex> lk(E->mu); E->q.push_back(c); } return boolv(env, true);
}
static napi_value Kill(napi_env env, napi_callback_info info) {   // eng_kill(id) · eng_kill(-1): everything, fast
  napi_value a[1]; size_t n = getargs(env, info, a, 1); if (!E) return boolv(env, false);
  Cmd c{}; const int id = n ? (int)argd(env, a[0], -1) : -1; c.type = id < 0 ? 4 : 3; c.id = id;
  { std::lock_guard<std::mutex> lk(E->mu); E->q.push_back(c); } return boolv(env, true);
}
static napi_value Pitch(napi_env env, napi_callback_info info) {   // eng_pitch(bendCents, vibratoCents)
  napi_value a[2]; size_t n = getargs(env, info, a, 2); if (!E || n < 2) return boolv(env, false);
  Cmd c{}; c.type = 5; c.p[0] = argd(env, a[0]); c.p[1] = argd(env, a[1]);
  { std::lock_guard<std::mutex> lk(E->mu); E->q.push_back(c); } return boolv(env, true);
}
static napi_value Stats(napi_env env, napi_callback_info info) {
  napi_value o; napi_create_object(env, &o);
  auto set = [&](const char* k, double v) { napi_set_named_property(env, o, k, num(env, v)); };
  if (!E) { set("running", 0); return o; }
  set("running", E->run.load() ? 1 : 0); set("voices", E->nVoices.load()); set("peakVoices", E->peakVoices.load()); set("threads", E->nwork + 1);
  set("blockUs", E->renderUs.load()); set("blockMaxUs", E->renderMaxUs.load()); set("blocks", (double)E->blocks.load()); set("caughtUp", (double)E->late.load());
  set("budgetUs", BLOCK / E->sr * 1e6); set("ahead", E->ahead);
  E->renderMaxUs.store(0); E->peakVoices.store(E->nVoices.load());
  return o;
}
static napi_value Stop(napi_env env, napi_callback_info info) {
  if (E) { E->stop(); if (E->hdrRef) napi_delete_reference(env, E->hdrRef); if (E->ringRef) napi_delete_reference(env, E->ringRef); delete E; E = nullptr; }
  return boolv(env, true);
}

napi_value Init(napi_env env, napi_value exports) {
  const napi_property_descriptor d[] = {
    { "eng_attach", nullptr, Attach, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "eng_note", nullptr, Note, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "eng_off", nullptr, Off, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "eng_kill", nullptr, Kill, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "eng_pitch", nullptr, Pitch, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "eng_stats", nullptr, Stats, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "eng_stop", nullptr, Stop, nullptr, nullptr, nullptr, napi_default, nullptr },
  };
  napi_define_properties(env, exports, sizeof(d) / sizeof(d[0]), d);
  // (177) the page going away (a reload, closing) stops the engine first: its shared memory goes with the page
  napi_add_env_cleanup_hook(env, [](void*) { if (E) { E->stop(); delete E; E = nullptr; } }, nullptr);
  return exports;
}

}  // namespace nbeng

// called from the fast-pads module's Init so one .node file carries both
extern "C" napi_value nb_engine_init(napi_env env, napi_value exports) { return nbeng::Init(env, exports); }
