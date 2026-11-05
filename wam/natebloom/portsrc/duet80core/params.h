// Duet 80 — parameter table.
// Every control on the panel is one entry here. IDs are stable: never reorder,
// only append, or saved projects will load the wrong values.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>

namespace t77 {

enum Unit : uint8_t {
    U_PCT,     // 0..1 shown as 0..10 lever scale
    U_BIP,     // -1..1 shown as -5..+5
    U_TIME,    // 0..1 -> 1 ms .. 10 s
    U_LFO,     // 0..1 -> 0.05 .. 30 Hz
    U_CUT,     // 0..1 -> 20 Hz .. 20 kHz
    U_RING,    // 0..1 -> 1 Hz .. 2 kHz
    U_CHOR,    // 0..1 -> 0.05 .. 8 Hz
    U_GLIDE,   // 0..1 -> 0 .. 2 s
    U_BEND,    // 0..1 -> 0 .. 12 st (squared)
    U_CENTS,   // -1..1 -> -50 .. +50 cents
    U_SEMI,    // integer semitones
    U_ENUM,
    U_BOOL,
};

struct ParamDef {
    uint32_t id;
    const char *name;      // full name (host automation lane)
    const char *label;     // short lever label (panel)
    const char *module;    // CLAP module path
    float min, max, def;
    Unit unit;
    const char *const *enumNames;
};

// ---- enum label sets ----
inline const char *const kFeetNames[] = {"16'", "8'", "4'", "2'"};
inline const char *const kSubFnNames[] = {"Sine", "Square", "Saw Up", "Saw Dn", "S/H", "Noise"};
inline const char *const kGlideNames[] = {"Portamento", "Glissando"};
inline const char *const kOnOff[] = {"Off", "On"};

// ---- per-channel layout (offset inside a channel block) ----
enum ChParam : uint32_t {
    C_FEET = 0,
    C_PWM_SPEED, C_PW, C_PWM, C_SQUARE, C_SAW, C_NOISE,
    C_HPF, C_HPF_RES, C_LPF, C_LPF_RES,
    C_IL, C_AL, C_FA, C_FD, C_FR,
    C_SINE, C_VA, C_VD, C_VS, C_VR, C_LEVEL,
    C_TI_BRIL, C_TI_LEVEL, C_TA_BRIL, C_TA_LEVEL,
    C_COUNT
};

// Channel I occupies ids [0, C_COUNT), channel II [C_COUNT, 2*C_COUNT).
constexpr uint32_t CH1 = 0;
constexpr uint32_t CH2 = C_COUNT;

enum GlobalParam : uint32_t {
    G_BASE = 2 * C_COUNT,
    G_DETUNE = G_BASE,
    G_MIX,
    G_BRILLIANCE,
    G_RESONANCE,
    G_VOLUME,
    G_SUB_FN, G_SUB_SPEED, G_SUB_FADE, G_SUB_VCO, G_SUB_VCF, G_SUB_VCA,
    G_RING_DEPTH, G_RING_SPEED, G_RING_MOD, G_RING_ATK, G_RING_DEC,
    G_CHORUS_ON, G_CHORUS_SPEED, G_CHORUS_DEPTH,
    G_KC_BRIL_LO, G_KC_BRIL_HI, G_KC_LVL_LO, G_KC_LVL_HI,
    G_BEND_DEPTH, G_BEND_TIME, G_AT_PITCH, G_AT_VIB,
    G_GLIDE, G_GLIDE_MODE, G_RIBBON_RANGE, G_RIBBON,
    G_AGE,
    G_END
};
constexpr uint32_t kNumParams = G_END;

inline const ParamDef kParams[kNumParams] = {
    // ---------------- Channel I ----------------
    {CH1 + C_FEET,      "I Feet",               "FEET", "Channel I/VCO", 0, 3, 1, U_ENUM, kFeetNames},
    {CH1 + C_PWM_SPEED, "I PWM Speed",          "SPEED", "Channel I/VCO", 0, 1, 0.35f, U_LFO, nullptr},
    {CH1 + C_PW,        "I Pulse Width",        "PW", "Channel I/VCO", 0, 1, 0.0f, U_PCT, nullptr},
    {CH1 + C_PWM,       "I PWM Depth",          "PWM", "Channel I/VCO", 0, 1, 0.0f, U_PCT, nullptr},
    {CH1 + C_SQUARE,    "I Square",             "SQR", "Channel I/VCO", 0, 1, 0, U_BOOL, kOnOff},
    {CH1 + C_SAW,       "I Sawtooth",           "SAW", "Channel I/VCO", 0, 1, 1, U_BOOL, kOnOff},
    {CH1 + C_NOISE,     "I Noise",              "NOISE", "Channel I/VCO", 0, 1, 0.0f, U_PCT, nullptr},
    {CH1 + C_HPF,       "I HPF Cutoff",         "HPF", "Channel I/VCF", 0, 1, 0.0f, U_CUT, nullptr},
    {CH1 + C_HPF_RES,   "I HPF Resonance",      "RES", "Channel I/VCF", 0, 1, 0.0f, U_PCT, nullptr},
    {CH1 + C_LPF,       "I LPF Cutoff",         "LPF", "Channel I/VCF", 0, 1, 0.55f, U_CUT, nullptr},
    {CH1 + C_LPF_RES,   "I LPF Resonance",      "RES", "Channel I/VCF", 0, 1, 0.15f, U_PCT, nullptr},
    {CH1 + C_IL,        "I VCF Initial Level",  "IL", "Channel I/VCF EG", 0, 1, 0.3f, U_PCT, nullptr},
    {CH1 + C_AL,        "I VCF Attack Level",   "AL", "Channel I/VCF EG", 0, 1, 0.4f, U_PCT, nullptr},
    {CH1 + C_FA,        "I VCF Attack",         "A", "Channel I/VCF EG", 0, 1, 0.35f, U_TIME, nullptr},
    {CH1 + C_FD,        "I VCF Decay",          "D", "Channel I/VCF EG", 0, 1, 0.5f, U_TIME, nullptr},
    {CH1 + C_FR,        "I VCF Release",        "R", "Channel I/VCF EG", 0, 1, 0.45f, U_TIME, nullptr},
    {CH1 + C_SINE,      "I Sine Level",         "SINE", "Channel I/VCA", 0, 1, 0.0f, U_PCT, nullptr},
    {CH1 + C_VA,        "I VCA Attack",         "A", "Channel I/VCA", 0, 1, 0.25f, U_TIME, nullptr},
    {CH1 + C_VD,        "I VCA Decay",          "D", "Channel I/VCA", 0, 1, 0.5f, U_TIME, nullptr},
    {CH1 + C_VS,        "I VCA Sustain",        "S", "Channel I/VCA", 0, 1, 0.8f, U_PCT, nullptr},
    {CH1 + C_VR,        "I VCA Release",        "R", "Channel I/VCA", 0, 1, 0.45f, U_TIME, nullptr},
    {CH1 + C_LEVEL,     "I Level",              "LEVEL", "Channel I/VCA", 0, 1, 0.8f, U_PCT, nullptr},
    {CH1 + C_TI_BRIL,   "I Initial Brilliance", "BRIL", "Channel I/Touch", 0, 1, 0.3f, U_PCT, nullptr},
    {CH1 + C_TI_LEVEL,  "I Initial Level",      "LEVEL", "Channel I/Touch", 0, 1, 0.4f, U_PCT, nullptr},
    {CH1 + C_TA_BRIL,   "I After Brilliance",   "BRIL", "Channel I/Touch", 0, 1, 0.3f, U_PCT, nullptr},
    {CH1 + C_TA_LEVEL,  "I After Level",        "LEVEL", "Channel I/Touch", 0, 1, 0.2f, U_PCT, nullptr},
    // ---------------- Channel II ----------------
    {CH2 + C_FEET,      "II Feet",               "FEET", "Channel II/VCO", 0, 3, 1, U_ENUM, kFeetNames},
    {CH2 + C_PWM_SPEED, "II PWM Speed",          "SPEED", "Channel II/VCO", 0, 1, 0.4f, U_LFO, nullptr},
    {CH2 + C_PW,        "II Pulse Width",        "PW", "Channel II/VCO", 0, 1, 0.2f, U_PCT, nullptr},
    {CH2 + C_PWM,       "II PWM Depth",          "PWM", "Channel II/VCO", 0, 1, 0.3f, U_PCT, nullptr},
    {CH2 + C_SQUARE,    "II Square",             "SQR", "Channel II/VCO", 0, 1, 1, U_BOOL, kOnOff},
    {CH2 + C_SAW,       "II Sawtooth",           "SAW", "Channel II/VCO", 0, 1, 0, U_BOOL, kOnOff},
    {CH2 + C_NOISE,     "II Noise",              "NOISE", "Channel II/VCO", 0, 1, 0.0f, U_PCT, nullptr},
    {CH2 + C_HPF,       "II HPF Cutoff",         "HPF", "Channel II/VCF", 0, 1, 0.0f, U_CUT, nullptr},
    {CH2 + C_HPF_RES,   "II HPF Resonance",      "RES", "Channel II/VCF", 0, 1, 0.0f, U_PCT, nullptr},
    {CH2 + C_LPF,       "II LPF Cutoff",         "LPF", "Channel II/VCF", 0, 1, 0.5f, U_CUT, nullptr},
    {CH2 + C_LPF_RES,   "II LPF Resonance",      "RES", "Channel II/VCF", 0, 1, 0.1f, U_PCT, nullptr},
    {CH2 + C_IL,        "II VCF Initial Level",  "IL", "Channel II/VCF EG", 0, 1, 0.0f, U_PCT, nullptr},
    {CH2 + C_AL,        "II VCF Attack Level",   "AL", "Channel II/VCF EG", 0, 1, 0.2f, U_PCT, nullptr},
    {CH2 + C_FA,        "II VCF Attack",         "A", "Channel II/VCF EG", 0, 1, 0.5f, U_TIME, nullptr},
    {CH2 + C_FD,        "II VCF Decay",          "D", "Channel II/VCF EG", 0, 1, 0.6f, U_TIME, nullptr},
    {CH2 + C_FR,        "II VCF Release",        "R", "Channel II/VCF EG", 0, 1, 0.5f, U_TIME, nullptr},
    {CH2 + C_SINE,      "II Sine Level",         "SINE", "Channel II/VCA", 0, 1, 0.0f, U_PCT, nullptr},
    {CH2 + C_VA,        "II VCA Attack",         "A", "Channel II/VCA", 0, 1, 0.45f, U_TIME, nullptr},
    {CH2 + C_VD,        "II VCA Decay",          "D", "Channel II/VCA", 0, 1, 0.5f, U_TIME, nullptr},
    {CH2 + C_VS,        "II VCA Sustain",        "S", "Channel II/VCA", 0, 1, 0.9f, U_PCT, nullptr},
    {CH2 + C_VR,        "II VCA Release",        "R", "Channel II/VCA", 0, 1, 0.55f, U_TIME, nullptr},
    {CH2 + C_LEVEL,     "II Level",              "LEVEL", "Channel II/VCA", 0, 1, 0.7f, U_PCT, nullptr},
    {CH2 + C_TI_BRIL,   "II Initial Brilliance", "BRIL", "Channel II/Touch", 0, 1, 0.2f, U_PCT, nullptr},
    {CH2 + C_TI_LEVEL,  "II Initial Level",      "LEVEL", "Channel II/Touch", 0, 1, 0.3f, U_PCT, nullptr},
    {CH2 + C_TA_BRIL,   "II After Brilliance",   "BRIL", "Channel II/Touch", 0, 1, 0.2f, U_PCT, nullptr},
    {CH2 + C_TA_LEVEL,  "II After Level",        "LEVEL", "Channel II/Touch", 0, 1, 0.2f, U_PCT, nullptr},
    // ---------------- Global ----------------
    {G_DETUNE,       "Detune",               "DETUNE", "Performance", -1, 1, 0.12f, U_CENTS, nullptr},
    {G_MIX,          "Mix I-II",             "MIX", "Performance", 0, 1, 0.5f, U_PCT, nullptr},
    {G_BRILLIANCE,   "Brilliance",           "BRIL", "Performance", -1, 1, 0.0f, U_BIP, nullptr},
    {G_RESONANCE,    "Resonance",            "RES", "Performance", -1, 1, 0.0f, U_BIP, nullptr},
    {G_VOLUME,       "Volume",               "VOLUME", "Performance", 0, 1, 0.7f, U_PCT, nullptr},
    {G_SUB_FN,       "Sub Osc Function",     "FUNC", "Sub Oscillator", 0, 5, 0, U_ENUM, kSubFnNames},
    {G_SUB_SPEED,    "Sub Osc Speed",        "SPEED", "Sub Oscillator", 0, 1, 0.73f, U_LFO, nullptr},
    {G_SUB_FADE,     "Sub Osc Fade In",      "FADE", "Sub Oscillator", 0, 1, 0.45f, U_TIME, nullptr},
    {G_SUB_VCO,      "Sub Osc to VCO",       "VCO", "Sub Oscillator", 0, 1, 0.0f, U_PCT, nullptr},
    {G_SUB_VCF,      "Sub Osc to VCF",       "VCF", "Sub Oscillator", 0, 1, 0.0f, U_PCT, nullptr},
    {G_SUB_VCA,      "Sub Osc to VCA",       "VCA", "Sub Oscillator", 0, 1, 0.0f, U_PCT, nullptr},
    {G_RING_DEPTH,   "Ring Mod Depth",       "DEPTH", "Ring Modulator", 0, 1, 0.0f, U_PCT, nullptr},
    {G_RING_SPEED,   "Ring Mod Speed",       "SPEED", "Ring Modulator", 0, 1, 0.55f, U_RING, nullptr},
    {G_RING_MOD,     "Ring Mod Sweep",       "MOD", "Ring Modulator", -1, 1, 0.0f, U_BIP, nullptr},
    {G_RING_ATK,     "Ring Mod Attack",      "A", "Ring Modulator", 0, 1, 0.2f, U_TIME, nullptr},
    {G_RING_DEC,     "Ring Mod Decay",       "D", "Ring Modulator", 0, 1, 0.5f, U_TIME, nullptr},
    {G_CHORUS_ON,    "Chorus",               "ON", "Chorus", 0, 1, 1, U_BOOL, kOnOff},
    {G_CHORUS_SPEED, "Chorus Speed",         "SPEED", "Chorus", 0, 1, 0.35f, U_CHOR, nullptr},
    {G_CHORUS_DEPTH, "Chorus Depth",         "DEPTH", "Chorus", 0, 1, 0.5f, U_PCT, nullptr},
    {G_KC_BRIL_LO,   "Key Brilliance Low",   "B-LO", "Keyboard Control", -1, 1, 0.0f, U_BIP, nullptr},
    {G_KC_BRIL_HI,   "Key Brilliance High",  "B-HI", "Keyboard Control", -1, 1, 0.0f, U_BIP, nullptr},
    {G_KC_LVL_LO,    "Key Level Low",        "L-LO", "Keyboard Control", -1, 1, 0.0f, U_BIP, nullptr},
    {G_KC_LVL_HI,    "Key Level High",       "L-HI", "Keyboard Control", -1, 1, 0.0f, U_BIP, nullptr},
    {G_BEND_DEPTH,   "Initial Bend Depth",   "BEND", "Touch Pitch", 0, 1, 0.0f, U_BEND, nullptr},
    {G_BEND_TIME,    "Initial Bend Time",    "TIME", "Touch Pitch", 0, 1, 0.35f, U_TIME, nullptr},
    {G_AT_PITCH,     "After Touch Pitch",    "PITCH", "Touch Pitch", 0, 1, 0.0f, U_PCT, nullptr},
    {G_AT_VIB,       "After Touch Vibrato",  "VIB", "Touch Pitch", 0, 1, 0.35f, U_PCT, nullptr},
    {G_GLIDE,        "Portamento Time",      "GLIDE", "Performance", 0, 1, 0.0f, U_GLIDE, nullptr},
    {G_GLIDE_MODE,   "Glide Mode",           "MODE", "Performance", 0, 1, 0, U_ENUM, kGlideNames},
    {G_RIBBON_RANGE, "Ribbon Range",         "RANGE", "Performance", 1, 12, 2, U_SEMI, nullptr},
    {G_RIBBON,       "Ribbon",               "RIBBON", "Performance", -1, 1, 0.0f, U_BIP, nullptr},
    {G_AGE,          "Analog Age",           "AGE", "Performance", 0, 1, 0.5f, U_PCT, nullptr},
};

// ---- shared value mappings (DSP and display use the same curves) ----
inline float mapTime(float x) { return 0.001f * std::pow(10000.0f, x); }
inline float mapLfo(float x) { return 0.05f * std::pow(600.0f, x); }
inline float mapCut(float x) { return 20.0f * std::pow(1000.0f, x); }
inline float mapRing(float x) { return std::pow(2000.0f, x); }
inline float mapChorus(float x) { return 0.05f * std::pow(160.0f, x); }
inline float mapGlide(float x) { return 2.0f * x * x; }
inline float mapBend(float x) { return 12.0f * x * x; }

inline bool isStepped(const ParamDef &d) {
    return d.unit == U_ENUM || d.unit == U_BOOL || d.unit == U_SEMI;
}

inline void formatValue(const ParamDef &d, float v, char *out, size_t n) {
    switch (d.unit) {
    case U_PCT: std::snprintf(out, n, "%.1f", v * 10.0f); break;
    case U_BIP: std::snprintf(out, n, "%+.1f", v * 5.0f); break;
    case U_TIME: {
        float t = mapTime(v);
        if (t < 1.0f) std::snprintf(out, n, "%.0f ms", t * 1000.0f);
        else std::snprintf(out, n, "%.2f s", t);
        break;
    }
    case U_LFO: std::snprintf(out, n, "%.2f Hz", mapLfo(v)); break;
    case U_CUT: {
        float f = mapCut(v);
        if (f < 1000.0f) std::snprintf(out, n, "%.0f Hz", f);
        else std::snprintf(out, n, "%.2f kHz", f / 1000.0f);
        break;
    }
    case U_RING: {
        float f = mapRing(v);
        if (f < 100.0f) std::snprintf(out, n, "%.1f Hz", f);
        else std::snprintf(out, n, "%.0f Hz", f);
        break;
    }
    case U_CHOR: std::snprintf(out, n, "%.2f Hz", mapChorus(v)); break;
    case U_GLIDE: std::snprintf(out, n, "%.0f ms", mapGlide(v) * 1000.0f); break;
    case U_BEND: std::snprintf(out, n, "%.2f st", mapBend(v)); break;
    case U_CENTS: std::snprintf(out, n, "%+.1f ct", v * 50.0f); break;
    case U_SEMI: std::snprintf(out, n, "%d st", (int)std::lround(v)); break;
    case U_ENUM:
    case U_BOOL: {
        int i = (int)std::lround(v);
        if (i < (int)d.min) i = (int)d.min;
        if (i > (int)d.max) i = (int)d.max;
        std::snprintf(out, n, "%s", d.enumNames ? d.enumNames[i - (int)d.min] : "?");
        break;
    }
    }
}

} // namespace t77
