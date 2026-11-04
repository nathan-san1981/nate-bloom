// Fuzz Bass (build 211): your original's voice (saw, detuned square and sub, legato glide, a filter envelope, fuzz
// with an octave-up rectifier), on better parts:
//  - the filter is jc303's diode ladder (Will Pirkle's analysis of the TB-303-style diode ladder; midilab, GPL-3),
//    in place of four one-pole stages with a tanh: the diode ladder's asymmetric resonance and its squelch;
//  - the fuzz runs 4x oversampled (Ultramaster KR-106's polyphase half-band filters, GPL-3), so the hard clipping
//    no longer folds back as aliasing on high notes, and its curve is a two-transistor fuzz: asymmetric soft clip,
//    then a gentler second stage;
//  - Tone is a Big Muff-style tone stack (a low-pass and a high-pass blended, with the scoop in between).
// Old projects load: the controls are the original thirteen, same order and ranges.
#include "../nbrs.h"
#include "dfl_DiodeLadderFilter.h"
#include "KR106VCF.h"
using kr106::Upsampler2x; using kr106::Downsampler2x;

static const int MAX_HELD = 16;
enum { GLIDE, DETUNE, SUB, CUTOFF, RES, FENV, FDECAY, FUZZ, OCTFZ, TONE, ATTACK, RELEASE, VOLUME, NPARAM };
static float P[NPARAM] = {0.06f, 12.0f, 0.5f, 700.0f, 0.3f, 0.5f, 0.35f, 0.7f, 0.15f, 0.55f, 0.005f, 0.15f, 0.7f};

