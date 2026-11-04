// Cloud (build 215): Mutable Instruments Clouds' granular engine (Émilie Gillet, MIT), running at its own 32 kHz with
// its 118 KB recording buffer, grain scheduler, window shapes, diffuser, feedback and reverb, resampled to and from the
// host's rate by a windowed-sinc converter. The controls are the old Cloud's (so projects load), plus Reverb and Freeze.
#define TEST 1
#include "clouds/dsp/granular_processor.h"
#include <math.h>
#include <stdint.h>
using namespace clouds;
#define EXPORT(n) __attribute__((export_name(n)))
enum { GRAIN, DENSITY, PITCH, SCATTER, FEEDBACK, SPREAD, MIX, REVERB, FREEZE, NPARAMS };
static float P[NPARAMS] = {140, 70, 4, 45, 35, 80, 40, 20, 0};
static float IL[512], IR[512], OL[512], OR_[512];
static GranularProcessor G;
static uint8_t block_mem[118784];
static uint8_t block_ccm[65536 - 128];
static double SR = 48000;

// ---- a windowed-sinc resampler (any ratio): 32 taps, 256 phases, Blackman window ----
static const int TAPS = 32, PH = 256, RL = 64;
struct Res {
  float tab[PH + 1][TAPS]; float hl[RL] = {}, hr[RL] = {}; long long nIn = 0; double t = 0, step = 1;
  void init(double stp, double cut) {   // stp: input samples per output sample; cut: fraction of the input's Nyquist kept
    step = stp; t = TAPS; nIn = 0;
    for (int p = 0; p <= PH; p++) { double f = (double)p / PH; for (int k = 0; k < TAPS; k++) {
      double x = f + TAPS / 2 - 1 - k, u = (x + TAPS / 2) / TAPS, w = u <= 0 || u >= 1 ? 0 : 0.42 - 0.5 * cos(2 * M_PI * u) + 0.08 * cos(4 * M_PI * u);
      double sv = fabs(x) < 1e-9 ? 1.0 : sin(M_PI * x * cut) / (M_PI * x * cut); tab[p][k] = (float)(sv * w * cut); } }
  }
  void push(float l, float r) { hl[nIn % RL] = l; hr[nIn % RL] = r; nIn++; }
  bool ready() const { return t + TAPS / 2 <= (double)(nIn - 1); }
  void read(float &l, float &r) {
    long long fl = (long long)floor(t); double f = t - fl; int pi = (int)(f * PH); float a = (float)(f * PH - pi);
    float sl = 0, sr = 0; long long j0 = fl - TAPS / 2 + 1;
    for (int k = 0; k < TAPS; k++) { long long j = j0 + k; if (j < 0) continue; float c = tab[pi][k] * (1 - a) + tab[pi + 1][k] * a; sl += c * hl[j % RL]; sr += c * hr[j % RL]; }
    l = sl; r = sr; t += step;
  }
};
static Res down, up;
static ShortFrame cin[kMaxBlockSize], cout_[kMaxBlockSize];
static float fifoL[4096], fifoR[4096]; static int fw = 0, fr = 0;   // Clouds' output, at 32 kHz, waiting to be read
static int nin = 0; static uint32_t rng = 0x9E3779B9u;
static inline short toS(float x) { x = x < -1 ? -1 : x > 1 ? 1 : x; return (short)lrintf(x * 32767.0f); }

static void applyParams() {
  Parameters *p = G.mutable_parameters();
  float ms = P[GRAIN] < 20 ? 20 : P[GRAIN] > 600 ? 600 : P[GRAIN];
  float s = log2f(ms * 32.0f / 1024.0f) / 4.0f; p->size = s < 0 ? 0 : s > 1 ? 1 : s;
  p->density = 0.5f + 0.5f * (P[DENSITY] * 0.01f);
  int pm = (int)(P[PITCH] + 0.5f); static const float PT[5] = {-12, 0, 7, 12, 0};
  if (pm == 4) { rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5; p->pitch = (rng & 1) ? 12.0f : 0.0f; }   // 0 / +12: grains of both
  else p->pitch = PT[pm < 0 ? 0 : pm > 4 ? 4 : pm];
  float sc = P[SCATTER] * 0.01f;
  p->position = sc * 0.85f;
  p->texture = 0.35f + sc * 0.5f;
  p->feedback = P[FEEDBACK] * 0.0085f;   // (Clouds runs away near the top of its range; 92% here is about 0.78 there)
  p->stereo_spread = P[SPREAD] * 0.01f;
  p->dry_wet = 1.0f;   // the dry mix is done here, at the host's rate, so the dry sound isn't resampled
  p->reverb = P[REVERB] * 0.01f;
  p->freeze = P[FREEZE] > 0.5f;
  p->trigger = false; p->gate = false;
  p->granular.overlap = 0; p->granular.window_shape = p->texture; p->granular.stereo_spread = p->stereo_spread; p->granular.use_deterministic_seed = false;
}
extern "C" {
EXPORT("nb_init") void nb_init(float sr) {
  SR = sr > 1000 ? sr : 48000;
  G.Init(block_mem, sizeof(block_mem), block_ccm, sizeof(block_ccm));
  G.set_playback_mode(PLAYBACK_MODE_GRANULAR); G.set_quality(0);
  down.init(SR / 32000.0, SR > 32000 ? 32000.0 / SR * 0.92 : 0.92);
  up.init(32000.0 / SR, 0.92);
  applyParams(); G.Prepare();
}
EXPORT("nb_params") float *nb_params() { return P; }
EXPORT("nb_count") int nb_count() { return NPARAMS; }
EXPORT("nb_in") float *nb_in(int c) { return c ? IR : IL; }
EXPORT("nb_out") float *nb_out(int c) { return c ? OR_ : OL; }
EXPORT("nb_reset") void nb_reset() { nb_init((float)SR); fw = fr = 0; nin = 0; }
EXPORT("nb_midi") void nb_midi(int, int, int) {}
EXPORT("nb_render") void nb_render(int n) {
  if (n > 512) n = 512;
  for (int i = 0; i < n; i++) {
    // into Clouds: the host's samples, read out at 32 kHz
    down.push(IL[i], IR[i]);
    while (down.ready()) {
      float l, r; down.read(l, r); cin[nin].l = toS(l); cin[nin].r = toS(r);
      if (++nin == (int)kMaxBlockSize) {
        applyParams(); G.Process(cin, cout_, kMaxBlockSize); G.Prepare(); nin = 0;
        for (size_t k = 0; k < kMaxBlockSize; k++) { fifoL[fw] = cout_[k].l / 32768.0f; fifoR[fw] = cout_[k].r / 32768.0f; fw = (fw + 1) & 4095; }
      }
    }
    // out of Clouds: its 32 kHz samples, read out at the host's rate
    while (!up.ready() && ((fw - fr) & 4095) > 0) { up.push(fifoL[fr], fifoR[fr]); fr = (fr + 1) & 4095; }
    float wl = 0, wr = 0; if (up.ready()) up.read(wl, wr);
    float m = P[MIX] * 0.01f;
    OL[i] = IL[i] * (1 - m) + wl * m; OR_[i] = IR[i] * (1 - m) + wr * m;
  }
}
}
