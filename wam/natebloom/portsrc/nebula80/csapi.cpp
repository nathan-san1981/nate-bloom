#include "csapi.h"
#include "../duet80core/dsp.h"
#include "../duet80core/presets.h"
#include <string.h>
namespace csapi {
static t77::Engine E; static float base[t77::kNumParams], P[t77::kNumParams]; static int cur = -1;
static int find(const char *name, int dflt) { for (int i = 0; i < t77::kNumPresets; i++) if (!strcmp(t77::kPresets[i].name, name)) return i; return dflt; }
void init(float sr) { E.init(sr); patch(0); }
void patch(int which) {
  if (which == cur) return; cur = which;
  t77::applyPreset(which == 1 ? find("CS Rich Lead", 4) : find("Brass Swell", 0), base);
  base[t77::G_CHORUS_ON] = 0;   // (Nebula's own ensemble follows)
  memcpy(P, base, sizeof(P)); E.setParams(P);
}
static inline float cl(float x, float a, float b) { return x < a ? a : x > b ? b : x; }
void knobs(float bril, float res, float att, float rel, float sus, float det, float mix, float atVib, float glide, float vol) {
  using namespace t77;
  P[G_BRILLIANCE] = cl(base[G_BRILLIANCE] + bril, -1, 1);
  P[G_RESONANCE] = cl(base[G_RESONANCE] + res, -1, 1);
  for (uint32_t ch : {CH1, CH2}) {
    P[ch + C_VA] = cl(base[ch + C_VA] + att, 0, 1); P[ch + C_FA] = cl(base[ch + C_FA] + att * 0.8f, 0, 1);
    P[ch + C_VR] = cl(base[ch + C_VR] + rel, 0, 1); P[ch + C_FR] = cl(base[ch + C_FR] + rel * 0.8f, 0, 1);
    P[ch + C_VS] = cl(base[ch + C_VS] * sus, 0, 1);
  }
  P[G_DETUNE] = cl(base[G_DETUNE] + det, -1, 1);
  P[G_MIX] = cl(base[G_MIX] + mix, 0, 1);
  P[G_AT_VIB] = cl(atVib, 0, 1);
  P[G_GLIDE] = cl(glide, 0, 1);
  P[G_VOLUME] = cl(vol, 0, 1);
}
void on(int key, float vel) { E.noteOn(key, 0, -1, vel); }
void off(int key) { E.noteOff(key, 0, -1); }
void choke() { E.chokeAll(); }
void pedal(bool d) { E.sustainPedal(d); }
void pressure(float p) { E.channelPressure(p); }
void bend(float v) { E.pitchBend(v); }
void mod(float v) { E.modWheel(v); }
void process(float *L, float *R, int n) { E.process(P, L, R, (uint32_t)n); }
int active() { return E.activeVoices(); }
}
