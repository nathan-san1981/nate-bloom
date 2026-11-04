// Tape (build 214): Airwindows ToTape6 (Chris Johnson, MIT): tape saturation with the head bump, high-frequency
// softening and flutter of a real machine. Age sets the softening and the bump, Hiss adds tape noise; the controls
// are the old Tape's, so projects load.
#include "../nbrs.h"
#include "aw_ToTape6.h"
enum { DRIVE, AGE, WOWFLUTTER, HISS, OUTPUT, NPARAM };
static float P[NPARAM] = {6, 30, 20, 8, 0};
static AW_ToTape6 *Tp = nullptr;
static float sr = 48000; static uint32_t seed = 0x2468ACEu; static float pk[3] = {0, 0, 0};
#define T (*Tp)
static inline float rnd() { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; return (float)(seed >> 8) / 8388608.0f - 1.0f; }
extern "C" {
EXPORT("nb_init") void nb_init(float s) { sr = s; Tp = new AW_ToTape6(); T.init(s); }
EXPORT("nb_params") float *nb_params() { return P; }
EXPORT("nb_count") int nb_count() { return NPARAM; }
EXPORT("nb_reset") void nb_reset() { T.init(sr); }
EXPORT("nb_midi") void nb_midi(int, int, int) {}
EXPORT("nb_render") void nb_render(int n) {
  float drive = clampf(P[DRIVE], 0, 24), age = clampf(P[AGE], 0, 100) * 0.01f;
  T.A = clampf(0.5f + drive / 48.0f, 0, 1);                 // input gain: 0 to +12 dB into the tape
  T.B = 0.15f + age * 0.8f;                                // Soften: older tape loses its top
  T.C = 0.35f + age * 0.4f;                                // Head bump
  T.D = clampf(P[WOWFLUTTER], 0, 100) * 0.007f;            // Flutter
  T.E = clampf(0.5f + (P[OUTPUT] - drive * 0.5f) / 24.0f, 0, 1);   // output, giving back half the drive
  T.F = 1.0f;
  float *in[2] = {IN_L, IN_R}, *out[2] = {OUT_L, OUT_R};
  T.processReplacing(in, out, n);
  float h = clampf(P[HISS], 0, 100) * 0.0004f;
  if (h > 0) for (int i = 0; i < n; i++) {   // tape hiss: pinkish (a few one-poles), a touch different per side
    float w = rnd(); pk[0] = 0.997f * pk[0] + 0.03f * w; pk[1] = 0.96f * pk[1] + 0.1f * w; pk[2] = 0.6f * pk[2] + 0.4f * w;
    float s = (pk[0] + pk[1] + pk[2]) * h; OUT_L[i] += s; OUT_R[i] += s * 0.8f + rnd() * h * 0.3f;
  }
}
}
