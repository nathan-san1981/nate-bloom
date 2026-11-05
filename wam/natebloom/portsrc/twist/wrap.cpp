// Twist: Mutable Instruments' Plaits macro oscillator (Émilie Gillet, MIT) as a polyphonic Nate Bloom instrument.
// Eight Plaits voices, each with its own 16 KB of engine RAM, a level envelope (attack, hold while the key is held,
// release) feeding Plaits' own low-pass gate (its Decay and Colour knobs), a trigger on every note-on (the engines
// that ring on their own — strings, bells, drums — use it), rendered at Plaits' 48 kHz and resampled to the host.
// (229) a whole synth: after each voice a resonant low-pass (a zero-delay-feedback state-variable filter, soft-driven)
// with its own attack-decay envelope, key tracking and velocity; one LFO (five waves) for pitch, Timbre, Morph and the
// cutoff; then the Juno-60's bucket-brigade chorus from KR-106 (I, II, I+II) and Airwindows Galactic3 (MIT) as the
// reverb. With Cutoff open and the rest at 0 it is the Twist it was.
#define TEST 1
#include "plaits/dsp/voice.h"
#include "stmlib/utils/buffer_allocator.h"
#include <math.h>
#include <string.h>
#include "KR106Chorus.h"
#include "galactic3.h"

using namespace plaits;

enum { P_MODEL, P_HARM, P_TIMBRE, P_MORPH, P_DECAY, P_COLOUR, P_ATTACK, P_RELEASE, P_SPREAD, P_LEVEL, P_FM, P_TMOD, P_MMOD,
  P_CUT, P_RES, P_FENV, P_FDEC, P_KEY, P_LRATE, P_LSHAPE, P_LPIT, P_LTIM, P_LMOR, P_LCUT, P_CHORUS, P_VERB, P_VSIZE, P_FVEL, NPARAMS };
static float P[NPARAMS];
static const float DEF[NPARAMS] = { 8, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.0f, 0.5f, 0.3f, 0.8f, 0, 0, 0,
  1.0f, 0.0f, 0.0f, 0.4f, 0.5f, 0.4f, 0, 0, 0, 0, 0, 0, 0, 0.5f, 0.0f };

static const int NV = 8, RB = 8192;
struct TV {
  Voice voice; char ram[16384]; stmlib::BufferAllocator alloc;
  int note; float vel; bool held; int stage;   // 0 free, 1 attack, 2 hold, 3 release
  float env, rg; unsigned age; int trig; float peak; int quiet;   // env drives Plaits' low-pass gate; rg is the Release, a plain fade after the key
  Voice::Frame frames[kBlockSize];
  float fe; int fstage; float ic1, ic2;   // (229) the filter's envelope (1 attack, 2 decay) and its two integrators
};
static TV V[NV];
static unsigned clock_ = 0;
static float hsr_ = 48000, ratio_ = 1, pos_ = 0;
static kr106::Chorus chorus_; static Galactic verb_; static int chorusMode_ = -1;
static float lfoPh_ = 0, lfoVal_ = 0, lfoSH_ = 0; static uint32_t rng_ = 0x9E3779B9u;
static float vinL[512], vinR[512], voL[512], voR[512];
static float mixL[RB], mixR[RB]; static int wr_ = 0, rd_ = 0;   // the 48 kHz mix, a ring; rd_ + pos_ reads behind wr_
static inline int wrAhead() { return (wr_ - rd_) & (RB - 1); }
static inline float herm(float a, float b, float c, float d, float t) {   // 4-point Hermite between b and c
  const float c1 = 0.5f * (c - a), c2 = a - 2.5f * b + 2.0f * c - 0.5f * d, c3 = 0.5f * (d - a) + 1.5f * (b - c);
  return ((c3 * t + c2) * t + c1) * t + b;
}
static float OL[512], ORr[512];
static float bend_ = 0, susLvl_ = 0; static bool sus_ = false;
static int panIdx_ = 0;

static float expMap(float v, float lo, float hi) { return lo * powf(hi / lo, v); }
// the models don't come out at one level (the string and the VCF model are quiet, the swarm and the bells loud): evened out here
static const float MODEL_GAIN[24] = { 1.6f, 1, 1, 1, 1.3f, 1, 1.6f, 1, 1, 1, 1, 1, 1, 1, 0.9f, 1, 0.7f, 0.7f, 0.65f, 3.0f, 0.65f, 1.6f, 0.75f, 1 };

