// Ensemble (build 229): two ensembles in one.
//  String machine: the three-voice string-ensemble chorus of a Solina or an ARP Omni: three delay lines swept by a
//    slow and a fast LFO 120 degrees apart, as the old Faust version, now with Hermite interpolation, each voice
//    placed in the stereo field and a bucket-brigade's high cut.
//  Airwindows: Airwindows Ensemble (Chris Johnson, MIT): up to 48 taps on a double-length buffer, each on its own
//    sine at its own speed, with its "air" stage putting back the highs the interpolation loses. A second copy with
//    its sweeps a half-turn on makes the right side, and Width blends it in.
// Depth, Speed, Width and Mix are the old controls (projects load), Type is new.
#include "nbrs.h"
#include "aw_Ensemble.h"
enum { DEPTH, SPEED, WIDTH, MIX, TYPE, NPARAM };
static float P[NPARAM] = {70, 50, 90, 55, 0};
static float sr = 48000;
static AW_Ensemble *A1 = nullptr, *A2 = nullptr;
static const float AWG[11] = {0.863f, 0.769f, 0.752f, 0.778f, 0.824f, 0.914f, 1.062f, 1.352f, 1.644f, 1.888f, 2.0f};   // (Airwindows' level by Depth: its taps sum louder when they're few)
static float wl[512], wr[512], bl[512], br[512];
// ---- the string machine ----
static const int DN = 8192;
static float dline[DN]; static int dw = 0;
static double ph1 = 0, ph2 = 0;
static float lpL = 0, lpR = 0, sDepth = 0.7f, sSpeed = 0.5f, sWidth = 0.9f, sMix = 0.55f, sType = 0;
static inline float tapAt(float d) {   // d in samples behind the write head, 4-point Hermite
  float pos = (float)dw - d; while (pos < 0) pos += DN;
  int i = (int)pos; float f = pos - i;
  float xm = dline[(i - 1 + DN) & (DN - 1)], x0 = dline[i & (DN - 1)], x1 = dline[(i + 1) & (DN - 1)], x2 = dline[(i + 2) & (DN - 1)];
  float c1 = 0.5f * (x1 - xm), c2 = xm - 2.5f * x0 + 2.0f * x1 - 0.5f * x2, c3 = 0.5f * (x2 - xm) + 1.5f * (x0 - x1);
  return ((c3 * f + c2) * f + c1) * f + x0;
}
static void reset_all() {
  for (int i = 0; i < DN; i++) dline[i] = 0; dw = 0; ph1 = 0; ph2 = 0.37; lpL = lpR = 0;
  A1->init(sr); A2->init(sr);
  for (int i = 1; i < 49; i++) A2->sweep[i] = 3.141592653589793 / 2.0 + 3.141592653589793;   // (the right side's taps a half-turn on)
}
extern "C" {
EXPORT("nb_init") void nb_init(float s) { sr = s; A1 = new AW_Ensemble(); A2 = new AW_Ensemble(); reset_all(); }
EXPORT("nb_params") float *nb_params() { return P; }
EXPORT("nb_count") int nb_count() { return NPARAM; }
EXPORT("nb_reset") void nb_reset() { reset_all(); }
EXPORT("nb_midi") void nb_midi(int, int, int) {}
EXPORT("nb_render") void nb_render(int n) {
  const float depth = clampf(P[DEPTH], 0, 100) * 0.01f, speed = clampf(P[SPEED], 0, 100) * 0.01f, width = clampf(P[WIDTH], 0, 100) * 0.01f, mix = clampf(P[MIX], 0, 100) * 0.01f;
  const float type = P[TYPE] >= 0.5f ? 1.0f : 0.0f;
  const float k = 1.0f - expf(-1.0f / (0.02f * sr));   // (20 ms smoothing)
  if (type > 0.5f || sType > 0.001f) {
    // Airwindows: Depth = how many taps (2..48), Speed = how fast they sweep, full air
    A1->A = A2->A = 0.08f + depth * 0.92f; A1->B = speed; A2->B = clampf(speed * 0.9f + 0.06f, 0, 1);   // (the right side's taps at their own speed: wide) A1->C = A2->C = 1.0f; A1->D = A2->D = 1.0f;
    float *in[2] = {IN_L, IN_R}, *o1[2] = {wl, wr}, *o2[2] = {bl, br};
    A1->processReplacing(in, o1, n); A2->processReplacing(in, o2, n);
  }
  const double r1 = (0.35 + speed * 0.9) / sr, r2 = (4.2 + speed * 4.0) / sr;
  float awg; { const float x = depth * 10.0f; const int i0 = (int)minf(x, 9.0f); awg = AWG[i0] + (AWG[i0 + 1] - AWG[i0]) * (x - i0); }
  const float lpc = 1.0f - expf(-TAU * 9000.0f / sr);
  for (int i = 0; i < n; i++) {
    sDepth += (depth - sDepth) * k; sWidth += (width - sWidth) * k; sMix += (mix - sMix) * k; sType += (type - sType) * k;
    const float l = IN_L[i], r = IN_R[i];
    // string machine
    dline[dw] = (l + r) * 0.5f;
    float v[3];
    for (int j = 0; j < 3; j++) {
      const float o = (float)j * TAU / 3.0f;
      const float ms = 0.0065f + sDepth * (0.0026f * sinf((float)(ph1 * TAU) + o) + 0.00045f * sinf((float)(ph2 * TAU) + o + 1.0f));
      v[j] = tapAt(ms * sr);
    }
    dw = (dw + 1) & (DN - 1);
    ph1 += r1; if (ph1 >= 1) ph1 -= 1; ph2 += r2; if (ph2 >= 1) ph2 -= 1;
    float sl = (v[0] + v[1] * 0.6f + v[2] * (1 - sWidth)) * 0.62f, srr = (v[2] + v[1] * 0.6f + v[0] * (1 - sWidth)) * 0.62f;
    lpL += (sl - lpL) * lpc; lpR += (srr - lpR) * lpc; sl = lpL; srr = lpR;
    // Airwindows, its right side widened by the second copy
    float al = 0, ar = 0;
    if (sType > 0.001f) { al = wl[i]; ar = wr[i] * (1 - sWidth) + br[i] * sWidth; }
    const float wL = sl * 1.3f * (1 - sType) + al * awg * sType, wR = srr * 1.3f * (1 - sType) + ar * awg * sType;   // (its taps sum at about half the input)
    OUT_L[i] = l * (1 - sMix) + wL * sMix;
    OUT_R[i] = r * (1 - sMix) + wR * sMix;
  }
}
}
