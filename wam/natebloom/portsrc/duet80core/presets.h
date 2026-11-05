// Duet 80 — factory presets (original patches). Each preset is the default
// panel with a list of lever positions changed.
#pragma once
#include "params.h"

namespace t77 {

struct PresetSet { uint32_t id; float v; };
struct Preset { const char *name; const PresetSet *sets; int count; };

#define T77_P(NAME, ...)                                                    \
    namespace preset_data { inline const PresetSet NAME[] = {__VA_ARGS__}; }

// ----- Channel shorthands
#define I(x) (CH1 + C_##x)
#define II(x) (CH2 + C_##x)

T77_P(brass,
      {I(SAW), 1}, {I(SQUARE), 0}, {I(LPF), 0.36f}, {I(LPF_RES), 0.22f}, {I(IL), 0.55f}, {I(AL), 0.55f},
      {I(FA), 0.42f}, {I(FD), 0.55f}, {I(FR), 0.45f}, {I(VA), 0.36f}, {I(VD), 0.5f}, {I(VS), 0.85f},
      {I(VR), 0.42f}, {I(TA_BRIL), 0.55f}, {I(TI_BRIL), 0.35f},
      {II(SAW), 0}, {II(SQUARE), 1}, {II(PW), 0.15f}, {II(PWM), 0.2f}, {II(LPF), 0.4f}, {II(IL), 0.4f},
      {II(AL), 0.45f}, {II(FA), 0.45f}, {II(VA), 0.4f}, {II(LEVEL), 0.55f},
      {G_DETUNE, 0.18f}, {G_BEND_DEPTH, 0.22f}, {G_BEND_TIME, 0.42f}, {G_AT_VIB, 0.4f}, {G_SUB_FN, 0},
      {G_SUB_SPEED, 0.66f})

T77_P(strings,
      {I(SAW), 1}, {I(LPF), 0.58f}, {I(LPF_RES), 0.05f}, {I(HPF), 0.18f}, {I(IL), 0.1f}, {I(AL), 0.15f},
      {I(FA), 0.62f}, {I(VA), 0.66f}, {I(VD), 0.6f}, {I(VS), 0.95f}, {I(VR), 0.66f},
      {II(SAW), 1}, {II(SQUARE), 0}, {II(LPF), 0.52f}, {II(IL), 0.1f}, {II(AL), 0.1f}, {II(VA), 0.7f},
      {II(VS), 0.95f}, {II(VR), 0.7f}, {II(FEET), 1},
      {G_DETUNE, 0.32f}, {G_CHORUS_DEPTH, 0.75f}, {G_CHORUS_SPEED, 0.42f}, {G_SUB_VCO, 0.18f},
      {G_SUB_FADE, 0.62f}, {G_SUB_SPEED, 0.6f})

T77_P(rainpad,
      {I(SAW), 1}, {I(LPF), 0.42f}, {I(HPF), 0.22f}, {I(LPF_RES), 0.35f}, {I(IL), 0.3f}, {I(AL), 0.1f},
      {I(FA), 0.7f}, {I(FD), 0.75f}, {I(VA), 0.72f}, {I(VR), 0.8f}, {I(VS), 0.9f},
      {II(SQUARE), 0}, {II(SAW), 0}, {II(NOISE), 0.55f}, {II(HPF), 0.55f}, {II(LPF), 0.7f},
      {II(LPF_RES), 0.5f}, {II(VA), 0.75f}, {II(VR), 0.82f}, {II(LEVEL), 0.45f},
      {G_SUB_FN, 4}, {G_SUB_SPEED, 0.55f}, {G_SUB_VCF, 0.25f}, {G_CHORUS_DEPTH, 0.8f}, {G_MIX, 0.4f})

T77_P(bell,
      {I(SAW), 0}, {I(SINE), 0.85f}, {I(VA), 0.02f}, {I(VD), 0.78f}, {I(VS), 0.0f}, {I(VR), 0.72f},
      {I(LEVEL), 0.85f},
      {II(SQUARE), 1}, {II(PW), 0.6f}, {II(PWM), 0}, {II(FEET), 2}, {II(LPF), 0.66f}, {II(IL), 0},
      {II(AL), 0.3f}, {II(FA), 0.0f}, {II(FD), 0.5f}, {II(VA), 0.02f}, {II(VD), 0.62f}, {II(VS), 0},
      {II(VR), 0.6f}, {II(LEVEL), 0.45f},
      {G_RING_DEPTH, 0.62f}, {G_RING_SPEED, 0.66f}, {G_RING_MOD, -0.15f}, {G_RING_ATK, 0.0f},
      {G_RING_DEC, 0.7f}, {G_MIX, 0.35f})

T77_P(lead,
      {I(SAW), 1}, {I(LPF), 0.48f}, {I(LPF_RES), 0.48f}, {I(IL), 0.35f}, {I(AL), 0.5f}, {I(FA), 0.3f},
      {I(FD), 0.5f}, {I(VA), 0.15f}, {I(VS), 0.9f}, {I(VR), 0.35f}, {I(TA_BRIL), 0.6f},
      {II(SQUARE), 1}, {II(SAW), 0}, {II(PW), 0.35f}, {II(FEET), 2}, {II(LPF), 0.5f}, {II(LEVEL), 0.4f},
      {II(VA), 0.15f}, {II(VR), 0.35f},
      {G_GLIDE, 0.3f}, {G_AT_PITCH, 0.25f}, {G_AT_VIB, 0.55f}, {G_DETUNE, 0.1f}, {G_CHORUS_ON, 0})

T77_P(sweep,
      {I(SAW), 1}, {I(LPF), 0.32f}, {I(LPF_RES), 0.62f}, {I(IL), 0.2f}, {I(AL), 0.25f}, {I(FA), 0.75f},
      {I(VA), 0.62f}, {I(VR), 0.72f},
      {II(SAW), 1}, {II(SQUARE), 0}, {II(LPF), 0.38f}, {II(LPF_RES), 0.5f}, {II(VA), 0.66f}, {II(VR), 0.75f},
      {G_SUB_FN, 0}, {G_SUB_SPEED, 0.28f}, {G_SUB_VCF, 0.45f}, {G_SUB_FADE, 0.3f}, {G_DETUNE, 0.25f},
      {G_CHORUS_DEPTH, 0.65f})

T77_P(organ,
      {I(SAW), 0}, {I(SQUARE), 1}, {I(PW), 0}, {I(FEET), 0}, {I(LPF), 0.62f}, {I(IL), 0}, {I(AL), 0},
      {I(VA), 0.05f}, {I(VS), 1.0f}, {I(VR), 0.2f}, {I(TI_LEVEL), 0}, {I(TI_BRIL), 0},
      {II(SQUARE), 1}, {II(PW), 0}, {II(PWM), 0}, {II(FEET), 2}, {II(LPF), 0.66f}, {II(IL), 0},
      {II(AL), 0}, {II(VA), 0.05f}, {II(VS), 1.0f}, {II(VR), 0.22f}, {II(TI_LEVEL), 0}, {II(LEVEL), 0.6f},
      {G_SUB_VCA, 0.2f}, {G_SUB_SPEED, 0.7f}, {G_CHORUS_DEPTH, 0.6f}, {G_DETUNE, 0.04f})

T77_P(pluck,
      {I(SAW), 1}, {I(HPF), 0.3f}, {I(LPF), 0.42f}, {I(LPF_RES), 0.3f}, {I(IL), 0}, {I(AL), 0.65f},
      {I(FA), 0.0f}, {I(FD), 0.38f}, {I(FR), 0.3f}, {I(VA), 0.0f}, {I(VD), 0.48f}, {I(VS), 0.0f},
      {I(VR), 0.42f}, {I(TI_BRIL), 0.5f},
      {II(SQUARE), 1}, {II(PW), 0.5f}, {II(PWM), 0}, {II(LPF), 0.45f}, {II(AL), 0.5f}, {II(IL), 0},
      {II(FA), 0}, {II(FD), 0.36f}, {II(VA), 0}, {II(VD), 0.45f}, {II(VS), 0}, {II(VR), 0.4f},
      {II(LEVEL), 0.6f}, {G_CHORUS_DEPTH, 0.35f})

T77_P(bass,
      {I(SAW), 1}, {I(FEET), 0}, {I(LPF), 0.3f}, {I(LPF_RES), 0.3f}, {I(IL), 0.2f}, {I(AL), 0.45f},
      {I(FA), 0.1f}, {I(FD), 0.45f}, {I(VA), 0.05f}, {I(VS), 0.8f}, {I(VR), 0.3f},
      {II(SQUARE), 1}, {II(FEET), 0}, {II(PW), 0.1f}, {II(PWM), 0}, {II(LPF), 0.28f}, {II(VA), 0.05f},
      {II(VR), 0.3f}, {II(IL), 0.2f}, {II(AL), 0.35f}, {II(FA), 0.1f},
      {G_CHORUS_ON, 0}, {G_MIX, 0.42f}, {G_DETUNE, 0.08f}, {G_GLIDE, 0.12f})

T77_P(choir,
      {I(SQUARE), 1}, {I(SAW), 0}, {I(PW), 0.4f}, {I(PWM), 0.6f}, {I(PWM_SPEED), 0.32f}, {I(HPF), 0.38f},
      {I(HPF_RES), 0.35f}, {I(LPF), 0.46f}, {I(LPF_RES), 0.3f}, {I(IL), 0}, {I(AL), 0.1f},
      {I(VA), 0.66f}, {I(VR), 0.68f},
      {II(NOISE), 0.15f}, {II(SAW), 1}, {II(SQUARE), 0}, {II(HPF), 0.42f}, {II(LPF), 0.5f},
      {II(LPF_RES), 0.4f}, {II(VA), 0.7f}, {II(VR), 0.7f}, {II(LEVEL), 0.55f},
      {G_SUB_VCO, 0.15f}, {G_SUB_FADE, 0.65f}, {G_CHORUS_DEPTH, 0.85f})

T77_P(wah,
      {I(SAW), 1}, {I(LPF), 0.3f}, {I(LPF_RES), 0.52f}, {I(IL), 0.9f}, {I(AL), 0.75f}, {I(FA), 0.5f},
      {I(FD), 0.62f}, {I(VA), 0.4f}, {I(TA_BRIL), 0.7f},
      {II(SAW), 1}, {II(SQUARE), 0}, {II(LPF), 0.34f}, {II(LPF_RES), 0.4f}, {II(IL), 0.8f}, {II(AL), 0.6f},
      {II(FA), 0.55f}, {II(VA), 0.42f}, {II(LEVEL), 0.6f},
      {G_DETUNE, 0.22f}, {G_BEND_DEPTH, 0.18f}, {G_AT_VIB, 0.45f})

T77_P(drone,
      {I(SAW), 1}, {I(FEET), 0}, {I(LPF), 0.38f}, {I(LPF_RES), 0.55f}, {I(VA), 0.8f}, {I(VR), 0.85f},
      {I(VS), 1.0f}, {I(IL), 0.2f}, {I(AL), 0.2f}, {I(FA), 0.8f},
      {II(NOISE), 0.3f}, {II(SAW), 1}, {II(SQUARE), 0}, {II(FEET), 1}, {II(HPF), 0.35f}, {II(LPF), 0.55f},
      {II(LPF_RES), 0.6f}, {II(VA), 0.82f}, {II(VR), 0.86f},
      {G_RING_DEPTH, 0.35f}, {G_RING_SPEED, 0.12f}, {G_SUB_FN, 4}, {G_SUB_SPEED, 0.45f},
      {G_SUB_VCF, 0.35f}, {G_CHORUS_DEPTH, 0.9f}, {G_CHORUS_SPEED, 0.2f})

T77_P(tines,
      {I(SAW), 0}, {I(SINE), 0.9f}, {I(VA), 0.0f}, {I(VD), 0.68f}, {I(VS), 0.15f}, {I(VR), 0.5f},
      {II(SAW), 1}, {II(SQUARE), 0}, {II(FEET), 1}, {II(LPF), 0.45f}, {II(IL), 0}, {II(AL), 0.55f},
      {II(FA), 0}, {II(FD), 0.3f}, {II(VA), 0}, {II(VD), 0.32f}, {II(VS), 0}, {II(VR), 0.3f},
      {II(LEVEL), 0.45f}, {II(TI_LEVEL), 0.7f},
      {G_MIX, 0.38f}, {G_CHORUS_DEPTH, 0.55f}, {G_SUB_VCA, 0.12f}, {G_SUB_SPEED, 0.68f})

T77_P(harpsi,
      {I(SQUARE), 1}, {I(SAW), 0}, {I(PW), 0.85f}, {I(HPF), 0.42f}, {I(LPF), 0.75f}, {I(IL), 0},
      {I(AL), 0.3f}, {I(FA), 0}, {I(FD), 0.4f}, {I(VA), 0.0f}, {I(VD), 0.55f}, {I(VS), 0.0f},
      {I(VR), 0.45f},
      {II(SAW), 1}, {II(SQUARE), 0}, {II(FEET), 2}, {II(HPF), 0.45f}, {II(LPF), 0.7f}, {II(VA), 0},
      {II(VD), 0.5f}, {II(VS), 0}, {II(VR), 0.42f}, {II(LEVEL), 0.5f}, {II(IL), 0}, {II(AL), 0.2f},
      {G_CHORUS_ON, 0}, {G_DETUNE, 0.06f})

T77_P(cosmic,
      {I(SAW), 1}, {I(LPF), 0.5f}, {I(LPF_RES), 0.45f}, {I(VA), 0.45f}, {I(VR), 0.75f},
      {II(SQUARE), 1}, {II(PW), 0.3f}, {II(PWM), 0.5f}, {II(FEET), 2}, {II(VA), 0.5f}, {II(VR), 0.78f},
      {G_RING_DEPTH, 0.55f}, {G_RING_SPEED, 0.42f}, {G_RING_MOD, 0.75f}, {G_RING_ATK, 0.55f},
      {G_RING_DEC, 0.8f}, {G_SUB_FN, 3}, {G_SUB_SPEED, 0.5f}, {G_SUB_VCF, 0.2f}, {G_CHORUS_DEPTH, 0.8f})

T77_P(init, {G_AGE, 0.5f})

// Banks B/C: patches fitted to multisamples of a real CS-80 (see CALIBRATION.md).
// Generated by calibration/gen_presets.py.
#include "presets_cs80_data.inc"

#undef I
#undef II

#define T77_ENTRY(NAME, ARR) {NAME, preset_data::ARR, (int)(sizeof(preset_data::ARR) / sizeof(PresetSet))}
inline const Preset kPresets[] = {
    T77_ENTRY("Brass Swell", brass),   T77_ENTRY("Dream Strings", strings), T77_ENTRY("Rain Pad", rainpad),
    T77_ENTRY("Glass Bell", bell),     T77_ENTRY("Solo Lead", lead),        T77_ENTRY("Sweep Pad", sweep),
    T77_ENTRY("Organ Tones", organ),   T77_ENTRY("Pluck", pluck),           T77_ENTRY("Deep Bass", bass),
    T77_ENTRY("Choir Haze", choir),    T77_ENTRY("Wah Brass", wah),         T77_ENTRY("Space Drone", drone),
    T77_ENTRY("Tines", tines),         T77_ENTRY("Harpsi Glass", harpsi),   T77_ENTRY("Cosmic Sweep", cosmic),
    T77_ENTRY("Init", init),
#include "presets_cs80_entries.inc"
};
#undef T77_ENTRY
constexpr int kNumPresets = (int)(sizeof(kPresets) / sizeof(kPresets[0]));

inline void applyPreset(int index, float *p) {
    for (uint32_t i = 0; i < kNumParams; ++i) p[i] = kParams[i].def;
    if (index < 0 || index >= kNumPresets) return;
    const Preset &pr = kPresets[index];
    for (int i = 0; i < pr.count; ++i) p[pr.sets[i].id] = pr.sets[i].v;
}

} // namespace t77
