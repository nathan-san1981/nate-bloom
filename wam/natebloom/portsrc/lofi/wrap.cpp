// Lo-Fi (build 214): the crush is Airwindows DeRez2 (Chris Johnson, MIT): sample-rate reduction that interpolates
// instead of aliasing harshly, and real bit reduction. Nate Bloom adds the worn-record wobble, the dust and the dark
// filter; the controls are the old Lo-Fi's, so projects load.
#include "../nbrs.h"
#include "aw_DeRez2.h"
enum { BITS, RATE, WOBBLE, DUST, TONE, MIX, NPARAM };
static float P[NPARAM] = {10, 16000, 30, 10, 6000, 100};
static AW_DeRez2 *Zp = nullptr;
static float sr = 48000; static uint32_t seed = 0x13579BDu;
#define Z (*Zp)
static const int WL = 4096; static float wbL[WL], wbR[WL]; static int ww = 0; static float wph = 0, wph2 = 0, lpL = 0, lpR = 0, lp2L = 0, lp2R = 0, dustEnv = 0;
static float tL[512], tR[512];
static inline float rnd() { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; return (float)(seed >> 8) / 8388608.0f - 1.0f; }
extern "C" {
EXPORT("nb_init") void nb_init(float s) { sr = s; Zp = new AW_DeRez2(); Z.init(s); }
EXPORT("nb_params") float *nb_params() { return P; }
EXPORT("nb_count") int nb_count() { return NPARAM; }
EXPORT("nb_reset") void nb_reset() { Z.init(sr); for (int i = 0; i < WL; i++) wbL[i] = wbR[i] = 0; lpL = lpR = lp2L = lp2R = 0; }
EXPORT("nb_midi") void nb_midi(int, int, int) {}
EXPORT("nb_render") void nb_render(int n) {
  float bits = clampf(P[BITS], 3, 16);
  Z.A = cbrtf(clampf(P[RATE] / 44100.0f, 0.001f, 1.0f));
  float step = 1.0f / powf(2.0f, bits - 1.0f); Z.B = 1.0f - cbrtf(clampf(3.0f * step, 0, 1));
  Z.C = 1.0f; Z.D = 1.0f;
  float *in[2] = {IN_L, IN_R}, *out[2] = {tL, tR};
  Z.processReplacing(in, out, n);
  float wob = clampf(P[WOBBLE], 0, 100) * 0.01f, dust = clampf(P[DUST], 0, 100) * 0.01f, mix = clampf(P[MIX], 0, 100) * 0.01f;
  float a = 1.0f - expf(-TAU * clampf(P[TONE], 300, 20000) / sr);
  for (int i = 0; i < n; i++) {
    // wobble: a record's wow (0.55 Hz) and a faster flutter, as a moving delay
    wbL[ww] = tL[i]; wbR[ww] = tR[i];
    wph = fract(wph + 0.55f / sr); wph2 = fract(wph2 + 6.3f / sr);
    float d = 2.0f + wob * (0.0045f * sr * (0.5f + 0.5f * sinf(TAU * wph)) + 0.0004f * sr * (0.5f + 0.5f * sinf(TAU * wph2)));
    float pos = (float)ww - d; while (pos < 0) pos += WL; int i0 = (int)pos; float fr = pos - i0;
    float l = wbL[i0 & (WL - 1)] * (1 - fr) + wbL[(i0 + 1) & (WL - 1)] * fr, r = wbR[i0 & (WL - 1)] * (1 - fr) + wbR[(i0 + 1) & (WL - 1)] * fr;
    ww = (ww + 1) & (WL - 1);
    // dust: sparse clicks and a little crackle
    if (rnd() > 1.0f - dust * dust * 0.0009f) dustEnv = 0.25f + 0.5f * (rnd() * 0.5f + 0.5f);
    float c = dustEnv * rnd(); dustEnv *= 0.82f; c += rnd() * dust * 0.002f;
    // the dark filter (two poles)
    lpL += a * (l + c - lpL); lp2L += a * (lpL - lp2L); lpR += a * (r + c - lpR); lp2R += a * (lpR - lp2R);
    OUT_L[i] = IN_L[i] * (1 - mix) + lp2L * mix; OUT_R[i] = IN_R[i] * (1 - mix) + lp2R * mix;
  }
}
}
