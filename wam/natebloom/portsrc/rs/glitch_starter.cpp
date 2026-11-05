// Glitch Starter, translated from the Rust (nih-plug) original, src/lib.rs
// (229) click-free: each stutter repeat crossfades (equal power) into the next instead of dipping to silence, the
// gate ramps instead of switching, every read is Hermite-interpolated, and the tape stop is a varispeed: the tape
// slows on a motor-like curve and goes dull as it slows (a low-pass that follows the speed).
#include "nbrs.h"
#include <stdlib.h>
enum { PROB, DIV, MIX, BITS, PITCH, W_STUT, W_REV, W_TAPE, W_CRUSH, W_GATE, NPARAM };
static float P[NPARAM] = {0.35f, 1, 1.0f, 6.0f, 0.25f, 1.0f, 0.6f, 0.3f, 0.5f, 0.5f};
static const double STEPS_PER_BEAT[3] = {2.0, 4.0, 8.0};   // 1/8, 1/16, 1/32
enum Mode { Dry, Stutter, Reverse, TapeStop, Crush, Gate };
static const Mode MODES[5] = {Stutter, Reverse, TapeStop, Crush, Gate};
static int note_to_mode(int note) { switch (note % 12) { case 0: return Stutter; case 2: return Reverse; case 4: return TapeStop; case 5: return Crush; case 7: return Gate; } return -1; }
struct Settings { float prob, pitch_chance, weights[5]; };
static size_t window_len_max1(size_t a) { return a < 1 ? 1 : a; }
static float window(size_t pos, size_t len, size_t fade) {
  size_t fm = fade < len / 2 ? fade : len / 2; float f = (float)window_len_max1(fm);
  float a = (float)pos / f, b = (float)(len > pos ? len - pos : 0) / f;
  return minf(minf(a, b), 1.0f);
}
struct Glitch {
  float sr = 44100.0f; float *buf[2] = {nullptr, nullptr}; size_t len = 0; size_t write = 0; uint32_t rng = 0x12345678u;
  int64_t last_step = INT64_MIN; Mode mode = Dry; int held_note = -1; Mode held_mode = Dry;
  size_t step_start = 0, step_len = 1, counter = 0, rep_len = 16; double speed = 1.0; size_t loop_period = 16; double tape_pos = 0.0;
  float hold[2] = {0, 0}; size_t hold_count = 0, crush_factor = 4; float gate_g = 1.0f, tlp[2] = {0, 0};
  float rand() { uint32_t x = rng; x ^= x << 13; x ^= x >> 17; x ^= x << 5; rng = x; return (float)(x >> 8) / (float)(1u << 24); }
  Mode pick_weighted(const float *w) {
    float total = 0; for (int i = 0; i < 5; i++) total += w[i];
    if (total <= 0.0f) return Dry;
    float r = rand() * total;
    for (int i = 0; i < 5; i++) { if (r < w[i]) return MODES[i]; r -= w[i]; }
    int i = 0; for (int k = 4; k >= 0; k--) if (w[k] > 0.0f) { i = k; break; }
    return MODES[i];
  }
  void start_step(size_t sl, int forced, const Settings &s) {
    step_len = sl < 1 ? 1 : sl; counter = 0; step_start = write; tape_pos = 0.0; hold_count = 0; tlp[0] = tlp[1] = 0;
    if (forced >= 0) mode = (Mode)forced; else if (rand() < s.prob) mode = pick_weighted(s.weights); else mode = Dry;
    static const size_t divs[3] = {2, 4, 8};
    size_t d = divs[(size_t)(rand() * 3.0f) % 3];
    rep_len = step_len / d; if (rep_len < 16) rep_len = 16;
    speed = rand() < s.pitch_chance ? (rand() < 0.5f ? 0.5 : 2.0) : 1.0;
    loop_period = (size_t)((double)rep_len / speed); if (loop_period < 16) loop_period = 16;
    crush_factor = 2 + (size_t)(rand() * 14.0f);
  }
  float read(int ch, double pos) const {
    double p = fmod(pos, (double)len); if (p < 0) p += (double)len;
    size_t i0 = (size_t)floor(p) % len; float f = (float)(p - floor(p));
    const float *b = buf[ch]; float xm = b[(i0 + len - 1) % len], x0 = b[i0], x1 = b[(i0 + 1) % len], x2 = b[(i0 + 2) % len];
    float c1 = 0.5f * (x1 - xm), c2 = xm - 2.5f * x0 + 2.0f * x1 - 0.5f * x2, c3 = 0.5f * (x2 - xm) + 1.5f * (x0 - x1);
    return ((c3 * f + c2) * f + c1) * f + x0;
  }
  double tape_speed() const { double x = (double)counter / (double)(step_len < 1 ? 1 : step_len); if (x >= 1) return 0; return pow(1.0 - x, 1.7); }   // (a motor running down: quick at first, then a long slow tail)
  void init(float rate) { sr = rate; len = (size_t)(sr * 4.0f); for (int c = 0; c < 2; c++) { buf[c] = (float *)calloc(len, sizeof(float)); } }
  void reset() { for (int c = 0; c < 2; c++) for (size_t i = 0; i < len; i++) buf[c][i] = 0; mode = Dry; held_note = -1; last_step = INT64_MIN; }
  void note(int on, int note, size_t sl, const Settings &s, size_t fade) {
    if (on) { int m = note_to_mode(note); if (m >= 0) { held_note = note; held_mode = (Mode)m; start_step(sl, m, s); } }
    else if (held_note == note) { held_note = -1; size_t e = counter + fade; if (e < step_len) step_len = e; }   // end the segment with a 2 ms fade
  }
  Settings settings() { return Settings{P[PROB], P[PITCH], {P[W_STUT], P[W_REV], P[W_TAPE], P[W_CRUSH], P[W_GATE]}}; }
  size_t stepLen() { double spb = STEPS_PER_BEAT[(int)clampf(P[DIV], 0, 2)]; double v = ((double)sr * 60.0 / TEMPO) / spb; return (size_t)(v < 1.0 ? 1.0 : v); }
  void process(const float *inL, const float *inR, float *oL, float *oR, int n) {
    if (!len) return;
    bool playing = PLAYING; double tempo = TEMPO, start_beats = SONG_BEATS;
    double spb = STEPS_PER_BEAT[(int)clampf(P[DIV], 0, 2)];
    Settings s = settings();
    float mix = P[MIX], levels = powf(2.0f, P[BITS]);
    double beats_per_sample = tempo / 60.0 / (double)sr;
    size_t sl = stepLen(), fade = (size_t)(sr * 0.004f);
    for (int i = 0; i < n; i++) {
      int forced = held_note >= 0 ? (int)held_mode : -1;
      if (playing) {
        double beat = start_beats + i * beats_per_sample; int64_t step = (int64_t)floor(beat * spb);
        if (step != last_step) { last_step = step; start_step(sl, forced, s); }
      } else {
        last_step = INT64_MIN;
        if (counter >= step_len) { if (forced >= 0) start_step(sl, forced, s); else mode = Dry; }
      }
      float in[2] = {inL[i], inR[i]}, out[2];
      buf[0][write] = in[0]; buf[1][write] = in[1];
      float env = mode == Dry ? 0.0f : window(counter, step_len, fade);
      double start = (double)step_start;
      if (mode == Gate) { size_t quarter = (counter * 4) / (step_len < 1 ? 1 : step_len); float tg = quarter % 2 == 1 ? 0.0f : 1.0f; gate_g += (tg - gate_g) * (1.0f - expf(-1.0f / (0.0015f * sr))); } else gate_g = 1.0f;
      for (int ch = 0; ch < 2; ch++) {
        float dry = in[ch], wet;
        switch (mode) {
        case Dry: wet = dry; break;
        case Stutter: {
          size_t k = counter % loop_period; double pos = start - (double)rep_len + (double)k * speed;
          size_t xf = loop_period / 4 < fade * 3 ? loop_period / 4 : fade * 3;
          if (counter >= loop_period && k < xf && xf > 0) {   // the last repeat's tail fades out as this one fades in
            float t = ((float)k + 0.5f) / (float)xf, a = sinf(t * FRAC_PI_2), b = cosf(t * FRAC_PI_2);
            wet = read(ch, pos) * a + read(ch, start - (double)rep_len + (double)(loop_period + k) * speed) * b;
          } else wet = read(ch, pos);
          break; }
        case Reverse: wet = read(ch, start - (double)counter - 1.0); break;
        case TapeStop: { float x = read(ch, start + tape_pos); if (counter == 0) tlp[ch] = x; float sp = (float)tape_speed(); float c = 1.0f - expf(-TAU * (180.0f + 15000.0f * sp * sp) / sr); tlp[ch] += (x - tlp[ch]) * c; wet = tlp[ch]; break; }
        case Crush: if (hold_count == 0) hold[ch] = roundf(dry * levels) / levels; wet = hold[ch]; break;
        case Gate: wet = dry * gate_g; break;
        default: wet = dry;
        }
        float g = env * mix; out[ch] = dry * (1.0f - g) + wet * g;
      }
      oL[i] = out[0]; oR[i] = out[1];
      if (mode == TapeStop) tape_pos += tape_speed();
      hold_count = (hold_count + 1) % (crush_factor < 1 ? 1 : crush_factor);
      counter += 1; write = (write + 1) % len;
    }
    if (playing) SONG_BEATS += n * beats_per_sample;
  }
};
static Glitch S;
extern "C" {
EXPORT("nb_init") void nb_init(float sr) { S.init(sr); }
EXPORT("nb_params") float *nb_params() { return P; }
EXPORT("nb_count") int nb_count() { return NPARAM; }
EXPORT("nb_reset") void nb_reset() { S.reset(); }
EXPORT("nb_beat") void nb_beat(double b) { SONG_BEATS = b; }
EXPORT("nb_midi") void nb_midi(int st, int d1, int d2) {
  int c = st & 0xF0; Settings s = S.settings(); size_t fade = (size_t)(S.sr * 0.002f);
  if (c == 0x90 && d2 > 0) S.note(1, d1, S.stepLen(), s, fade); else if (c == 0x80 || c == 0x90) S.note(0, d1, S.stepLen(), s, fade);
}
EXPORT("nb_render") void nb_render(int n) { S.process(IN_L, IN_R, OUT_L, OUT_R, n); }
}
