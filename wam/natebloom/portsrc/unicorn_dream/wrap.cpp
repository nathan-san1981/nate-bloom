// Unicorn Dream (build 211). The same three layers as your original (a detuned rainbow pad, music-box chimes an
// octave up, magic-dust bells sprinkled on a 1/16 grid), on better parts:
//  - the pad's filter is the Juno's IR3109 ladder from Ultramaster KR-106 (Karl LaRocca, GPL-3), with a soft filter
//    envelope, instead of a one-pole lowpass;
//  - the Juno-60's MN3009 bucket-brigade chorus from KR-106 (modes I, II, I+II) widens the pad;
//  - the Cloud Reverb is Airwindows Galactic3 (Chris Johnson, MIT) instead of a small Freeverb;
//  - Shimmer sends an octave-up copy of the reverb back into it, for the rising sparkle of a shimmer reverb;
//  - the chimes get a second, inharmonic partial so they ring like a music-box tine.
// Old projects load: the first nine controls are the original ones, in the same order.
#include "../nbrs.h"
#include <stdlib.h>
#include "KR106VCF.h"
#include "KR106Chorus.h"
#include "galactic3.h"
using kr106::VCF; using kr106::Chorus;

static const int MAX_VOICES = 16, MAX_BELLS = 24;
static const int PENTA[5] = {0, 2, 4, 7, 9};
enum { PAD, CHIME, SPARKLE, BRIGHT, RAINBOW, SPACE, ATTACK, RELEASE, VOLUME, CHORUS, SHIMMER, NPARAM };
static float P[NPARAM] = {0.6f, 0.5f, 0.5f, 0.6f, 0.6f, 0.45f, 0.35f, 1.5f, 0.8f, 2.0f, 0.3f};
static inline void pan_gains(float pan, float &a_, float &b_) { float a = (clampf(pan, -1.0f, 1.0f) + 1.0f) * FRAC_PI_4; a_ = cosf(a); b_ = sinf(a); }

struct Voice {
  bool active = false, releasing = false; uint8_t note = 0; float freq = 0, vel = 0; float phases[3] = {0, 0, 0};
  float env = 0, fenv = 0, frq = 0.1f, side[2] = {0, 0}; uint64_t age = 0; VCF vcf;
};
struct Bell { bool active = false; float freq = 0, car = 0, modp = 0, car2 = 0, env = 0, amp = 0, pan = 0; uint32_t age = 0; };

// octave-up pitch shifter: two crossfaded read heads gliding through a short delay at double speed
struct Octaver {
  static const int LEN = 4096; float buf[LEN] = {}; int w = 0; float ph = 0;
  float process(float x, float win) {
    buf[w] = x; w = (w + 1) & (LEN - 1);
    ph += 1.0f / win; if (ph >= 1.0f) ph -= 1.0f;   // each head sweeps the window, reading at 2x
    float out = 0;
    for (int h = 0; h < 2; h++) {
      float p = ph + 0.5f * h; if (p >= 1.0f) p -= 1.0f;
      float d = (1.0f - p) * win + 2.0f, pos = (float)w - d; while (pos < 0) pos += LEN;
      int i0 = (int)pos; float fr = pos - i0; float s = buf[i0 & (LEN - 1)] * (1 - fr) + buf[(i0 + 1) & (LEN - 1)] * fr;
      out += s * sinf(PI * p);   // Hann-ish window: heads fade at the wrap
    }
    return out * 0.7f;
  }
  void clear() { for (auto &b : buf) b = 0; }
};