static void voiceInit(TV &v) {
  v.alloc.Init(v.ram, sizeof(v.ram)); v.voice.Init(&v.alloc);
  v.note = -1; v.vel = 0; v.held = false; v.stage = 0; v.env = 0; v.rg = 1; v.age = 0; v.trig = 0; v.peak = 0; v.quiet = 0;
  v.fe = 0; v.fstage = 0; v.ic1 = v.ic2 = 0;
}

#define EXPORT(n) __attribute__((export_name(n)))
extern "C" {
EXPORT("nb_init") void nb_init(float sr) {
  for (int i = 0; i < NPARAMS; i++) P[i] = DEF[i];
  hsr_ = sr > 1000 ? sr : 48000; ratio_ = kSampleRate / hsr_; sr_ = hsr_; chorus_.Init(hsr_); verb_.init(); chorusMode_ = -1; lfoPh_ = 0; pos_ = 0; wr_ = 0; rd_ = 0; memset(mixL, 0, sizeof(mixL)); memset(mixR, 0, sizeof(mixR));
  for (int i = 0; i < NV; i++) voiceInit(V[i]);
  panIdx_ = 0; bend_ = 0; sus_ = false;
}
EXPORT("nb_params") float *nb_params() { return P; }
EXPORT("nb_count") int nb_count() { return NPARAMS; }
EXPORT("nb_out") float *nb_out(int c) { return c ? ORr : OL; }
EXPORT("nb_reset") void nb_reset() { for (int i = 0; i < NV; i++) { V[i].stage = 0; V[i].held = false; V[i].env = 0; V[i].note = -1; V[i].ic1 = V[i].ic2 = 0; V[i].fe = 0; } sus_ = false; chorus_.Clear(); verb_.init(); }
EXPORT("nb_active") int nb_active() { int n = 0; for (int i = 0; i < NV; i++) if (V[i].stage) n++; return n; }

static void noteOn(int n, float vel) {
  // the same note again retriggers its voice; else a free voice; else the oldest released; else the oldest
  int pick = -1;
  for (int i = 0; i < NV; i++) if (V[i].stage && V[i].note == n) { pick = i; break; }
  if (pick < 0) for (int i = 0; i < NV; i++) if (!V[i].stage) { pick = i; break; }
  if (pick < 0) { unsigned best = 0xffffffffu; for (int i = 0; i < NV; i++) if (V[i].stage == 3 && V[i].age < best) { best = V[i].age; pick = i; } }
  if (pick < 0) { unsigned best = 0xffffffffu; for (int i = 0; i < NV; i++) if (V[i].age < best) { best = V[i].age; pick = i; } }
  TV &v = V[pick];
  v.trig = (v.stage && v.note == n) ? 1 : 0;   // the same note again: one block low first, so the engines see a fresh rising edge
  v.note = n; v.vel = vel; v.held = true; v.stage = 1; v.age = ++clock_; v.peak = 1; v.quiet = 0; v.rg = 1;
  if (v.env < 0.001f) v.env = 0.001f;
  v.fstage = 1;   // the filter envelope starts again from where it is
}
static void noteOff(int n) {
  for (int i = 0; i < NV; i++) if (V[i].stage && V[i].note == n && V[i].held) { V[i].held = false; if (!sus_) V[i].stage = 3; }
}
EXPORT("nb_midi") void nb_midi(int st, int d1, int d2) {
  switch (st & 0xF0) {
  case 0x90: if (d2) noteOn(d1, d2 / 127.0f); else noteOff(d1); break;
  case 0x80: noteOff(d1); break;
  case 0xE0: bend_ = (((d2 << 7) | d1) - 8192) / 8192.0f * 2.0f; break;
  case 0xB0:
    if (d1 == 64) { bool on = d2 >= 64; if (sus_ && !on) { for (int i = 0; i < NV; i++) if (V[i].stage && !V[i].held) V[i].stage = 3; } sus_ = on; }
    else if (d1 == 120 || d1 == 123) { for (int i = 0; i < NV; i++) if (V[i].stage) { V[i].stage = 3; V[i].held = false; } }
    break;
  }
}

// one Plaits block (12 frames at 48 kHz) of every voice into the ring
static void renderBlock() {
  float L[kBlockSize], R[kBlockSize]; for (int i = 0; i < (int)kBlockSize; i++) L[i] = R[i] = 0;
  const float blk = kBlockSize / kSampleRate;   // seconds per block
  const float aUp = blk / expMap(P[P_ATTACK], 0.002f, 2.0f), rDn = blk / expMap(P[P_RELEASE], 0.01f, 6.0f);
  int eng0 = (int)(P[P_MODEL] + 0.5f); if (eng0 < 0) eng0 = 0; if (eng0 > 23) eng0 = 23;
  const float spread = P[P_SPREAD], lvl = P[P_LEVEL] * 0.3f * MODEL_GAIN[eng0];   // (a note peaks about where Duet 80 does)
  Patch patch; Modulations mod;
  patch.harmonics = P[P_HARM]; patch.timbre = P[P_TIMBRE]; patch.morph = P[P_MORPH];
  patch.frequency_modulation_amount = P[P_FM]; patch.timbre_modulation_amount = P[P_TMOD]; patch.morph_modulation_amount = P[P_MMOD];
  int eng = (int)(P[P_MODEL] + 0.5f); if (eng < 0) eng = 0; if (eng > 23) eng = 23;
  patch.engine = eng; patch.decay = P[P_DECAY]; patch.lpg_colour = P[P_COLOUR];
  mod.engine = 0; mod.frequency = 0; mod.harmonics = 0; mod.timbre = 0; mod.morph = 0;
  mod.frequency_patched = false; mod.timbre_patched = false; mod.morph_patched = false; mod.trigger_patched = true; mod.level_patched = true;
  // the LFO, once a block
  { const float hz = expMap(P[P_LRATE], 0.05f, 20.0f); lfoPh_ += hz * blk; bool wrap = false; if (lfoPh_ >= 1) { lfoPh_ -= floorf(lfoPh_); wrap = true; }
    const int sh = (int)(P[P_LSHAPE] + 0.5f);
    if (wrap) { rng_ ^= rng_ << 13; rng_ ^= rng_ >> 17; rng_ ^= rng_ << 5; lfoSH_ = (rng_ >> 8) / 8388608.0f - 1.0f; }
    lfoVal_ = sh == 1 ? 1.0f - 4.0f * fabsf(lfoPh_ - 0.5f) : sh == 2 ? 1.0f - 2.0f * lfoPh_ : sh == 3 ? (lfoPh_ < 0.5f ? 1.0f : -1.0f) : sh == 4 ? lfoSH_ : sinf(6.2831853f * lfoPh_); }
  const float lPit = P[P_LPIT] * P[P_LPIT] * 12.0f * lfoVal_, lTim = P[P_LTIM] * 0.5f * lfoVal_, lMor = P[P_LMOR] * 0.5f * lfoVal_;
  const bool filt = P[P_CUT] < 0.999f || fabsf(P[P_FENV]) > 0.001f || P[P_LCUT] > 0.001f || P[P_RES] > 0.001f;
  const float fDn = blk / expMap(P[P_FDEC], 0.01f, 4.0f);
  const float k = 2.0f - 1.9f * P[P_RES];   // (0.1 at full Resonance: it rings and whistles; the band state saturates, so it can't run away)
  const float baseT = P[P_TIMBRE], baseM = P[P_MORPH];
  for (int vi = 0; vi < NV; vi++) {
    TV &v = V[vi]; if (!v.stage) continue;
    patch.timbre = fminf(1.0f, fmaxf(0.0f, baseT + lTim)); patch.morph = fminf(1.0f, fmaxf(0.0f, baseM + lMor));
    // the level envelope
    if (v.stage == 1) { v.env += aUp * (v.vel + 0.05f); if (v.env >= v.vel) { v.env = v.vel; v.stage = 2; } }
    else if (v.stage == 3) { v.env -= rDn * (v.env + 0.02f); if (v.env <= 0.0005f) v.env = 0; v.rg -= rDn * (v.rg + 0.02f); if (v.rg < 0) v.rg = 0; }
    patch.note = (float)v.note + bend_ + lPit;
    // the trigger stays high while the key is held (the 6-op FM voices gate on it; the others take the edge), low after
    mod.note = 0; mod.trigger = (v.trig > 0) ? 0.0f : ((v.held || (sus_ && v.stage != 3)) ? 1.0f : 0.0f); if (v.trig > 0) v.trig--;
    mod.level = v.env;
    v.voice.Render(patch, mod, v.frames, kBlockSize);
    const float pan = spread * (((vi + panIdx_) & 1) ? 0.5f : -0.5f) * (0.6f + 0.4f * ((vi >> 1) & 1));
    const float gl = (1.0f - pan) * 0.5f + 0.5f, gr = (1.0f + pan) * 0.5f + 0.5f;
    float pk = 0;
    // the filter: its envelope (attack as the level's, then Filter Decay down to 0), its cutoff for this block
    float g = 0, a1 = 0, a2 = 0, a3 = 0;
    if (filt) {
      if (v.fstage == 1) { v.fe += aUp * 1.05f; if (v.fe >= 1) { v.fe = 1; v.fstage = 2; } }
      else if (v.fstage == 2) { v.fe -= fDn * (v.fe + 0.01f); if (v.fe <= 0) { v.fe = 0; v.fstage = 0; } }
      float c = P[P_CUT] + P[P_FENV] * v.fe * 0.6f + P[P_KEY] * ((float)v.note - 60.0f) / 120.0f + P[P_LCUT] * 0.35f * lfoVal_ + P[P_FVEL] * (v.vel - 0.7f) * 0.4f;
      c = fminf(1.0f, fmaxf(0.0f, c));
      float hz = 20.0f * powf(1000.0f, c); if (hz > 20000.0f) hz = 20000.0f;
      g = tanf(3.14159265f * fminf(hz, 0.45f * kSampleRate) / kSampleRate); a1 = 1.0f / (1.0f + g * (g + k)); a2 = g * a1; a3 = g * a2;
    }
    for (int i = 0; i < (int)kBlockSize; i++) {
      float s = v.frames[i].out * (1.0f / 32768.0f) * lvl * v.rg;
      if (filt) {   // TPT state-variable low-pass, the input softly driven
        const float x = tanhf(s * 1.4f) * 0.714f;
        const float v3 = x - v.ic2, v1 = a1 * v.ic1 + a2 * v3, v2 = v.ic2 + a2 * v.ic1 + a3 * v3;
        v.ic1 = 2.0f * v1 - v.ic1; v.ic2 = 2.0f * v2 - v.ic2; v.ic1 = 1.2f * tanhf(v.ic1 * 0.8333f); s = v2 * (1.0f - 0.35f * P[P_RES]);
      }
      L[i] += s * gl; R[i] += s * gr; const float a = s < 0 ? -s : s; if (a > pk) pk = a;
    }
    // a voice is done when its level has gone and the engine has fallen silent (the drums and strings ring on their own)
    if (v.stage == 3 && (v.rg <= 0 || (v.env <= 0 && pk < 0.0005f))) { v.quiet++; if (v.rg <= 0 || v.quiet > 400) { v.stage = 0; v.note = -1; } }   // (faded out, or 100 ms of silence after the level went)
    else if (v.stage == 3) v.quiet = 0;
  }
  for (int i = 0; i < (int)kBlockSize; i++) { mixL[wr_] = L[i]; mixR[wr_] = R[i]; wr_ = (wr_ + 1) & (RB - 1); }
}

EXPORT("nb_render") void nb_render(int n) {
  if (n > 512) n = 512;
  // make sure the ring holds enough 48 kHz frames ahead of the read position for n host frames (+ a cubic's reach)
  const float need = pos_ + n * ratio_ + 4;
  while ((float)wrAhead() < need) renderBlock();
  for (int i = 0; i < n; i++) {
    const int i0 = (int)pos_; const float f = pos_ - i0;
    const int a = (rd_ + i0 - 1) & (RB - 1), b = (rd_ + i0) & (RB - 1), c = (rd_ + i0 + 1) & (RB - 1), d = (rd_ + i0 + 2) & (RB - 1);
    OL[i] = herm(mixL[a], mixL[b], mixL[c], mixL[d], f); ORr[i] = herm(mixR[a], mixR[b], mixR[c], mixR[d], f);
    pos_ += ratio_;
  }
  const int adv = (int)pos_; rd_ = (rd_ + adv) & (RB - 1); pos_ -= adv;
  // the Juno chorus (mono in, stereo out: the voices' spread folded back around it), then Galactic
  const int cm = (int)(P[P_CHORUS] + 0.5f); if (cm != chorusMode_) { chorus_.SetMode(cm < 0 ? 0 : cm > 3 ? 3 : cm); chorusMode_ = cm; }
  if (cm > 0) for (int i = 0; i < n; i++) { float a, b; const float m = (OL[i] + ORr[i]) * 0.5f, d = (OL[i] - ORr[i]) * 0.5f; chorus_.Process(m, a, b); OL[i] = a + d; ORr[i] = b - d; }
  const float wet = P[P_VERB];
  if (wet > 0.001f) {
    for (int i = 0; i < n; i++) { vinL[i] = OL[i]; vinR[i] = ORr[i]; }
    verb_.process(vinL, vinR, voL, voR, n, 0.5f + 0.4f * P[P_VSIZE], 0.6f, 0.3f, 1.0f, P[P_VSIZE], 1.0f);
    const float dry = 1.0f - 0.35f * wet;
    for (int i = 0; i < n; i++) { OL[i] = OL[i] * dry + voL[i] * wet * 1.1f; ORr[i] = ORr[i] * dry + voR[i] * wet * 1.1f; }
  }
}
}
