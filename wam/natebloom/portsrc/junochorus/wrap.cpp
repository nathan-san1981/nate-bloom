// Juno Chorus (build 214): the Juno-60's MN3009 bucket-brigade chorus from Ultramaster KR-106 (Karl LaRocca, GPL-3),
// modelled from hardware measurements: the BBD's anti-alias and reconstruction filters, the triangle LFO (sine in
// I+II), compander noise, clock leakage and the clicks of the real chip. Same controls as before.
#include "../nbrs.h"
#include "KR106Chorus.h"
using kr106::Chorus;
enum { MODE, MIX, TONE, NOISE, NPARAM };
static float P[NPARAM] = {0, 50, 8000, 10};
static Chorus C; static float sr = 48000; static int curMode = -1; static float lpL = 0, lpR = 0; static uint32_t seed = 0x1234567u;
static inline float rnd() { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; return (float)(seed >> 8) / 8388608.0f - 1.0f; }
extern "C" {
EXPORT("nb_init") void nb_init(float s) { sr = s; C.Init(s); }
EXPORT("nb_params") float *nb_params() { return P; }
EXPORT("nb_count") int nb_count() { return NPARAM; }
EXPORT("nb_reset") void nb_reset() { C.Clear(); lpL = lpR = 0; }
EXPORT("nb_midi") void nb_midi(int, int, int) {}
EXPORT("nb_render") void nb_render(int n) {
  int m = (int)clampf(P[MODE] + 0.5f, 0, 2) + 1; if (m != curMode) { C.SetMode(m); curMode = m; }
  float mix = clampf(P[MIX], 0, 100) * 0.01f, a = 1.0f - expf(-TAU * clampf(P[TONE], 500, 20000) / sr), nz = P[NOISE] * 0.00002f;
  for (int i = 0; i < n; i++) {
    float dry = (IN_L[i] + IN_R[i]) * 0.5f, l, r;
    C.Process(dry + rnd() * nz, l, r);
    // the chorus outputs dry + wet, as the Juno's summer does; Mix fades from the plain input to that, Tone darkens it
    lpL += a * (l - lpL); lpR += a * (r - lpR);
    OUT_L[i] = IN_L[i] * (1 - mix) + lpL * mix; OUT_R[i] = IN_R[i] * (1 - mix) + lpR * mix;
  }
}
}