struct Unicorn {
  float sr = 44100.0f; Voice voices[MAX_VOICES]; Bell bells[MAX_BELLS]; uint32_t rng = 0x2468ACE1u; uint64_t age_counter = 0; float sparkle_count = 0, lfo = 0; uint32_t ctl = 0;
  Chorus chorus; Galactic verb; Octaver octL, octR; float shL = 0, shR = 0, shLP[2] = {0, 0}; int chorusMode = -1;
  float inL[512], inR[512], wL[512], wR[512], shBufL[512] = {}, shBufR[512] = {};
  float rand() { uint32_t x = rng; x ^= x << 13; x ^= x >> 17; x ^= x << 5; rng = x; return (float)(x >> 8) / (float)(1u << 24); }
  void init(float s) {
    sr = s; sr_ = s; verb.init(); chorus.Init(s);
    for (auto &v : voices) { v.vcf.SetSampleRate(s); v.vcf.SetOversample(2); }
  }
  void note_on(uint8_t note, float vel, float chime) {
    age_counter += 1;
    int idx = -1; for (int i = 0; i < MAX_VOICES; i++) if (!voices[i].active) { idx = i; break; }
    if (idx < 0) { idx = 0; for (int i = 1; i < MAX_VOICES; i++) if (voices[i].age < voices[idx].age) idx = i; }
    Voice &v = voices[idx]; bool reuse = v.active;
    v.active = true; v.releasing = false; v.note = note; v.freq = midi_to_freq((float)note); v.vel = vel; v.age = age_counter;
    if (!reuse) { v.env = 0; v.fenv = 0; for (int k = 0; k < 3; k++) v.phases[k] = rand(); v.vcf.Reset(); v.side[0] = v.side[1] = 0; }
    if (chime > 0.0f) { float pan = rand() * 1.2f - 0.6f; trigger_bell((int)note + 12, vel * chime, pan); }
  }
  void note_off(uint8_t note) { for (auto &v : voices) if (v.active && v.note == note) v.releasing = true; }
  void trigger_bell(int note, float amp, float pan) {
    note = note < 24 ? 24 : note > 108 ? 108 : note;
    int idx = -1; for (int i = 0; i < MAX_BELLS; i++) if (!bells[i].active) { idx = i; break; }
    if (idx < 0) { idx = 0; for (int i = 1; i < MAX_BELLS; i++) if (bells[i].env < bells[idx].env) idx = i; }
    Bell &b = bells[idx]; b.active = true; b.freq = midi_to_freq((float)note); b.car = 0; b.modp = 0; b.car2 = 0; b.env = 1.0f; b.amp = amp; b.pan = pan; b.age = 0;
  }
  void sparkle(float amount) {
    uint8_t held[MAX_VOICES]; int n = 0;
    for (auto &v : voices) if (v.active && !v.releasing) held[n++] = v.note;
    if (n == 0 || rand() >= amount) return;
    int base = held[(size_t)(rand() * (float)n) % n];
    int step = PENTA[(size_t)(rand() * 5.0f) % 5];
    int octave = 1 + (int)(rand() * 3.0f) % 3;
    float amp = 0.25f + rand() * 0.35f, pan = rand() * 2.0f - 1.0f;
    trigger_bell(base + step + 12 * octave, amp, pan);
  }
  void process(float *L, float *R, int n) {
    int cm = (int)clampf(P[CHORUS] + 0.5f, 0, 3); if (cm != chorusMode) { chorus.SetMode(cm); chorusMode = cm; }
    float tempo = (float)TEMPO;
    float pad_level = P[PAD], sp = P[SPARKLE], brightness = P[BRIGHT], rainbow = P[RAINBOW], space = P[SPACE], attack = P[ATTACK], release = P[RELEASE], volume = P[VOLUME], shimmer = P[SHIMMER];
    float atk_step = 1.0f / maxf(attack * sr, 1.0f);
    float rel_coef = expf(-6.9f / maxf(release * sr, 1.0f));
    float fenv_up = 1.0f - expf(-1.0f / maxf((attack * 0.8f + 0.05f) * sr, 1.0f)), fenv_down = 1.0f - expf(-1.0f / (2.5f * sr));
    float bell_coef = expf(-6.9f / (1.8f * sr)), bell2_coef = expf(-6.9f / (0.5f * sr));
    float step_samples = sr * 60.0f / maxf(tempo, 20.0f) / 4.0f;
    float attack_samples = 0.002f * sr;
    float nyq = sr * 0.5f;
    for (int i = 0; i < n; i++) {
      ctl++;
      sparkle_count -= 1.0f;
      if (sparkle_count <= 0.0f) { sparkle_count += step_samples; sparkle(sp); }
      lfo = fract(lfo + 0.25f / sr);
      float wobble = sinf(lfo * TAU), cents = rainbow * (14.0f + 6.0f * wobble);
      float detune[3] = {powf(2.0f, -cents / 1200.0f), 1.0f, powf(2.0f, cents / 1200.0f)};
      float padL = 0, padR = 0;
      for (auto &v : voices) {
        if (!v.active) continue;
        if (v.releasing) { v.env *= rel_coef; if (v.env < 1e-4f) { v.active = false; continue; } }
        else if (v.env < 1.0f) v.env = minf(v.env + atk_step, 1.0f);
        // filter envelope: opens with the attack, settles to 60% (a slow bloom, then the steady pad)
        float target = v.releasing ? 0.0f : (v.env < 1.0f ? 1.0f : 0.6f);
        v.fenv += (target - v.fenv) * (target > v.fenv ? fenv_up : fenv_down);
        float amp = v.env * (0.4f + 0.6f * v.vel) * pad_level * 0.16f;
        float sL = 0, sR = 0, gl[3], gr[3]; pan_gains(-rainbow, gl[0], gr[0]); pan_gains(0, gl[1], gr[1]); pan_gains(rainbow, gl[2], gr[2]);
        for (int k = 0; k < 3; k++) {
          float dt = v.freq * detune[k] / sr, ph = v.phases[k];
          float saw = 2.0f * ph - 1.0f - poly_blep(ph, dt);
          v.phases[k] = fract(ph + dt);
          sL += saw * gl[k]; sR += saw * gr[k];
        }
        // cutoff (at control rate): Brightness 300 Hz → 12 kHz, plus the envelope and a little key tracking
        if ((ctl & 31) == 0) { float fc = 300.0f * powf(40.0f, clampf(brightness * (0.75f + 0.35f * v.fenv), 0, 1)) * powf(v.freq / 261.6f, 0.3f); v.frq = clampf(fc / nyq, 0.001f, 0.9f); }
        // the IR3109 ladder on the middle; the rainbow's sides through a plain two-pole at the same cutoff
        float mid = v.vcf.Process((sL + sR) * 0.25f, v.frq, 0.18f), g = minf(v.frq * 1.4f, 0.95f);
        v.side[0] += g * ((sL - sR) * 0.25f - v.side[0]); v.side[1] += g * (v.side[0] - v.side[1]);
        padL += (mid + v.side[1]) * amp * 2.0f; padR += (mid - v.side[1]) * amp * 2.0f;
      }
      // the Juno chorus on the pad (mono in, stereo out: fold the rainbow spread in, then out again)
      float cl = padL, cr = padR;
      if (cm > 0) { float a, b; chorus.Process((padL + padR) * 0.5f, a, b); cl = a + (padL - padR) * 0.5f; cr = b - (padL - padR) * 0.5f; }
      float l = cl, r = cr;
      for (auto &b : bells) {
        if (!b.active) continue;
        float index = 1.8f * b.env * b.env, m = sinf(b.modp * TAU), s = sinf(b.car * TAU + index * m);
        float tine = sinf(b.car2 * TAU) * b.env * b.env * 0.35f;   // the tine's inharmonic partial, short
        float att = minf((float)b.age / attack_samples, 1.0f);
        float out = (s * b.env + tine) * b.amp * att * 0.22f;
        b.car = fract(b.car + b.freq / sr); b.modp = fract(b.modp + b.freq * 4.0f / sr); b.car2 = fract(b.car2 + b.freq * 5.4f / sr);
        b.env *= bell_coef; b.age += 1;
        if (b.env < 1e-4f) b.active = false;
        float gl, gr; pan_gains(b.pan, gl, gr); l += out * gl; r += out * gr;
      }
      // Galactic's input: the dry sound plus the shimmer (an octave up of the reverb's previous block, darkened)
      inL[i] = l + shBufL[i] * shimmer * 0.32f; inR[i] = r + shBufR[i] * shimmer * 0.32f;
      wL[i] = l; wR[i] = r;
    }
    float oL[512], oR[512];
    verb.process(inL, inR, oL, oR, n, 0.5f, 0.55f, 0.35f, 1.0f, 1.0f, 1.0f);
    float dry = 1.0f - 0.4f * space;
    for (int i = 0; i < n; i++) {
      float o1 = octL.process(oL[i], 2048.0f), o2 = octR.process(oR[i], 2048.0f);
      shLP[0] += 0.25f * (o1 - shLP[0]); shLP[1] += 0.25f * (o2 - shLP[1]);
      shBufL[i] = tanhf(shLP[0]); shBufR[i] = tanhf(shLP[1]);   // (soft-limited: the loop can't run away)
      L[i] = tanhf((wL[i] * dry + oL[i] * space * 1.1f) * volume * 0.75f);
      R[i] = tanhf((wR[i] * dry + oR[i] * space * 1.1f) * volume * 0.75f);
    }
  }
};
static Unicorn S;
extern "C" {
EXPORT("nb_init") void nb_init(float sr) { S.init(sr); }
EXPORT("nb_params") float *nb_params() { return P; }
EXPORT("nb_count") int nb_count() { return NPARAM; }
EXPORT("nb_reset") void nb_reset() { for (auto &v : S.voices) { v.active = false; v.env = 0; } for (auto &b : S.bells) b = Bell(); S.verb.init(); S.chorus.Clear(); S.octL.clear(); S.octR.clear(); for (int i = 0; i < 512; i++) S.shBufL[i] = S.shBufR[i] = 0; S.sparkle_count = 0; }
EXPORT("nb_midi") void nb_midi(int st, int d1, int d2) {
  int c = st & 0xF0;
  if (c == 0x90 && d2 > 0) S.note_on((uint8_t)d1, d2 / 127.0f, P[CHIME]); else if (c == 0x80 || c == 0x90) S.note_off((uint8_t)d1);
  else if (c == 0xB0 && (d1 == 120 || d1 == 123)) for (auto &v : S.voices) if (v.active) v.releasing = true;
}
EXPORT("nb_render") void nb_render(int n) { S.process(OUT_L, OUT_R, n); }
}