struct FuzzBass {
  float sr = 44100.0f;
  uint8_t held[MAX_HELD] = {0}; int n_held = 0;
  float freq = 110.0f, target = 110.0f; bool gate = false;
  float env = 0.0f; bool attacking = false; float fenv = 0.0f;
  float ph_saw = 0.0f, ph_sq = 0.25f, ph_sub = 0.0f;
  dfl::DiodeLadderFilter vcf; int ctl = 0;
  Upsampler2x up1, up2; Downsampler2x dn1, dn2;
  float lpT = 0, hpT = 0, hpX = 0, dc_x = 0, dc_y = 0, pre_hp = 0;
  void init(float s) {
    sr = s; vcf.setSampleRate(s); vcf.setOctaveMode(true); vcf.setInputDrive(3.0); vcf.setPassbandCompensation(0.6);
    static constexpr double c2x[12] = { 0.036681502163648017, 0.13654762463195794, 0.27463175937945444, 0.42313861743656711, 0.56109869787919531, 0.67754004997416184,
      0.76974183386322703, 0.83988962484963892, 0.89226081800387902, 0.9315419599631839, 0.96209454837808417, 0.98781637073289585 };
    up1.set_coefs(c2x); up2.set_coefs(c2x); dn1.set_coefs(c2x); dn2.set_coefs(c2x);
  }
  void remove_held(uint8_t note) {
    for (int pos = 0; pos < n_held; pos++) if (held[pos] == note) { for (int i = pos; i < n_held - 1; i++) held[i] = held[i + 1]; n_held -= 1; return; }
  }
  void note_on(uint8_t note) {
    bool legato = n_held > 0;
    remove_held(note);
    if (n_held == MAX_HELD) { for (int i = 1; i < MAX_HELD; i++) held[i - 1] = held[i]; n_held -= 1; }
    held[n_held] = note; n_held += 1;
    target = midi_to_freq((float)note);
    if (!legato) { freq = target; attacking = true; fenv = 1.0f; }
    gate = true;
  }
  void note_off(uint8_t note) {
    remove_held(note);
    if (n_held == 0) { gate = false; attacking = false; }
    else target = midi_to_freq((float)held[n_held - 1]);
  }
  void reset() { n_held = 0; gate = false; attacking = false; env = 0; fenv = 0; vcf.reset(); up1.clear_buffers(); up2.clear_buffers(); dn1.clear_buffers(); dn2.clear_buffers(); lpT = hpT = hpX = dc_x = dc_y = pre_hp = recAvg = 0; }
  // the fuzz at 4x: an asymmetric first stage (the bias), a rectifier blended in for Octave Fuzz, a softer second stage
  float recAvg = 0;
  inline float fuzzStage(float x, float drive, float oct) {
    float d = x * drive;
    // Octave Fuzz: the full-wave-rectified signal (an octave up) with its average taken off, so it stays a tone and
    // doesn't turn into DC that the clipper sits on
    float r = fabsf(d); recAvg += 0.0015f * (r - recAvg);
    float shaped = d * (1.0f - oct) + (r - recAvg) * oct * 1.5f;
    const float bias = 0.3f;
    float a = tanhf(shaped + bias) - tanhf(bias);
    float b = a * 1.8f; return b / (1.0f + fabsf(b)) * 1.3f;   // second transistor: rounder than a clamp
  }
  void process(float *L, float *R, int n) {
    float glide = P[GLIDE], detune = P[DETUNE], sub = P[SUB], cutoff = P[CUTOFF], res = P[RES], fenv_amt = P[FENV] * 5.0f, fdecay = P[FDECAY],
          fuzz = P[FUZZ], oct = P[OCTFZ], tone = P[TONE], attack = P[ATTACK], release = P[RELEASE], volume = P[VOLUME];
    float glide_coef = expf(-1.0f / maxf(glide * sr, 1.0f));
    float atk_step = 1.0f / maxf(attack * sr, 1.0f);
    float rel_coef = expf(-6.9f / maxf(release * sr, 1.0f));
    float fenv_coef = expf(-6.9f / maxf(fdecay * sr, 1.0f));
    float detune_ratio = powf(2.0f, detune / 1200.0f);
    float drive = 1.0f + fuzz * fuzz * 60.0f;
    float max_fc = 0.30f * sr;   // (the diode ladder tunes its cutoff up ~1.4x inside; this keeps that under Nyquist)
    vcf.setResonance(res * 0.97, false);
    // Muff tone stack: low-pass at 480 Hz and high-pass at 1 kHz, Tone blends them (the scoop is in the middle)
    float aL = 1.0f - expf(-TAU * 480.0f / sr), aH = 1.0f - expf(-TAU * 1000.0f / sr);
    float aPre = 1.0f - expf(-TAU * 40.0f / sr);
    float makeup = 1.0f / (0.6f + 0.4f * fuzz);
    for (int i = 0; i < n; i++) {
      freq = target + (freq - target) * glide_coef;
      if (gate) { if (attacking) { env += atk_step; if (env >= 1.0f) { env = 1.0f; attacking = false; } } }
      else { env *= rel_coef; if (env < 1e-5f) env = 0.0f; }
      fenv *= fenv_coef;
      float dt = freq / sr;
      float saw = 2.0f * ph_saw - 1.0f - poly_blep(ph_saw, dt);
      ph_saw = fract(ph_saw + dt);
      float dt2 = freq * detune_ratio / sr;
      float sq = ph_sq < 0.5f ? 1.0f : -1.0f;
      sq += poly_blep(ph_sq, dt2);
      sq -= poly_blep(fract(ph_sq + 0.5f), dt2);
      ph_sq = fract(ph_sq + dt2);
      float sub_s = sinf(ph_sub * TAU);
      ph_sub = fract(ph_sub + dt * 0.5f);
      float osc = saw * 0.5f + sq * 0.4f + sub_s * sub * 0.8f;
      if ((ctl++ & 7) == 0) vcf.setCutoff(minf(cutoff * powf(2.0f, fenv * fenv_amt), max_fc), true);
      float filtered = (float)vcf.getSample(osc * 0.6) * env;
      // 4x oversampled fuzz
      float a0, a1, b0, b1, b2, b3;
      up1.process_sample(a0, a1, filtered);
      up2.process_sample(b0, b1, a0); up2.process_sample(b2, b3, a1);
      b0 = fuzzStage(b0, drive, oct); b1 = fuzzStage(b1, drive, oct); b2 = fuzzStage(b2, drive, oct); b3 = fuzzStage(b3, drive, oct);
      float q0[2] = {b0, b1}, q1[2] = {b2, b3}; float c[2] = {dn2.process_sample(q0), dn2.process_sample(q1)};
      float fuzzed = dn1.process_sample(c);
      // tone stack
      lpT += aL * (fuzzed - lpT);
      hpX += aH * (fuzzed - hpX); float hp = fuzzed - hpX;
      float toned = lpT * (1.0f - tone) * 1.25f + hp * tone * 1.6f + fuzzed * 0.12f;
      float y = toned - dc_x + 0.995f * dc_y; dc_x = toned; dc_y = y;
      float out = clampf(y * volume * makeup * 1.1f, -1.0f, 1.0f);
      L[i] = out; R[i] = out;
    }
  }
};
static FuzzBass S;
extern "C" {
EXPORT("nb_init") void nb_init(float sr) { S.init(sr); }
EXPORT("nb_params") float *nb_params() { return P; }
EXPORT("nb_count") int nb_count() { return NPARAM; }
EXPORT("nb_reset") void nb_reset() { S.reset(); }
EXPORT("nb_midi") void nb_midi(int st, int d1, int d2) {
  int c = st & 0xF0;
  if (c == 0x90 && d2 > 0) S.note_on((uint8_t)d1); else if (c == 0x80 || c == 0x90) S.note_off((uint8_t)d1);
  else if (c == 0xB0 && (d1 == 120 || d1 == 123)) { S.n_held = 0; S.gate = false; S.attacking = false; }
}
EXPORT("nb_render") void nb_render(int n) { S.process(OUT_L, OUT_R, n); }
}
