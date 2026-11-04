// Tape Echo (build 214): Airwindows TapeDelay2 (Chris Johnson, MIT): a real varispeed tape loop (the delay time is
// the tape's speed, so changing Time pitches the repeats like a real machine), its resonant filter in the loop, and
// flutter driven by the sound itself. Nate Bloom adds ping-pong and saturation inside the loop; the controls are the
// old Tape Echo's, so projects load.
#include "../nbrs.h"
#include "aw_TapeDelay2.h"
enum { TIME, FEEDBACK, WOWFLUTTER, TONE, SATURATION, PINGPONG, MIX, NPARAM };
static float P[NPARAM] = {380, 48, 35, 3200, 35, 60, 30};
static AW_TapeDelay2 *Dp = nullptr;
static float sr = 48000;
#define TD (*Dp)
extern "C" {
EXPORT("nb_init") void nb_init(float s) { sr = s; Dp = new AW_TapeDelay2(); TD.init(s); }
EXPORT("nb_params") float *nb_params() { return P; }
EXPORT("nb_count") int nb_count() { return NPARAM; }
EXPORT("nb_reset") void nb_reset() { TD.init(sr); }
EXPORT("nb_midi") void nb_midi(int, int, int) {}
EXPORT("nb_render") void nb_render(int n) {
  // Time: the loop is 88200 samples run at 1..26 samples a step, a step per sample at this rate (one per cycle above 88 kHz)
  float cyc = floorf(sr / 44100.0f); if (cyc < 1) cyc = 1; if (cyc > 4) cyc = 4;
  float speed = 88200.0f / (clampf(P[TIME], 40, 1500) * 0.001f * sr / cyc);
  TD.A = powf(clampf((speed - 1.0f) / 25.0f, 0, 1), 0.25f);
  float fb = clampf(P[FEEDBACK], 0, 115) * 0.01f; TD.fbOverride = fb; TD.B = sqrtf(minf(fb, 1.0f));
  TD.C = cbrtf(clampf(P[TONE] / sr / 0.4f, 0.0001f, 1.0f));
  TD.D = 0.35f;
  TD.E = clampf(P[WOWFLUTTER], 0, 100) * 0.0085f;
  TD.satAmt = clampf(P[SATURATION], 0, 100) * 0.01f;
  TD.ppAmt = clampf(P[PINGPONG], 0, 100) * 0.01f;
  TD.F = clampf(P[MIX], 0, 100) * 0.01f;   // (100 = echoes only, as a send needs; 50 = full dry and full echo)
  float *in[2] = {IN_L, IN_R}, *out[2] = {OUT_L, OUT_R};
  TD.processReplacing(in, out, n);
}
}
