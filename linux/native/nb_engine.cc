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
#include <cstdio>
#include <cstdlib>
#include <mutex>
#include <thread>
#include <vector>
#include <map>
#include <memory>
#include <algorithm>
#include <pthread.h>
#include <sched.h>
#include <time.h>
#include <unistd.h>

namespace nbeng {

static const int BLOCK = 128, MAXBUS = 8;

static const int NP = 160;   // note parameters: [0] kind, then the kind's own (see Voice and Gen)
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
// (185) wavetables from the page's harmonic lists (its PeriodicWaves: the Vital's, the Zeb's, the FM's feedback
// shapes), made once each and kept: a 2048-point cycle at a few harmonic counts, the one a note uses below Nyquist,
// scaled to a peak of 1 as the browser scales a PeriodicWave
struct Table { std::vector<std::vector<float>> mip; std::vector<int> maxH; };
static std::mutex gTabMu; static std::map<int, std::shared_ptr<Table>> gTabs;
static std::shared_ptr<Table> buildTable(const float* h, int nh) {
  auto T = std::make_shared<Table>(); const int N = 2048;
  std::vector<float> full(N, 0.f);
  for (int H = std::max(1, nh - 1); ; H = H / 2) {
    std::vector<float> c(N, 0.f);
    for (int k = 1; k <= H && k < nh; k++) { const double a = h[k]; if (a == 0) continue; for (int i = 0; i < N; i++) c[i] += (float)(a * sin(2 * M_PI * k * i / N)); }
    T->mip.push_back(c); T->maxH.push_back(H);
    if (H <= 1) break;
  }
  float pk = 0; for (float v : T->mip[0]) pk = std::max(pk, std::fabs(v)); if (pk > 0) for (auto& m : T->mip) for (auto& v : m) v /= pk;
  return T;
}
static inline double tableAt(const Table* T, double ph, double f, double sr) {
  size_t m = 0; while (m + 1 < T->mip.size() && T->maxH[m] * std::fabs(f) > sr * 0.5) m++;
  const auto& c = T->mip[m]; const double x = ph * 2048; const int i0 = (int)x; const double fr = x - i0; return c[i0 & 2047] * (1 - fr) + c[(i0 + 1) & 2047] * fr;
}

// (201) The Roland Alpha Juno's DCO, after dfl_AlphaJunoOscillator (jc303, GPL-3, midilab/jc303 PR #80 by dfl): one
// rising ramp chopped by gates at +1 and +3 octaves, derived from the hardware's binary counter, each value jump
// band-limited with a 2-point polyBLEP. Waves 0-4 = SAW01-05 (SAW03: chopped at +1 octave by the pulse width, the
// hoover's wave), 5 = the pulse at that width. The pulse width moves at audio rate (PWM): its edges are rebuilt
// every 16 samples when it changes.
// (204) hard sync, anti-aliased: a slave saw reset by the master. Every step in it (the slave's own wraps and each
// master reset, where it jumps from wherever it was back to the start) is band-limited with a 2-point polyBLEP placed
// at its exact position inside the sample; the output runs one sample late so the correction can reach both sides of
// the step. xm is Jupiter-8 cross-mod: the master's saw moves the slave's frequency (audio-rate FM).
struct SyncOsc {
  double ps = 0, prev = 0, dx = 0, dy = 0;
  void reset() { ps = 0; prev = 0; dx = dy = 0; }
  // pm: the master's phase after this sample's step (0..1), dm: its step; ratio: slave / master frequency
  inline double step(double pm, double dm, double ratio, double xm) {
    const double mv = 2 * pm - 1;
    double ds = dm * ratio * (1 + xm * mv); if (ds < 0) ds = 0; if (ds > 0.49) ds = 0.49;
    double cP = 0, cC = 0;   // corrections: to the previous sample, to this one
    if (dm > 0 && pm < dm) {   // the master wrapped inside this sample, tau of a sample ago
      const double tau = pm / dm;
      double pr = ps + ds * (1 - tau);   // the slave's phase when it was reset
      if (pr >= 1) { pr -= 1; const double tw = ds > 0 ? tau + pr / ds : tau; cP += -tw * tw; cC += (1 - tw) * (1 - tw); }   // it wrapped first (a step of -2)
      const double h = -2 * pr;   // the reset: from 2pr-1 down to -1
      cP += 0.5 * h * tau * tau; cC += -0.5 * h * (1 - tau) * (1 - tau);
      ps = ds * tau;
    } else {
      ps += ds;
      if (ps >= 1) { ps -= 1; const double tw = ds > 0 ? ps / ds : 0; cP += -tw * tw; cC += (1 - tw) * (1 - tw); }
    }
    const double out = prev + cP;
    prev = 2 * ps - 1 + cC;
    const double y = out - dx + 0.9995 * dy; dx = out; dy = y;   // (sync leaves a DC offset that moves with the ratio)
    return y;
  }
};
struct AJOsc {
  int wave = 2, n = 0; double duty = 0.5, ep[16], ej[16];
  static inline double fr(double x) { return x - std::floor(x); }
  static inline double blep(double t, double dt) { if (t < dt) { const double x = t / dt; return x + x - x * x - 1.0; } if (t > 1.0 - dt) { const double x = (t - 1.0) / dt; return x * x + x + x + 1.0; } return 0.0; }
  inline bool open(double p) const {
    switch (wave) { case 0: return true; case 1: return fr(2 * p) < 0.5; case 2: return fr(2 * p) < duty; case 3: return fr(8 * p) < 0.5; case 4: return fr(2 * p) < duty && fr(8 * p) < 0.5; default: return true; }
  }
  void add(double p, double j) { if (n < 16) { ep[n] = p - std::floor(p); ej[n] = j; n++; } }
  void build() {
    n = 0;
    if (wave == 5) { add(0, 2); add(duty, -2); return; }
    if (wave == 0) { add(0, -2); return; }
    double b[16]; int m = 0;
    if (wave == 1 || wave == 2) { const double d = wave == 1 ? 0.5 : duty; b[m++] = 0; b[m++] = d * 0.5; b[m++] = 0.5; b[m++] = 0.5 + d * 0.5; }
    else if (wave == 3) { for (int k = 0; k < 8; k++) { b[m++] = k / 8.0; b[m++] = k / 8.0 + 1.0 / 16; } }
    else { bool prev = open(15.5 / 16); for (int j = 0; j < 16 && m < 16; j++) { const bool cur = open((j + 0.5) / 16); if (cur != prev) b[m++] = j / 16.0; prev = cur; } }
    for (int i = 0; i < m; i++) { const bool on = open(b[i] + 1e-9); const double r = 2 * b[i] - 1; add(b[i], on ? r : -r); }
  }
  void setDuty(double d) { d = std::max(0.04, std::min(0.96, d)); if (std::fabs(d - duty) > 1e-4) { duty = d; if (wave == 2 || wave == 4 || wave == 5) build(); } }
  inline double at(double p, double dt) const {
    double v;
    if (wave == 5) v = p < duty ? 1.0 : -1.0; else v = open(p) ? 2 * p - 1 : 0.0;
    for (int i = 0; i < n; i++) { double t = p - ep[i]; t -= std::floor(t); v += 0.5 * ej[i] * blep(t, dt); }
    return v;
  }
};

struct Gen {
  int nosc = 0; double wave[8], mul[8], det[8], det0[8], detT[8], gain[8], ph[8];
  double skey[8] = {}, sdc[8] = {}; int fade[8] = {}; double fadeT = 0.1;   // (178) hard-sync waves (wave 4: mul is the ratio) and crossfades between them
  int ft = 0; double k = 1, fMode = 0, fBase = 1000, fPeak = 1000, fSettle = 1000, fT1 = 0.01, fTau = 0.3, dr = 1;
  double aAtk = 0.003, aPeak = 0.5, aSus = -1, aTau = 0.4, aMode = 0, release = 0.3, driftC = 0, gFrom = 1, gT = 0;
  bool comb = false; double cD0 = 0, cDep = 0, cRate = 3, cInv = -0.7, cPh = 0; std::vector<float> cBuf; int cW = 0;
  bool post = false; Biquad2 lp; double dry = 1;
  double nG = 0, nDec = 0.02; Biquad2 bp; double vibD = 0, vibOn = 0.75, vibRate = 5.6, vibPh = 0;
  double s1 = 0, s2 = 0, s3 = 0, s4 = 0, ic1 = 0, ic2 = 0, env = 0.0001; int64_t endAt = INT64_MAX;
  double gdrv = 1.9;   // (177) the Analog bar's Drive (1 + 3 × drive; near 0: no saturation, the Analog core off)
  // (185) wavetable oscillators (wave 5), a shared LFO on oscillator levels and the cutoff (the Vital, the Zeb), formants and breath (the Choir)
  std::shared_ptr<Table> tbl[8]; double lfoRate = 0, lfoPh = 0, lfoF = 0, lfoG[8] = {};
  bool form = false; Biquad2 fb[3]; double fl[3] = {}; double brG = 0; Biquad brHp;
  AJOsc aj[8]; bool ajOn = false; double ajDuty = 0.5, ajDepth = 0, ajRate = 0, ajPh = 0;   // (201) Alpha Juno DCOs (wave 6) and their PWM
  SyncOsc so[8]; double sR0 = 1, sR1 = 1, sT = 0.1, sXm = 0, sRat = 1;   // (204) hard-sync slaves (wave 7): the ratio sweeps from sR0 to sR1 over sT, sXm cross-mod
  uint32_t rng = 7;
  inline double noise() { rng = rng * 1664525u + 1013904223u; return (double)(int32_t)rng / 2147483648.0; }
  void setup(const double* p, double sr, uint32_t seed) {
    rng = seed; nosc = std::max(0, std::min(8, (int)p[1]));
    for (int i = 0; i < nosc; i++) { const double* o = p + 2 + i * 7; wave[i] = o[0]; mul[i] = o[1]; det[i] = o[2]; det0[i] = o[3]; detT[i] = o[4]; gain[i] = o[5]; rng = rng * 1664525u + 1013904223u; ph[i] = (rng >> 8) / 16777216.0 * o[6];
      fade[i] = (int)p[100 + i];
      if ((int)wave[i] == 4) {   // the page's syncWave(ratio): a saw reset every cycle, ratio in twelfths, without its DC
        skey[i] = std::max(1.0, std::round(mul[i] * 12) / 12); mul[i] = 1; double m = 0; for (int k = 0; k < 512; k++) { const double x = k / 512.0 * skey[i]; m += (x - std::floor(x)) * 2 - 1; } sdc[i] = m / 512; } }
    fadeT = p[99] > 0 ? p[99] : 0.1;
    for (int i = 0; i < nosc; i++) if ((int)wave[i] == 5) { std::lock_guard<std::mutex> lk(gTabMu); auto it = gTabs.find((int)p[2 + i * 7 + 6]); if (it != gTabs.end()) tbl[i] = it->second; ph[i] = 0; if (!tbl[i]) wave[i] = 3; }
    ajOn = false; ajDuty = p[138] > 0 ? p[138] : 0.5; ajDepth = p[139]; ajRate = p[140]; ajPh = 0;   // (201) p[130+i] each DCO's wave, p[138] width, p[139] PWM depth, p[140] PWM rate
    for (int i = 0; i < nosc; i++) if ((int)wave[i] == 6) { ajOn = true; aj[i].wave = std::max(0, std::min(5, (int)p[130 + i])); aj[i].duty = std::max(0.04, std::min(0.96, ajDuty)); aj[i].build(); }
    sR0 = p[141] > 0 ? p[141] : 1; sR1 = p[142] > 0 ? p[142] : 1; sT = p[143] > 0 ? p[143] : 0.1; sXm = p[144]; sRat = sR0;   // (204) p[141] start ratio, p[142] end, p[143] sweep time, p[144] cross-mod
    for (int i = 0; i < nosc; i++) if ((int)wave[i] == 7) { so[i].reset(); ph[i] = 0; }
    lfoRate = p[108]; lfoF = p[109]; for (int i = 0; i < 8; i++) lfoG[i] = p[110 + i];
    form = p[118] > 0; if (form) for (int j = 0; j < 3; j++) { fb[j].set(1, p[119 + j], p[122 + j] > 0 ? p[122 + j] : 1, sr); fl[j] = p[125 + j]; }
    brG = p[128]; if (brG > 0) brHp.highpass(p[129] > 0 ? p[129] : 700, 1.12, sr);
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
        if (ajOn) { double d = ajDuty; if (ajDepth > 0 && ajRate > 0) { d += ajDepth * 0.5 * sin(2 * M_PI * ajPh); ajPh += ajRate * 16 * isr; if (ajPh >= 1) ajPh -= 1; } for (int o = 0; o < nosc; o++) if ((int)wave[o] == 6) aj[o].setDuty(d); }
        sRat = sR1 + (sR0 - sR1) * exp(-t / sT);
        for (int o = 0; o < nosc; o++) {
          const double d = (detT[o] > 0 && t < detT[o]) ? det0[o] + (det[o] - det0[o]) * (t / detT[o]) : det[o];
          inc[o] = f * mul[o] * gl * exp2((common + d) / 1200.0) * isr;
        }
      }
      double x = 0, lfoV = 0;
      if (lfoRate > 0) { lfoV = sin(2 * M_PI * lfoPh); lfoPh += lfoRate * isr; if (lfoPh >= 1) lfoPh -= 1; }
      for (int o = 0; o < nosc; o++) {
        const double dt = std::min(0.49, inc[o]); ph[o] += dt; if (ph[o] >= 1) ph[o] -= 1;
        double v; const int wv = (int)wave[o];
        if (wv == 0) v = sawAt(ph[o], dt);
        else if (wv == 1) { double p2 = ph[o] + 0.5; if (p2 >= 1) p2 -= 1; v = (sawAt(ph[o], dt) - sawAt(p2, dt)) * 0.5; }
        else if (wv == 2) v = ph[o] < 0.5 ? 4 * ph[o] - 1 : 3 - 4 * ph[o];
        else if (wv == 4) {   // hard sync: the slave saw (band-limited at its own wraps and at the master's reset)
          const double k = skey[o], sx = ph[o] * k, sp = sx - std::floor(sx), dk = std::min(0.49, dt * k), fr = k - std::floor(k);
          v = 2 * sp - 1 - polyblep(sp, dk) - sdc[o];
          if (fr > 1e-6) v -= fr * polyblep(ph[o], dt);
        }
        else if (wv == 5 && tbl[o]) v = tableAt(tbl[o].get(), ph[o], inc[o] * sr, sr);
        else if (wv == 6) v = aj[o].at(ph[o], dt);
        else if (wv == 7) v = so[o].step(ph[o], dt, sRat, sXm);
        else v = sin(2 * M_PI * ph[o]);
        double fg = 1;
        if (fade[o]) { const double T = fadeT, u = t / T; fg = fade[o] == 1 ? std::max(0.0, 1 - u) : fade[o] == 3 ? std::min(1.0, u) : (u < 0.5 ? u * 2 : std::max(0.0, 2 - u * 2)); }
        x += v * (gain[o] + lfoG[o] * lfoV) * fg;
      }
      if (brG > 0) x += brHp.run(noise()) * brG;   // breath: high-passed noise, all along
      if (form) { const double s0 = x; x = 0; for (int j = 0; j < 3; j++) x += fb[j].run(s0) * fl[j]; }   // three formants side by side
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
          if (lfoF != 0) fc += lfoF * lfoV;
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

// (178) the Comb Bells: tuned partials (and their shimmer copies) each ringing down at its own rate, a click of
// high-passed noise, the page's ampEnv and release. p[1] partials (up to 12); partial k at 2 + 4k: ratio, detune
// (cents), level, ring time (s); p[60] click level, p[61] its high-pass (Hz).
struct Bell {
  int n = 0; double r[12], det[12], a[12], dec[12], ph[12], maxDec = 0; double nG = 0; Biquad hp; uint32_t rng = 3; double env = 0.0001, release = 0.3; int64_t endAt = INT64_MAX;
  inline double noise() { rng = rng * 1664525u + 1013904223u; return (double)(int32_t)rng / 2147483648.0; }
  void setup(const double* p, double sr, uint32_t seed) {
    rng = seed; n = std::max(0, std::min(12, (int)p[1]));
    for (int k = 0; k < n; k++) { const double* q = p + 2 + k * 4; r[k] = q[0]; det[k] = q[1]; a[k] = std::max(1e-4, q[2]); dec[k] = std::max(0.01, q[3]); ph[k] = 0; maxDec = std::max(maxDec, dec[k]); }
    nG = p[60]; if (nG > 0) hp.highpass(std::max(100.0, p[61]), 1.12, sr);
    release = std::max(0.01, p[71]);
  }
  bool render(int64_t from, int nf, float* out, int64_t start, int64_t rel, double f, double sr, double mix, double cents0) {
    const double isr = 1.0 / sr, cR = exp(-1.0 / (std::max(0.005, release / 4) * sr));
    double inc[12]; for (int k = 0; k < n; k++) inc[k] = f * r[k] * exp2((cents0 + det[k]) / 1200.0) * isr;
    for (int i = 0; i < nf; i++) {
      const int64_t fr = from + i; if (fr < start) continue;
      if (fr >= endAt) return false;
      const double t = (fr - start) * isr;
      if (t > maxDec + 0.05 && fr < rel) return false;   // (every partial has rung down: nothing left to hear)
      double x = 0;
      for (int k = 0; k < n; k++) {
        if (inc[k] > 0.354) continue;   // (above 17 kHz)
        ph[k] += inc[k]; if (ph[k] >= 1) ph[k] -= 1;
        const double g = t < 0.002 ? a[k] * t / 0.002 : t < dec[k] ? a[k] * pow(0.0005 / a[k], (t - 0.002) / std::max(0.001, dec[k] - 0.002)) : 0.0005;
        x += sin(2 * M_PI * ph[k]) * g;
      }
      if (nG > 0 && t < 0.012 * 6) x += hp.run(noise()) * nG * pow(0.0005 / nG, t / 0.012);
      if (fr < rel) env = t < 0.002 ? 0.0001 + (1 - 0.0001) * (t / 0.002) : 1;
      else { if (endAt == INT64_MAX) endAt = rel + (int64_t)((release * 1.6 + 0.1) * sr); env = 0.0001 + (env - 0.0001) * cR; }
      out[i] += (float)(x * env * mix);
    }
    return true;
  }
};

// (185) the FM synth (after Dexed, 090's fmVoice): six sine operators (the feedback one a table of its own, as the
// page's fbWave), each with a four-point envelope of straight lines; a modulator's output is added to the frequency of
// the operator it feeds (in Hz, as Web Audio's frequency input), the carriers summed. p[1] operators; operator k at
// 2 + 12k: frequency (Hz), detune (cents), table id (-1 sine), carrier (1/0), the envelope v0 t1 v1 t2 v2 t3 v3; p[80]
// links, then (from, to) pairs from p[81], numbered from 1; p[120] the carriers' gain, p[121] release.
struct FM {
  int n = 0; double fq[6], det[6], ev[6][7], ph[6] = {}, o[6] = {}; bool car[6]; std::shared_ptr<Table> tb[6];
  int nl = 0, lf[16], lt[16], order[6]; double carG = 0.1, release = 0.3, env = 0.0001; int64_t endAt = INT64_MAX;
  void setup(const double* p) {
    n = std::max(0, std::min(6, (int)p[1]));
    for (int k = 0; k < n; k++) { const double* q = p + 2 + k * 12; fq[k] = q[0]; det[k] = q[1]; car[k] = q[3] > 0.5; for (int j = 0; j < 7; j++) ev[k][j] = q[4 + j];
      if (q[2] >= 0) { std::lock_guard<std::mutex> lk(gTabMu); auto it = gTabs.find((int)q[2]); if (it != gTabs.end()) tb[k] = it->second; } }
    nl = std::max(0, std::min(16, (int)p[80]));
    for (int j = 0; j < nl; j++) { lf[j] = (int)p[81 + j * 2] - 1; lt[j] = (int)p[82 + j * 2] - 1; if (lf[j] < 0 || lf[j] >= n || lt[j] < 0 || lt[j] >= n || lf[j] == lt[j]) { lf[j] = lt[j] = -1; } }
    // modulators before what they feed (the links have no loops: feedback is in the table)
    bool done[6] = {}; int m = 0;
    for (int pass = 0; pass < 6 && m < n; pass++) for (int k = 0; k < n; k++) { if (done[k]) continue; bool ready = true; for (int j = 0; j < nl; j++) if (lt[j] == k && lf[j] >= 0 && !done[lf[j]]) ready = false; if (ready || pass == 5) { done[k] = true; order[m++] = k; } }
    n = m; carG = p[120]; release = std::max(0.01, p[121]);
  }
  static inline double seg(const double* e, double t) {   // v0 → v1 by t1 → v2 by t2 → v3 by t3, then held
    if (t >= e[5]) return e[6];
    if (t >= e[3]) return e[4] + (e[6] - e[4]) * (t - e[3]) / std::max(1e-6, e[5] - e[3]);
    if (t >= e[1]) return e[2] + (e[4] - e[2]) * (t - e[1]) / std::max(1e-6, e[3] - e[1]);
    return e[0] + (e[2] - e[0]) * t / std::max(1e-6, e[1]);
  }
  bool render(int64_t from, int nf, float* out, int64_t start, int64_t rel, double sr, double mix, double bendC, double vibC, double vibPh0) {
    const double isr = 1.0 / sr, cR = exp(-1.0 / (std::max(0.005, release / 4) * sr));
    double mul[6], fqC[6];
    for (int i = 0; i < nf; i++) {
      const int64_t fr = from + i; if (fr < start) continue;
      if (fr >= endAt) return false;
      const double t = (fr - start) * isr;
      if ((i & 15) == 0 || i == 0) { const double c = bendC + vibC * sin(vibPh0 + 2 * M_PI * 5.6 * i * isr); for (int k = 0; k < n; k++) { mul[k] = exp2((det[k] + c) / 1200.0); fqC[k] = std::min(fq[k], 20000.0); } }
      double x = 0;
      for (int a = 0; a < n; a++) {
        const int k = order[a]; double md = 0; for (int j = 0; j < nl; j++) if (lt[j] == k && lf[j] >= 0) md += o[lf[j]];
        const double hz = (fqC[k] + md) * mul[k]; ph[k] += hz * isr; ph[k] -= std::floor(ph[k]);
        const double w = tb[k] ? tableAt(tb[k].get(), ph[k], hz, sr) : sin(2 * M_PI * ph[k]);
        o[k] = w * seg(ev[k], t);
        if (car[k]) x += o[k];
      }
      if (fr < rel) env = t < 0.003 ? 0.0001 + (1 - 0.0001) * (t / 0.003) : 1;
      else { if (endAt == INT64_MAX) endAt = rel + (int64_t)((release * 1.6 + 0.1) * sr); env = 0.0001 + (env - 0.0001) * cR; }
      out[i] += (float)(x * carG * env * mix);
    }
    return true;
  }
};

struct Voice {
  int id = 0, bus = 0, kind = 1; bool alive = false; Gen gen; Bell bell; FM fm;
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
    if (kind == 3) {   // (the drift's slow wander, as nbDrift gives the browser's bells)
      driftPh += driftRate * n / sr; if (driftPh >= 1) driftPh -= 1;
      if (!bell.render(from, n, out, start, rel, f, sr, mix, driftC + driftDepth * sin(2 * M_PI * driftPh) + bendC)) { alive = false; return false; } return true; }
    if (kind == 4) { if (!fm.render(from, n, out, start, rel, sr, mix, bendC, vibC, vibPh)) { alive = false; return false; } return true; }
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
    { char nm[16]; snprintf(nm, sizeof nm, "nb-eng-w%d", (w + 1) % 100); pthread_setname_np(pthread_self(), nm); }   // (179: the app's CPU meter finds the engine's threads by name)
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
        v.kind = (int)m.p[0] == 2 ? 2 : (int)m.p[0] == 3 ? 3 : (int)m.p[0] == 4 ? 4 : 1;
        const double* p = m.p + 1;
        v.f = 440.0 * exp2((m.midi - 69) / 12.0);
        v.rng = (uint32_t)(m.id * 2654435761u + 12345u);
        if (v.kind == 3) {
          v.bell.setup(m.p, sr, v.rng); v.release = v.bell.release; v.driftC = m.p[72];
          v.driftRate = 0.06 + ((v.rng >> 8) & 255) / 255.0 * 0.24; v.driftDepth = std::fabs(v.driftC) > 0 ? (m.p[92] > 0 ? m.p[92] : 0.35) * (3 + ((v.rng >> 16) & 255) / 255.0 * 4) : 0;
          voices.push_back(v); continue;
        }
        if (v.kind == 4) { v.fm.setup(m.p); v.release = v.fm.release; voices.push_back(v); continue; }
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
        for (auto& v : voices) if (v.id == m.id) { v.rel = wf; v.release = std::min(v.release, 0.03); v.endAt = INT64_MAX; v.gen.release = std::min(v.gen.release, 0.03); v.gen.endAt = INT64_MAX; v.bell.release = std::min(v.bell.release, 0.03); v.bell.endAt = INT64_MAX; v.fm.release = std::min(v.fm.release, 0.03); v.fm.endAt = INT64_MAX; }
      } else if (m.type == 4) {
        for (auto& v : voices) { if (v.rel == INT64_MAX || v.rel > wf) v.rel = wf; v.release = std::min(v.release, 0.03); v.endAt = INT64_MAX; v.gen.release = std::min(v.gen.release, 0.03); v.gen.endAt = INT64_MAX; v.bell.release = std::min(v.bell.release, 0.03); v.bell.endAt = INT64_MAX; v.fm.release = std::min(v.fm.release, 0.03); v.fm.endAt = INT64_MAX; }
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
    pthread_setname_np(pthread_self(), "nb-engine");
    { sched_param sp; sp.sched_priority = 20; pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp); }   // (when the system allows it)
    while (run.load()) {
      double rfd; __atomic_load(&hdr[0], &rfd, __ATOMIC_ACQUIRE);
      const int64_t rf = (int64_t)rfd;
      if (wf < rf) { late.fetch_add(1); wf = rf - (rf % BLOCK); }   // fell behind (or just started): catch up
      int guard = 0;
      { const double a = hdr[5]; if (a >= 128 && a <= 4096) ahead = (int)a; }   // (180) the page raises it when the browser takes its sound in bigger bursts
      while (wf < rf + ahead && guard++ < 64) {
        timespec a, b; clock_gettime(CLOCK_MONOTONIC, &a);
        renderBlock();
        clock_gettime(CLOCK_MONOTONIC, &b);
        const double us = (b.tv_sec - a.tv_sec) * 1e6 + (b.tv_nsec - a.tv_nsec) / 1e3;
        renderUs.store(renderUs.load() * 0.98 + us * 0.02); if (us > renderMaxUs.load()) renderMaxUs.store(us);
        blocks.fetch_add(1);
      }
      { const long us = (long)std::max(400.0, std::min(2000.0, (ahead - 256) / sr * 0.5e6)); timespec ts{0, us * 1000}; nanosleep(&ts, nullptr); }   // (181: as the plugins)
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
// (185) eng_table(id, harmonics Float64Array: [0] unused, [k] the k-th harmonic's sine amplitude) -> true
static napi_value TableN(napi_env env, napi_callback_info info) {
  napi_value a[2]; size_t n = getargs(env, info, a, 2); if (n < 1) return boolv(env, false);
  size_t hl = 0; double* h = n > 1 ? (double*)typedData(env, a[1], &hl) : nullptr;
  if (!h) { std::lock_guard<std::mutex> lk(gTabMu); gTabs.erase((int)argd(env, a[0])); return boolv(env, true); }   // (no list: that table goes)
  if (hl < 2 || hl > 1024) return boolv(env, false);
  std::vector<float> hf(hl); for (size_t i = 0; i < hl; i++) hf[i] = (float)h[i];
  auto T = buildTable(hf.data(), (int)hl);
  { std::lock_guard<std::mutex> lk(gTabMu); gTabs[(int)argd(env, a[0])] = T; }
  return boolv(env, true);
}
static napi_value Stats(napi_env env, napi_callback_info info) {
  napi_value o; napi_create_object(env, &o);
  auto set = [&](const char* k, double v) { napi_set_named_property(env, o, k, num(env, v)); };
  set("caps", 204);   // (204) what this engine can play: 204 = the sync oscillator (wave 7)
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
    { "eng_table", nullptr, TableN, nullptr, nullptr, nullptr, napi_default, nullptr },
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
