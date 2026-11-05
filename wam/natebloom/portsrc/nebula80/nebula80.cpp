// Nebula 80 — a CLAP synth for Vangelis-style sound design.
// Engines: CS Brass, CS Lead, Ring Bells, Electric Grand, Tine Piano, Ensemble, Timpani.
// Per-note aftertouch (CS-80 style), glide, delayed vibrato, mono/legato,
// ensemble chorus, ping-pong delay, long hall reverb, and a Sound menu of presets.
#include <clap/clap.h>
#include <strings.h>

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>

#include "dsp.h"
#ifdef NB_FM6
#include "csapi.h"    // (Nate Bloom build 229) CS Brass and CS Lead on Duet 80's CS-80 voice
#include "fm6api.h"   // (Nate Bloom build 229) the bells and the tine piano on a 6-operator FM voice
#endif

#if defined(__x86_64__) || defined(__SSE__)
#include <xmmintrin.h>
#define NEB_HAS_SSE 1
#endif

namespace neb {
using namespace hyp;

constexpr int kMaxVoices = 16;
constexpr int kChunk = 16;
constexpr int kMaxModes = 24;

enum Engine { E_BRASS = 0, E_LEAD, E_BELLS, E_GRAND, E_TINE, E_ENSEMBLE, E_TIMPANI, E_COUNT };
enum VoiceMode { VM_POLY = 0, VM_MONO, VM_LEGATO };

enum ParamId : clap_id {
    P_SOUND = 0, P_ENGINE, P_BRIGHT, P_CHAR, P_DETUNE,
    P_CUTOFF, P_RESO, P_HPF, P_FENV,
    P_ATTACK, P_DECAY, P_SUSTAIN, P_RELEASE,
    P_VOICE_MODE, P_GLIDE, P_BEND,
    P_VIB_RATE, P_VIB_DEPTH, P_VIB_DELAY,
    P_AT_BRIGHT, P_AT_VIB,
    P_DRIVE, P_ENSEMBLE,
    P_DLY_MIX, P_DLY_TIME, P_DLY_FB,
    P_VERB_MIX, P_VERB_SIZE, P_PREDELAY,
    P_VOLUME,
    P_COUNT
};

enum Unit { U_PCT, U_HZ, U_HPHZ, U_TIME_A, U_TIME_D, U_TIME_R, U_GLIDE, U_VIBHZ, U_VIBDEL, U_PREDLY, U_DB, U_ENUM, U_INT };

static const char* const kSoundLabels[] = {"Custom",        "Neon Brass",  "Soaring Lead",   "Ring Bells",
                                           "Stadium Grand", "Tine Piano",  "Silk Strings",   "Cathedral Choir",
                                           "Thunder Timpani", "Dawn Pad",  "Sweep Brass"};
constexpr int kNumSounds = 11;
static const char* const kEngineLabels[] = {"CS Brass", "CS Lead", "Ring Bells", "Electric Grand",
                                            "Tine Piano", "Ensemble", "Timpani"};
static const char* const kVoiceModeLabels[] = {"Poly", "Mono", "Legato"};
static const char* const kDlyLabels[] = {"1/16", "1/8", "1/8 dot", "1/4", "1/4 dot", "1/2"};
static const double kDlyBeats[] = {0.25, 0.5, 0.75, 1.0, 1.5, 2.0};

struct ParamDef {
    clap_id id;
    const char* name;
    const char* module;
    double mn, mx, def;
    Unit unit;
    const char* const* labels;
};

// "def" is the neutral base every preset starts from; the reported default is the Neon Brass preset.
static const ParamDef kParams[P_COUNT] = {
    {P_SOUND, "Sound", "Sound", 0, kNumSounds - 1, 1, U_ENUM, kSoundLabels},
    {P_ENGINE, "Engine", "Voice", 0, E_COUNT - 1, 0, U_ENUM, kEngineLabels},
    {P_BRIGHT, "Brightness", "Voice", 0, 1, 0.5, U_PCT, nullptr},
    {P_CHAR, "Character", "Voice", 0, 1, 0.5, U_PCT, nullptr},
    {P_DETUNE, "Detune", "Voice", 0, 1, 0.3, U_PCT, nullptr},
    {P_CUTOFF, "Cutoff", "Filter", 0, 1, 0.6, U_HZ, nullptr},
    {P_RESO, "Resonance", "Filter", 0, 1, 0.15, U_PCT, nullptr},
    {P_HPF, "High-Pass", "Filter", 0, 1, 0.0, U_HPHZ, nullptr},
    {P_FENV, "Filter Env", "Filter", 0, 1, 0.5, U_PCT, nullptr},
    {P_ATTACK, "Attack", "Envelope", 0, 1, 0.1, U_TIME_A, nullptr},
    {P_DECAY, "Decay", "Envelope", 0, 1, 0.5, U_TIME_D, nullptr},
    {P_SUSTAIN, "Sustain", "Envelope", 0, 1, 0.7, U_PCT, nullptr},
    {P_RELEASE, "Release", "Envelope", 0, 1, 0.45, U_TIME_R, nullptr},
    {P_VOICE_MODE, "Voice Mode", "Performance", 0, 2, 0, U_ENUM, kVoiceModeLabels},
    {P_GLIDE, "Glide", "Performance", 0, 1, 0, U_GLIDE, nullptr},
    {P_BEND, "Bend Range", "Performance", 1, 12, 2, U_INT, nullptr},
    {P_VIB_RATE, "Vibrato Rate", "Performance", 0, 1, 0.45, U_VIBHZ, nullptr},
    {P_VIB_DEPTH, "Vibrato Depth", "Performance", 0, 1, 0.1, U_PCT, nullptr},
    {P_VIB_DELAY, "Vibrato Delay", "Performance", 0, 1, 0.3, U_VIBDEL, nullptr},
    {P_AT_BRIGHT, "Touch > Bright", "Performance", 0, 1, 0.5, U_PCT, nullptr},
    {P_AT_VIB, "Touch > Vibrato", "Performance", 0, 1, 0.4, U_PCT, nullptr},
    {P_DRIVE, "Drive", "FX", 0, 1, 0.1, U_PCT, nullptr},
    {P_ENSEMBLE, "Ensemble", "FX", 0, 1, 0.4, U_PCT, nullptr},
    {P_DLY_MIX, "Delay Mix", "FX", 0, 1, 0.15, U_PCT, nullptr},
    {P_DLY_TIME, "Delay Time", "FX", 0, 5, 3, U_ENUM, kDlyLabels},
    {P_DLY_FB, "Delay Feedback", "FX", 0, 0.95, 0.35, U_PCT, nullptr},
    {P_VERB_MIX, "Reverb Mix", "FX", 0, 1, 0.35, U_PCT, nullptr},
    {P_VERB_SIZE, "Reverb Size", "FX", 0, 1, 0.6, U_PCT, nullptr},
    {P_PREDELAY, "Pre-Delay", "FX", 0, 1, 0.3, U_PREDLY, nullptr},
    {P_VOLUME, "Volume", "Output", -36, 6, -6, U_DB, nullptr},
};

struct Ov { clap_id id; float v; };
struct Preset { const Ov* ov; int n; };

static const Ov kBrass[] = {{P_ENGINE, E_BRASS}, {P_BRIGHT, .55f}, {P_CHAR, .5f}, {P_DETUNE, .35f}, {P_CUTOFF, .38f},
    {P_RESO, .2f}, {P_FENV, .7f}, {P_ATTACK, .42f}, {P_DECAY, .6f}, {P_SUSTAIN, .75f}, {P_RELEASE, .5f},
    {P_ENSEMBLE, .35f}, {P_VERB_MIX, .45f}, {P_VERB_SIZE, .8f}, {P_PREDELAY, .35f}};
static const Ov kLead[] = {{P_ENGINE, E_LEAD}, {P_BRIGHT, .6f}, {P_CHAR, .3f}, {P_DETUNE, .15f}, {P_CUTOFF, .55f},
    {P_RESO, .3f}, {P_FENV, .35f}, {P_ATTACK, .1f}, {P_SUSTAIN, .9f}, {P_RELEASE, .45f}, {P_GLIDE, .5f},
    {P_VOICE_MODE, VM_LEGATO}, {P_VIB_DEPTH, .15f}, {P_VIB_DELAY, .45f}, {P_AT_VIB, .6f}, {P_ENSEMBLE, .2f},
    {P_DLY_MIX, .3f}, {P_DLY_FB, .45f}, {P_DLY_TIME, 2}, {P_VERB_MIX, .4f}, {P_VERB_SIZE, .75f}};
static const Ov kBells[] = {{P_ENGINE, E_BELLS}, {P_BRIGHT, .6f}, {P_CHAR, .55f}, {P_CUTOFF, .85f}, {P_FENV, .2f},
    {P_ATTACK, 0}, {P_DECAY, .6f}, {P_SUSTAIN, 0}, {P_RELEASE, .6f}, {P_ENSEMBLE, .3f}, {P_VIB_DEPTH, 0},
    {P_DLY_MIX, .25f}, {P_VERB_MIX, .5f}, {P_VERB_SIZE, .8f}};
static const Ov kGrand[] = {{P_ENGINE, E_GRAND}, {P_BRIGHT, .6f}, {P_CHAR, .5f}, {P_DETUNE, .35f}, {P_CUTOFF, .9f},
    {P_RESO, 0}, {P_FENV, 0}, {P_ATTACK, 0}, {P_DECAY, .7f}, {P_SUSTAIN, 1}, {P_RELEASE, .35f}, {P_VIB_DEPTH, 0},
    {P_AT_VIB, 0}, {P_AT_BRIGHT, 0}, {P_ENSEMBLE, .45f}, {P_DLY_MIX, 0}, {P_VERB_MIX, .45f}, {P_VERB_SIZE, .75f}};
static const Ov kTine[] = {{P_ENGINE, E_TINE}, {P_BRIGHT, .45f}, {P_CHAR, .4f}, {P_CUTOFF, .85f}, {P_RESO, 0},
    {P_FENV, 0}, {P_ATTACK, 0}, {P_DECAY, .85f}, {P_SUSTAIN, 0}, {P_RELEASE, .35f}, {P_VIB_DEPTH, 0},
    {P_AT_VIB, 0}, {P_ENSEMBLE, .5f}, {P_DLY_MIX, .1f}, {P_VERB_MIX, .3f}};
static const Ov kStrings[] = {{P_ENGINE, E_ENSEMBLE}, {P_BRIGHT, .5f}, {P_CHAR, 0}, {P_DETUNE, .5f}, {P_CUTOFF, .6f},
    {P_FENV, .1f}, {P_ATTACK, .6f}, {P_SUSTAIN, 1}, {P_RELEASE, .65f}, {P_VIB_DEPTH, .04f}, {P_ENSEMBLE, .9f},
    {P_DLY_MIX, 0}, {P_VERB_MIX, .5f}, {P_VERB_SIZE, .85f}};
static const Ov kChoir[] = {{P_ENGINE, E_ENSEMBLE}, {P_BRIGHT, .45f}, {P_CHAR, 1}, {P_DETUNE, .45f}, {P_CUTOFF, .7f},
    {P_FENV, 0}, {P_ATTACK, .55f}, {P_SUSTAIN, 1}, {P_RELEASE, .7f}, {P_VIB_DEPTH, .05f}, {P_ENSEMBLE, .7f},
    {P_DLY_MIX, 0}, {P_VERB_MIX, .6f}, {P_VERB_SIZE, .9f}, {P_PREDELAY, .5f}};
static const Ov kTimp[] = {{P_ENGINE, E_TIMPANI}, {P_BRIGHT, .45f}, {P_CHAR, .6f}, {P_CUTOFF, .8f}, {P_RESO, 0},
    {P_FENV, 0}, {P_ATTACK, 0}, {P_DECAY, .6f}, {P_SUSTAIN, 1}, {P_RELEASE, .5f}, {P_VIB_DEPTH, 0}, {P_AT_VIB, 0},
    {P_ENSEMBLE, 0}, {P_DLY_MIX, 0}, {P_VERB_MIX, .55f}, {P_VERB_SIZE, .85f}, {P_DRIVE, .15f}};
static const Ov kDawn[] = {{P_ENGINE, E_BRASS}, {P_BRIGHT, .4f}, {P_CHAR, .8f}, {P_DETUNE, .6f}, {P_CUTOFF, .45f},
    {P_FENV, .4f}, {P_ATTACK, .75f}, {P_DECAY, .8f}, {P_SUSTAIN, .8f}, {P_RELEASE, .8f}, {P_VIB_DEPTH, .05f},
    {P_ENSEMBLE, .7f}, {P_DLY_MIX, .1f}, {P_VERB_MIX, .6f}, {P_VERB_SIZE, .95f}, {P_PREDELAY, .45f}};
static const Ov kSweep[] = {{P_ENGINE, E_BRASS}, {P_BRIGHT, .7f}, {P_CHAR, .3f}, {P_DETUNE, .3f}, {P_CUTOFF, .25f},
    {P_RESO, .45f}, {P_FENV, .9f}, {P_ATTACK, .3f}, {P_DECAY, .55f}, {P_SUSTAIN, .6f}, {P_RELEASE, .5f},
    {P_AT_BRIGHT, .9f}, {P_ENSEMBLE, .3f}, {P_VERB_MIX, .45f}, {P_VERB_SIZE, .8f}};

#define NOV(a) {a, (int)(sizeof(a) / sizeof(Ov))}
static const Preset kPresets[kNumSounds] = {{nullptr, 0}, NOV(kBrass), NOV(kLead), NOV(kBells), NOV(kGrand),
                                            NOV(kTine),   NOV(kStrings), NOV(kChoir), NOV(kTimp), NOV(kDawn),
                                            NOV(kSweep)};

static void presetValues(int s, double* out) {
    for (int i = 0; i < (int)P_COUNT; ++i) out[i] = kParams[i].def;
    if (s <= 0 || s >= kNumSounds) return;
    for (int i = 0; i < kPresets[s].n; ++i) out[kPresets[s].ov[i].id] = kPresets[s].ov[i].v;
    out[P_SOUND] = s;
}
static double defaultOf(clap_id id) {
    double v[P_COUNT];
    presetValues(1, v);
    return v[id];
}

inline float cutoffHz(float v) { return 30.f * std::pow(600.f, v); }
inline float hpHz(float v) { return 20.f * std::pow(100.f, v); }
inline float attackSec(float v) { return 0.001f * std::pow(4000.f, v); }
inline float decaySec(float v) { return 0.005f * std::pow(1600.f, v); }
inline float releaseSec(float v) { return 0.01f * std::pow(1000.f, v); }
inline float glideSec(float v) { return v < 0.001f ? 0.f : 0.005f * std::pow(600.f, v); }
inline float vibHz(float v) { return 2.f + 8.f * v; }
inline float vibDelaySec(float v) { return 2.f * v; }
inline float predelayMs(float v) { return 150.f * v; }

static const float kVowelF[3][3] = {{325, 700, 2530}, {450, 800, 2830}, {800, 1150, 2900}};
static const float kVowelG[3][3] = {{1.f, 0.25f, 0.06f}, {1.f, 0.35f, 0.10f}, {1.f, 0.55f, 0.15f}};
static const float kTimpRatio[6] = {1.f, 1.5f, 1.98f, 2.44f, 2.94f, 3.43f};
static const float kTimpAmp[6] = {1.f, 0.7f, 0.5f, 0.38f, 0.28f, 0.2f};
static const float kEngineGain[E_COUNT] = {1.f, 1.f, 1.f, 1.f, 1.f, 1.f, 1.f};

struct Ctl {
    float sr, isr, bright, chr, detune, cutoff, reso, hp, fenvAmt, decayRaw;
    float aInc, dCoef, sus, rCoef, fAInc;
    float glideA, bend, vibRate, vibDepth, vibDelay, atBright, atVib, modWheel;
};

struct Voice {
    bool active = false, released = false, pedalHeld = false;
    int key = 60, engine = 0;
    int32_t noteId = -1;
    int16_t port = 0, chan = 0;
    float vel = 1.f;
    uint64_t age = 0;
    float curSemi = 60, tgtSemi = 60, tuning = 0;
    float press = 0, pressT = 0, brightX = 0.5f;
    float vibPh = 0, vibT = 0, lfoPh = 0;
    float gL = 0.707f, gR = 0.707f;
    Env env, fenv;
    SVF lp1, lp2, hp1, hp2, nf, dcf;
    SVF form[3];
    Rng rng;
    float ph[4] = {0, 0, 0, 0};
    // modal
    int nModes = 0;
    float mRe[kMaxModes], mIm[kMaxModes], mRatio[kMaxModes], mT60[kMaxModes];
    float noiseEnv = 0, dropEnv = 0, rumble = 0, rumbleEnv = 0;
    // fm / ring
    float fmEnv = 1, pingEnv = 1, ringEnv = 1;
#ifdef NB_FM6
    fm6api::V *fm = nullptr;
#endif
};

struct NoteRec {
    int key;
    float vel;
    int32_t id;
    int16_t port, chan;
};

struct Plugin {
    clap_plugin_t clap;
    const clap_host_t* host = nullptr;
    const clap_host_params_t* hostParams = nullptr;
    std::atomic<double> vals[P_COUNT];

    float sr = 48000.f;
    Voice voices[kMaxVoices];
    uint64_t ageCounter = 0;
    float lastSemi = 60.f;
    float bendNorm = 0.f, modWheel = 0.f, chanPress = 0.f;
    bool pedal = false;
    NoteRec stack[128];
    int nStack = 0;
    double tempo = 120;

    const clap_output_events_t* out = nullptr;
    uint32_t curPos = 0;

    Ensemble ens;
    PingPong dly;
    Reverb verb;
    DelayLine preL, preR;
    float sCut = 0.38f, sVol = 0.5f, sEns = 0, sDly = 0, sVerb = 0, sDrive = 0, sPre = 0;
    float tmpL[kChunk], tmpR[kChunk];
#ifdef NB_FM6
    float csL[kChunk], csR[kChunk];
    bool isCS() const { int e = pi(P_ENGINE); return e == E_BRASS || e == E_LEAD; }
#endif

    Plugin() {
        for (int i = 0; i < (int)P_COUNT; ++i) vals[i].store(defaultOf(i));
    }

    inline float p(int id) const { return (float)vals[id].load(std::memory_order_relaxed); }
    inline int pi(int id) const { return (int)std::lround(vals[id].load(std::memory_order_relaxed)); }

    void activate(double sampleRate) {
        sr = (float)sampleRate;
#ifdef NB_FM6
        fm6api::setup(sr);
        csapi::init(sr);
        for (auto &vv : voices) if (!vv.fm) vv.fm = fm6api::make();
#endif
        ens.init(sr);
        dly.init(sr);
        verb.init(sr, 1.35f, 7000.f);
        preL.init((int)(sr * 0.16f));
        preR.init((int)(sr * 0.16f));
        resetState();
    }

    void resetState() {
        for (int i = 0; i < kMaxVoices; ++i) {
            voices[i].active = false;
            voices[i].rng.s = 0x2545F491u + 104729u * (uint32_t)i;
        }
        ens.clear();
        dly.clear();
        verb.clear();
        preL.clear();
        preR.clear();
        nStack = 0;
        bendNorm = modWheel = chanPress = 0;
        pedal = false;
    }

    // ------------------------------------------------------------ host notifications
    void pushNoteEnd(const Voice& v) {
        if (!out) return;
        clap_event_note_t e{};
        e.header.size = sizeof(e);
        e.header.time = curPos;
        e.header.space_id = CLAP_CORE_EVENT_SPACE_ID;
        e.header.type = CLAP_EVENT_NOTE_END;
        e.header.flags = 0;
        e.note_id = v.noteId;
        e.port_index = v.port;
        e.channel = v.chan;
        e.key = (int16_t)v.key;
        e.velocity = 0;
        out->try_push(out, &e.header);
    }

    void pushParam(clap_id id, double value) {
        if (!out) return;
        clap_event_param_value_t e{};
        e.header.size = sizeof(e);
        e.header.time = curPos;
        e.header.space_id = CLAP_CORE_EVENT_SPACE_ID;
        e.header.type = CLAP_EVENT_PARAM_VALUE;
        e.header.flags = 0;
        e.param_id = id;
        e.cookie = nullptr;
        e.note_id = -1;
        e.port_index = -1;
        e.channel = -1;
        e.key = -1;
        e.value = value;
        out->try_push(out, &e.header);
    }

    void applyPreset(int s) {
        if (s <= 0 || s >= kNumSounds) return;
        double v[P_COUNT];
        presetValues(s, v);
        for (int i = 1; i < (int)P_COUNT; ++i) {
            if (vals[i].load() != v[i]) {
                vals[i].store(v[i]);
                pushParam(i, v[i]);
            }
        }
    }

    // ------------------------------------------------------------ voices
    Voice* allocVoice() {
        Voice* best = nullptr;
        for (auto& v : voices)
            if (!v.active) return &v;
        for (auto& v : voices)
            if (v.released && (!best || v.age < best->age)) best = &v;
        if (!best)
            for (auto& v : voices)
                if (!best || v.age < best->age) best = &v;
        return best;
    }

    void initVoice(Voice& v, const NoteRec& n, float startSemi) {
        if (v.active) pushNoteEnd(v);
        v.active = true;
        v.released = false;
        v.pedalHeld = false;
        v.key = n.key;
        v.noteId = n.id;
        v.port = n.port;
        v.chan = n.chan;
        v.vel = n.vel;
        v.age = ++ageCounter;
        v.engine = std::min(E_COUNT - 1, std::max(0, pi(P_ENGINE)));
        v.tgtSemi = (float)n.key;
        v.curSemi = glideSec(p(P_GLIDE)) > 0.f ? startSemi : (float)n.key;
        v.tuning = 0;
        v.press = v.pressT = chanPress;
        v.brightX = 0.5f;
        v.vibT = 0;
        v.vibPh = v.rng.uni();
        v.lfoPh = v.rng.uni();
        float pan = clampf(p(P_DETUNE) * 0.7f * v.rng.bi(), -1.f, 1.f);
        v.gL = std::sqrt(0.5f * (1.f - pan));
        v.gR = std::sqrt(0.5f * (1.f + pan));
        v.env.on();
        v.fenv.on();
        v.lp1.reset(); v.lp2.reset(); v.hp1.reset(); v.hp2.reset(); v.nf.reset(); v.dcf.reset();
        for (auto& f : v.form) f.reset();
        for (int j = 0; j < 4; ++j) v.ph[j] = (v.engine == E_ENSEMBLE || v.engine == E_BRASS) ? v.rng.uni() : 0.f;
        v.fmEnv = v.pingEnv = v.ringEnv = 1.f;
        v.noiseEnv = 1.f;
        v.dropEnv = 1.f;
        v.rumble = 0.f;
        v.rumbleEnv = 1.f;
        v.nModes = 0;
        float bright = p(P_BRIGHT);
#ifdef NB_FM6
        // Ring Bells: Character picks the bell (glass below the middle, tubular above), Brightness the modulators' level,
        // Decay how long it rings; the ring modulator stays on top as the CS-80's colour. Tine Piano: the DX tine patch.
        if (v.engine == E_BELLS || v.engine == E_TINE) {
            int patch = v.engine == E_TINE ? fm6api::TINE : (p(P_CHAR) < 0.5f ? fm6api::GLASS : fm6api::TUBULAR);
            float dec = 0.5f + 2.0f * p(P_DECAY);
            fm6api::start(v.fm, patch, n.key, std::max(1, std::min(127, (int)std::lround(n.vel * 127.f))), 0.35f + 0.6f * bright, dec, 0.8f);
        } else if (v.fm) fm6api::stop(v.fm);
#endif
        if (v.engine == E_GRAND) {
            // two detuned strings x 12 partials; hammer strike position shapes the spectrum
            float f0 = 440.f * std::exp2((n.key - 69) / 12.f);
            float hard = clampf(bright * (0.55f + 0.45f * n.vel), 0.f, 1.f);
            float pw = 1.7f - 1.2f * hard;
            float B = 0.00025f * std::exp2((n.key - 60) / 12.f * 1.3f);
            float t0 = clampf((0.8f + 9.f * p(P_DECAY)) * std::pow(261.6f / f0, 0.6f), 0.3f, 25.f);
            float det = 1.f + 0.004f * p(P_DETUNE);
            float sum = 0.f;
            for (int s = 0; s < 2; ++s)
                for (int h = 1; h <= 12; ++h) {
                    int m = v.nModes++;
                    float a = std::fabs(std::sin(kPi * h * 0.12f)) * std::pow((float)h, -pw);
                    v.mRatio[m] = h * std::sqrt(1.f + B * h * h) * (s ? det : 1.f);
                    v.mT60[m] = t0 / (1.f + 0.06f * h * h);
                    v.mRe[m] = a;
                    v.mIm[m] = 0.f;
                    sum += a;
                }
            for (int m = 0; m < v.nModes; ++m) v.mRe[m] *= (0.35f + 0.65f * n.vel) * 1.4f / sum;
        } else if (v.engine == E_TIMPANI) {
            float hard = 0.25f + 0.7f * bright;
            float t0 = 0.6f + 4.5f * p(P_DECAY);
            float sum = 0.f;
            for (int i = 0; i < 6; ++i) {
                int m = v.nModes++;
                float a = kTimpAmp[i] * std::pow(hard, (float)i * 0.6f);
                v.mRatio[m] = kTimpRatio[i];
                v.mT60[m] = t0 / (1.f + 0.35f * i);
                v.mRe[m] = a;
                v.mIm[m] = 0.f;
                sum += a;
            }
            for (int m = 0; m < v.nModes; ++m) v.mRe[m] *= (0.3f + 0.7f * n.vel) * 1.2f / sum;
        }
    }

    void releaseVoice(Voice& v) {
        if (pedal) { v.pedalHeld = true; return; }
        v.released = true;
        v.env.off();
        v.fenv.off();
#ifdef NB_FM6
        if (v.fm) fm6api::keyup(v.fm);
#endif
    }

    int mode() const { return std::min(2, std::max(0, pi(P_VOICE_MODE))); }

    void noteOn(const NoteRec& n) {
        if (n.key < 0 || n.key > 127) return;
#ifdef NB_FM6
        if (isCS()) { csapi::patch(pi(P_ENGINE) == E_LEAD ? 1 : 0); csapi::on(n.key, n.vel); lastSemi = (float)n.key; return; }
#endif
        int m = mode();
        if (m == VM_POLY) {
            Voice& v = *allocVoice();
            initVoice(v, n, lastSemi);
        } else {
            // mono: remove duplicates, push on stack
            for (int i = 0; i < nStack; ++i)
                if (stack[i].key == n.key) { std::memmove(&stack[i], &stack[i + 1], (nStack - i - 1) * sizeof(NoteRec)); --nStack; break; }
            if (nStack < 128) stack[nStack++] = n;
            for (int i = 1; i < kMaxVoices; ++i)
                if (voices[i].active && !voices[i].released) { voices[i].released = true; voices[i].env.off(); voices[i].fenv.off(); }
            Voice& v = voices[0];
            if (v.active && !v.released && m == VM_LEGATO) {
                if (v.noteId != n.id || v.key != n.key) pushNoteEnd(v);
                v.key = n.key; v.noteId = n.id; v.port = n.port; v.chan = n.chan;
                v.tgtSemi = (float)n.key;
                if (glideSec(p(P_GLIDE)) <= 0.f) v.curSemi = v.tgtSemi;
            } else {
                float from = v.active ? v.curSemi : lastSemi;
                initVoice(v, n, from);
            }
        }
        lastSemi = (float)n.key;
    }

    void noteOff(int key, int32_t id) {
#ifdef NB_FM6
        if (key < 0) csapi::choke(); else csapi::off(key);
#endif
        int m = mode();
        if (m == VM_POLY) {
            for (auto& v : voices)
                if (v.active && !v.released && !v.pedalHeld &&
                    (key < 0 || (id >= 0 && v.noteId == id) || (id < 0 && v.key == key)))
                    releaseVoice(v);
            return;
        }
        if (key < 0) nStack = 0;
        else
            for (int i = 0; i < nStack; ++i)
                if (stack[i].key == key) { std::memmove(&stack[i], &stack[i + 1], (nStack - i - 1) * sizeof(NoteRec)); --nStack; break; }
        Voice& v = voices[0];
        if (!v.active || v.released) return;
        if (key >= 0 && v.key != key) return;
        if (nStack > 0) {
            const NoteRec& back = stack[nStack - 1];
            if (m == VM_LEGATO) {
                pushNoteEnd(v);
                v.key = back.key; v.noteId = back.id; v.port = back.port; v.chan = back.chan;
                v.tgtSemi = (float)back.key;
                if (glideSec(p(P_GLIDE)) <= 0.f) v.curSemi = v.tgtSemi;
            } else {
                initVoice(v, back, v.curSemi);
            }
            lastSemi = (float)back.key;
        } else {
            releaseVoice(v);
        }
    }

    void setPedal(bool down) {
        pedal = down;
#ifdef NB_FM6
        csapi::pedal(down);
#endif
        if (!down)
            for (auto& v : voices)
                if (v.active && v.pedalHeld) { v.pedalHeld = false; v.released = true; v.env.off(); v.fenv.off(); }
    }

    template <typename F>
    void forNote(int32_t id, int key, F fn) {
        for (auto& v : voices)
            if (v.active && ((id >= 0 && v.noteId == id) || (id < 0 && (key < 0 || v.key == key)))) fn(v);
    }

    void handleEvent(const clap_event_header_t* h) {
        if (h->space_id != CLAP_CORE_EVENT_SPACE_ID) return;
        switch (h->type) {
            case CLAP_EVENT_NOTE_ON: {
                auto* e = (const clap_event_note_t*)h;
                noteOn({e->key, (float)e->velocity, e->note_id, e->port_index, e->channel});
                break;
            }
            case CLAP_EVENT_NOTE_OFF: {
                auto* e = (const clap_event_note_t*)h;
                noteOff(e->key, e->note_id);
                break;
            }
            case CLAP_EVENT_NOTE_CHOKE: {
                auto* e = (const clap_event_note_t*)h;
                forNote(e->note_id, e->key, [&](Voice& v) { pushNoteEnd(v); v.active = false; });
                if (e->key < 0) nStack = 0;
                break;
            }
            case CLAP_EVENT_NOTE_EXPRESSION: {
                auto* e = (const clap_event_note_expression_t*)h;
                float val = (float)e->value;
                switch (e->expression_id) {
                    case CLAP_NOTE_EXPRESSION_PRESSURE: forNote(e->note_id, e->key, [&](Voice& v) { v.pressT = val; }); break;
                    case CLAP_NOTE_EXPRESSION_TUNING: forNote(e->note_id, e->key, [&](Voice& v) { v.tuning = val; }); break;
                    case CLAP_NOTE_EXPRESSION_BRIGHTNESS: forNote(e->note_id, e->key, [&](Voice& v) { v.brightX = val; }); break;
                    default: break;
                }
                break;
            }
            case CLAP_EVENT_MIDI: {
                auto* e = (const clap_event_midi_t*)h;
                uint8_t st = e->data[0] & 0xF0, d1 = e->data[1], d2 = e->data[2];
                if (st == 0x90 && d2 > 0) noteOn({d1, d2 / 127.f, -1, (int16_t)e->port_index, (int16_t)(e->data[0] & 15)});
                else if (st == 0x80 || st == 0x90) noteOff(d1, -1);
                else if (st == 0xA0) forNote(-1, d1, [&](Voice& v) { v.pressT = d2 / 127.f; });
                else if (st == 0xD0) { chanPress = d1 / 127.f; for (auto& v : voices) if (v.active) v.pressT = chanPress;
#ifdef NB_FM6
                    csapi::pressure(chanPress);
#endif
                }
                else if (st == 0xE0) { bendNorm = ((int)(d1 | (d2 << 7)) - 8192) / 8192.f;
#ifdef NB_FM6
                    csapi::bend(bendNorm);
#endif
                }
                else if (st == 0xB0) {
                    if (d1 == 1) { modWheel = d2 / 127.f;
#ifdef NB_FM6
                        csapi::mod(modWheel);
#endif
                    }
                    else if (d1 == 64) setPedal(d2 >= 64);
                    else if (d1 == 123 || d1 == 120) { nStack = 0; setPedal(false);
#ifdef NB_FM6
                        csapi::choke();
#endif
 for (auto& v : voices) if (v.active) { v.released = true; v.env.off(); v.fenv.off(); } }
                }
                break;
            }
            case CLAP_EVENT_PARAM_VALUE: {
                auto* e = (const clap_event_param_value_t*)h;
                if (e->param_id < P_COUNT) {
                    const auto& d = kParams[e->param_id];
                    double nv = std::min(d.mx, std::max(d.mn, e->value));
                    double old = vals[e->param_id].exchange(nv);
                    if (e->param_id == P_SOUND && std::lround(old) != std::lround(nv)) applyPreset((int)std::lround(nv));
                    if (e->param_id == P_VOICE_MODE && std::lround(old) != std::lround(nv)) nStack = 0;
                }
                break;
            }
            default: break;
        }
    }

    // ------------------------------------------------------------ rendering
    inline void filterCoefs(Voice& v, const Ctl& c, float f, float extraOct, float& g, float& k) {
        float fc = c.cutoff * std::exp2(c.fenvAmt * 5.f * v.fenv.v * (0.6f + 0.4f * v.vel) + 0.5f * (v.key - 60) / 12.f +
                                        v.press * c.atBright * 3.f + (v.brightX - 0.5f) * 2.f + extraOct);
        fc = clampf(fc, 20.f, 0.45f * c.sr);
        g = std::tan(kPi * fc * c.isr);
        k = 1.4f - 1.3f * c.reso;
        (void)f;
    }

    void renderVoice(Voice& v, int n, const Ctl& c) {
        const float dtc = n * c.isr;
        // pitch: glide, vibrato, bend, per-note tuning
        v.curSemi += (v.tgtSemi - v.curSemi) * c.glideA;
        v.press += (v.pressT - v.press) * 0.06f;
        v.vibT += dtc;
        v.vibPh += c.vibRate * dtc; v.vibPh -= std::floor(v.vibPh);
        float ramp = c.vibDelay <= 0.01f ? 1.f : clampf((v.vibT - 0.5f * c.vibDelay) / (0.5f * c.vibDelay), 0.f, 1.f);
        float depth = c.vibDepth * 0.6f * ramp + c.modWheel * 0.6f + v.press * c.atVib * 0.7f;
        float semi = v.curSemi + v.tuning + c.bend + depth * sinTurns(v.vibPh);
        float f = clampf(440.f * std::exp2((semi - 69.f) / 12.f), 8.f, 0.45f * c.sr);
        const float velAmp = 0.35f + 0.65f * v.vel;
        const float eg = kEngineGain[v.engine];
        float g, k;
        const float ghp = std::tan(kPi * c.hp * c.isr), khp = 1.4f;
        v.hp1.set(ghp, khp);
        v.hp2.set(ghp, khp);
        float fSus = 0.35f;

        switch (v.engine) {
            case E_BRASS: {
                filterCoefs(v, c, f, 0.f, g, k);
                v.lp1.set(g, k);
                v.lp2.set(g, k);
                v.lfoPh += 0.3f * dtc; v.lfoPh -= std::floor(v.lfoPh);
                float pw = 0.5f + 0.22f * sinTurns(v.lfoPh);
                float dt1 = f * c.isr, dt2 = dt1 * (1.f + 0.006f * c.detune);
                float bal = c.chr;
                for (int i = 0; i < n; ++i) {
                    float t = v.ph[0];
                    float saw = 2.f * t - 1.f - blep(t, dt1);
                    float l1 = saw * c.bright + sinTurns(t) * (1.f - c.bright) * 1.2f;
                    float t2 = v.ph[1];
                    float t2b = t2 + 1.f - pw; t2b -= std::floor(t2b);
                    float l2 = ((t2 < pw ? 1.f : -1.f) + blep(t2, dt2) - blep(t2b, dt2)) * 0.8f;
                    v.ph[0] += dt1; if (v.ph[0] >= 1.f) v.ph[0] -= 1.f;
                    v.ph[1] += dt2; if (v.ph[1] >= 1.f) v.ph[1] -= 1.f;
                    float hpo, bpo;
                    float a1 = fastTanh(1.3f * l1), a2 = fastTanh(1.3f * l2);
                    if (c.hp > 21.f) { v.hp1.tick(a1, khp, hpo, bpo); a1 = hpo; v.hp2.tick(a2, khp, hpo, bpo); a2 = hpo; }
                    float y1 = v.lp1.tick(a1, k, hpo, bpo);
                    float y2 = v.lp2.tick(a2, k, hpo, bpo);
                    float x = 0.6f * (y1 * (1.f - bal) + y2 * bal) + 0.35f * y1 * y2 * c.detune;
                    v.fenv.next(c.fAInc, c.dCoef, fSus, c.rCoef);
                    float a = v.env.next(c.aInc, c.dCoef, c.sus, c.rCoef) * velAmp * eg;
                    tmpL[i] += x * a * v.gL;
                    tmpR[i] += x * a * v.gR;
                }
                break;
            }
            case E_LEAD: {
                filterCoefs(v, c, f, 0.f, g, k);
                v.lp1.set(g, k);
                float dt1 = f * c.isr, dt2 = dt1 * (1.f + 0.01f * c.detune);
                float pre = 1.f + 4.f * c.bright;
                for (int i = 0; i < n; ++i) {
                    float t = v.ph[0];
                    float saw = 2.f * t - 1.f - blep(t, dt1);
                    float tb = t + 0.5f; tb -= std::floor(tb);
                    float sq = (t < 0.5f ? 1.f : -1.f) + blep(t, dt1) - blep(tb, dt1);
                    float t2 = v.ph[1];
                    float saw2 = 2.f * t2 - 1.f - blep(t2, dt2);
                    v.ph[0] += dt1; if (v.ph[0] >= 1.f) v.ph[0] -= 1.f;
                    v.ph[1] += dt2; if (v.ph[1] >= 1.f) v.ph[1] -= 1.f;
                    float o = saw * (1.f - c.chr) + sq * c.chr + saw2 * c.detune * 0.8f;
                    o = fastTanh(o * pre * 0.5f);
                    float hpo, bpo;
                    if (c.hp > 21.f) { v.hp1.tick(o, khp, hpo, bpo); o = hpo; }
                    float x = 0.7f * v.lp1.tick(o, k, hpo, bpo);
                    v.fenv.next(c.fAInc, c.dCoef, fSus, c.rCoef);
                    float a = v.env.next(c.aInc, c.dCoef, c.sus, c.rCoef) * velAmp * eg;
                    tmpL[i] += x * a * v.gL;
                    tmpR[i] += x * a * v.gR;
                }
                break;
            }
            case E_BELLS: {
                filterCoefs(v, c, f, 0.f, g, k);
                v.lp1.set(g, k);
                float ratio = 1.3f + c.chr * 5.8f;
                float ringCoef = std::exp(-1.f / (std::max(0.02f, decaySec(c.decayRaw) * 0.4f) * c.sr));
                float dt0 = f * c.isr, dtm = f * ratio * c.isr, dtb = f * 2.76f * c.isr;
                float bright = c.bright + v.press * c.atBright * 0.5f;
                for (int i = 0; i < n; ++i) {
                    v.ringEnv *= ringCoef;
#ifdef NB_FM6
                    float car = (v.fm ? fm6api::next(v.fm) : 0.f) * 5.5f;
                    float mod = sinTurns(v.ph[1]);
                    float d = clampf(bright, 0.f, 1.f) * v.ringEnv * 0.35f;
                    float o = car * (1.f - d) + car * mod * d * 1.4f;
#else
                    float s = sinTurns(v.ph[0]);
                    float car = 0.6f * s + 0.4f * fastTanh(3.f * s);
                    float mod = sinTurns(v.ph[1]);
                    float d = clampf(bright, 0.f, 1.f) * v.ringEnv;
                    float o = car * (1.f - d) + car * mod * d * 1.4f + 0.25f * sinTurns(v.ph[2]) * v.ringEnv;
#endif
                    v.ph[0] += dt0; v.ph[0] -= std::floor(v.ph[0]);
                    v.ph[1] += dtm; v.ph[1] -= std::floor(v.ph[1]);
                    v.ph[2] += dtb; v.ph[2] -= std::floor(v.ph[2]);
                    float hpo, bpo;
                    float x = 0.8f * v.lp1.tick(o, k, hpo, bpo);
                    v.fenv.next(c.fAInc, c.dCoef, fSus, c.rCoef);
                    float a = v.env.next(c.aInc, c.dCoef, c.sus, c.rCoef) * velAmp * eg;
                    tmpL[i] += x * a * v.gL;
                    tmpR[i] += x * a * v.gR;
                }
                break;
            }
            case E_GRAND:
            case E_TIMPANI: {
                bool timp = v.engine == E_TIMPANI;
                filterCoefs(v, c, f, 0.f, g, k);
                v.lp1.set(g, 0.8f);
                // mode rotation coefficients for this chunk
                float fBase = f;
                if (timp) {
                    fBase *= 1.f + c.chr * 0.08f * v.dropEnv;
                    v.dropEnv *= std::exp(-dtc / 0.06f);
                }
                float cr[kMaxModes], si[kMaxModes];
                bool damped = v.released;
                for (int m = 0; m < v.nModes; ++m) {
                    float fm = fBase * v.mRatio[m];
                    if (fm >= 0.45f * c.sr) { cr[m] = si[m] = 0.f; continue; }
                    float t60 = damped ? std::min(v.mT60[m], timp ? 0.25f : 0.15f) : v.mT60[m];
                    float r = std::exp(-6.9078f / (t60 * c.sr));
                    float w = 2.f * kPi * fm * c.isr;
                    cr[m] = r * std::cos(w);
                    si[m] = r * std::sin(w);
                }
                float nCoef = std::exp(-1.f / ((timp ? 0.004f : 0.003f) * c.sr));
                float nfHz = clampf((timp ? 900.f : 2200.f) * (0.5f + c.bright), 200.f, 0.45f * c.sr);
                v.nf.set(std::tan(kPi * nfHz * c.isr), 1.2f);
                v.dcf.set(std::tan(kPi * 30.f * c.isr), 1.4f);
                float rumbleCoef = std::exp(-1.f / ((0.3f + 1.5f * c.chr) * c.sr));
                float rumbleA = 1.f - std::exp(-2.f * kPi * 90.f * c.isr);
                float bark = c.chr;
                for (int i = 0; i < n; ++i) {
                    float x = 0.f;
                    for (int m = 0; m < v.nModes; ++m) {
                        float re = v.mRe[m], im = v.mIm[m];
                        v.mRe[m] = re * cr[m] - im * si[m];
                        v.mIm[m] = re * si[m] + im * cr[m];
                        x += v.mIm[m];
                    }
                    v.noiseEnv *= nCoef;
                    float hpo, bpo;
                    float nz = v.rng.bi();
                    v.nf.tick(nz, 1.2f, hpo, bpo);
                    x += bpo * v.noiseEnv * (timp ? 0.5f : 0.25f) * v.vel;
                    if (timp) {
                        v.rumbleEnv *= rumbleCoef;
                        v.rumble += rumbleA * (nz - v.rumble);
                        x += v.rumble * v.rumbleEnv * c.chr * 3.f * v.vel;
                    } else {
                        // electric pickup: asymmetric bite, then DC removal
                        float y = x + bark * 0.9f * x * x;
                        y = fastTanh(y * (1.f + bark * 1.5f)) / (1.f + bark * 0.8f);
                        v.dcf.tick(y, 1.4f, hpo, bpo);
                        x = hpo;
                    }
                    x = v.lp1.tick(x, 0.8f, hpo, bpo);
                    float a = v.env.next(c.aInc, c.dCoef, 1.f, c.rCoef) * eg;
                    tmpL[i] += x * a * v.gL;
                    tmpR[i] += x * a * v.gR;
                }
                break;
            }
            case E_TINE: {
                filterCoefs(v, c, f, 0.f, g, k);
                v.lp1.set(g, k);
                v.dcf.set(std::tan(kPi * 25.f * c.isr), 1.4f);
                float fmCoef = std::exp(-1.f / ((0.25f + 1.2f * c.decayRaw) * c.sr));
                float pingCoef = std::exp(-1.f / (0.025f * c.sr));
                float idxBase = (0.3f + c.bright * 2.5f) * (0.4f + 0.6f * v.vel) * 0.159155f;
                float dt0 = f * c.isr, dtp = f * 14.1f * c.isr;
                if (dtp > 0.45f) dtp = 0.f;
                float bark = c.chr * 0.7f * v.vel;
                for (int i = 0; i < n; ++i) {
                    v.fmEnv *= fmCoef;
                    v.pingEnv *= pingCoef;
#ifdef NB_FM6
                    float car = (v.fm ? fm6api::next(v.fm) : 0.f) * 5.5f;
                    float ping = 0.f; (void)idxBase;
#else
                    float m = sinTurns(v.ph[0]);
                    float car = sinTurns(v.ph[0] + idxBase * (0.25f + 0.75f * v.fmEnv) * m);
                    float ping = dtp > 0.f ? sinTurns(v.ph[1]) * v.pingEnv * c.bright * 0.25f : 0.f;
#endif
                    v.ph[0] += dt0; v.ph[0] -= std::floor(v.ph[0]);
                    v.ph[1] += dtp; v.ph[1] -= std::floor(v.ph[1]);
                    float o = car + ping;
                    o = fastTanh(o + bark * o * o);
                    float hpo, bpo;
                    v.dcf.tick(o, 1.4f, hpo, bpo);
                    float x = 0.8f * v.lp1.tick(hpo, k, hpo, bpo);
                    float a = v.env.next(c.aInc, c.dCoef, c.sus, c.rCoef) * velAmp * eg;
                    tmpL[i] += x * a * v.gL;
                    tmpR[i] += x * a * v.gR;
                }
                break;
            }
            case E_ENSEMBLE: {
                filterCoefs(v, c, f, (c.bright - 0.5f) * 2.f, g, k);
                v.lp1.set(g, k);
                v.lfoPh += 0.11f * dtc; v.lfoPh -= std::floor(v.lfoPh);
                float morph = clampf(c.bright * 2.f + 0.35f * sinTurns(v.lfoPh), 0.f, 2.f);
                int i0 = std::min(1, (int)morph);
                float fr = morph - (float)i0;
                static const float kQ[3] = {9.f, 12.f, 14.f};
                float fg[3], fk[3];
                for (int j = 0; j < 3; ++j) {
                    float F = clampf(kVowelF[i0][j] + (kVowelF[i0 + 1][j] - kVowelF[i0][j]) * fr, 40.f, 0.45f * c.sr);
                    fg[j] = kVowelG[i0][j] + (kVowelG[i0 + 1][j] - kVowelG[i0][j]) * fr;
                    fk[j] = 1.f / kQ[j];
                    v.form[j].set(std::tan(kPi * F * c.isr), fk[j]);
                }
                float d = 0.001f + 0.006f * c.detune;
                float dt0 = f * c.isr, dt1 = dt0 * (1.f + d), dt2 = 2.f * dt0 * (1.f - 0.5f * d);
                float choir = c.chr;
                for (int i = 0; i < n; ++i) {
                    float s0 = 2.f * v.ph[0] - 1.f - blep(v.ph[0], dt0);
                    float s1 = 2.f * v.ph[1] - 1.f - blep(v.ph[1], dt1);
                    float s2 = 2.f * v.ph[2] - 1.f - blep(v.ph[2], dt2);
                    v.ph[0] += dt0; if (v.ph[0] >= 1.f) v.ph[0] -= 1.f;
                    v.ph[1] += dt1; if (v.ph[1] >= 1.f) v.ph[1] -= 1.f;
                    v.ph[2] += dt2; if (v.ph[2] >= 1.f) v.ph[2] -= 1.f;
                    float src = (s0 + s1 + 0.4f * s2) * 0.4f;
                    float y = 0.f;
                    if (choir > 0.001f) {
                        float in = src + 0.05f * v.rng.bi();
                        for (int j = 0; j < 3; ++j) y += fg[j] * fk[j] * v.form[j].bp(in);
                        y *= 2.2f;
                    }
                    float o = src * (1.f - choir) + y * choir;
                    float hpo, bpo;
                    if (c.hp > 21.f) { v.hp1.tick(o, khp, hpo, bpo); o = hpo; }
                    float x = 0.9f * v.lp1.tick(o, k, hpo, bpo);
                    v.fenv.next(c.fAInc, c.dCoef, fSus, c.rCoef);
                    float a = v.env.next(c.aInc, c.dCoef, c.sus, c.rCoef) * velAmp * eg;
                    tmpL[i] += x * a * v.gL;
                    tmpR[i] += x * a * v.gR;
                }
                break;
            }
        }
        if (v.env.st == 0) {
            v.active = false;
            pushNoteEnd(v);
        }
    }

    void renderChunk(uint32_t pos, int n, float* outL, float* outR) {
        curPos = pos;
        const float chunkA = 1.f - std::exp(-(float)n / (0.02f * sr));
        auto sm = [&](float& s, float t) { s += (t - s) * chunkA; };
        sm(sCut, p(P_CUTOFF));
        sm(sVol, std::pow(10.f, p(P_VOLUME) / 20.f));
        sm(sEns, p(P_ENSEMBLE));
        sm(sDly, p(P_DLY_MIX));
        sm(sVerb, p(P_VERB_MIX));
        sm(sDrive, p(P_DRIVE));
        sm(sPre, predelayMs(p(P_PREDELAY)) * 0.001f * sr);

        Ctl c;
        c.sr = sr;
        c.isr = 1.f / sr;
        c.bright = p(P_BRIGHT);
        c.chr = p(P_CHAR);
        c.detune = p(P_DETUNE);
        c.cutoff = cutoffHz(sCut);
        c.reso = p(P_RESO);
        c.hp = hpHz(p(P_HPF));
        c.fenvAmt = p(P_FENV);
        c.decayRaw = p(P_DECAY);
        float att = attackSec(p(P_ATTACK));
        c.aInc = 1.f / (att * sr);
        c.fAInc = 1.f / (std::max(att * 1.3f, 0.04f) * sr);
        c.dCoef = std::exp(-6.9f / (decaySec(p(P_DECAY)) * sr));
        c.sus = p(P_SUSTAIN);
        c.rCoef = std::exp(-6.9f / (releaseSec(p(P_RELEASE)) * sr));
        float gs = glideSec(p(P_GLIDE));
        c.glideA = gs <= 0.f ? 1.f : 1.f - std::exp(-(float)n / (gs * sr));
        c.bend = bendNorm * (float)pi(P_BEND);
        c.vibRate = vibHz(p(P_VIB_RATE));
        c.vibDepth = p(P_VIB_DEPTH);
        c.vibDelay = vibDelaySec(p(P_VIB_DELAY));
        c.atBright = p(P_AT_BRIGHT);
        c.atVib = p(P_AT_VIB);
        c.modWheel = modWheel;

        for (int i = 0; i < n; ++i) tmpL[i] = tmpR[i] = 0.f;
        for (auto& v : voices)
            if (v.active) renderVoice(v, n, c);
#ifdef NB_FM6
        // CS Brass and CS Lead: Duet 80's voice, Nebula's knobs as offsets from its patch (the factory sounds' settings
        // leave it as the patch is)
        if (isCS() || csapi::active()) {
            const bool lead = pi(P_ENGINE) == E_LEAD;
            const float bc = lead ? .55f : .38f, bb = lead ? .6f : .55f, br = lead ? .3f : .2f, ba = lead ? .1f : .42f, brl = lead ? .45f : .5f, bs = lead ? .9f : .75f, bd = lead ? .15f : .35f, bch = lead ? .3f : .5f;
            csapi::knobs((p(P_CUTOFF) - bc) * 1.6f + (p(P_BRIGHT) - bb) * 0.8f, (p(P_RESO) - br) * 1.8f, (p(P_ATTACK) - ba) * 0.9f,
                         (p(P_RELEASE) - brl) * 0.9f, bs > 0.f ? p(P_SUSTAIN) / bs : 1.f, (p(P_DETUNE) - bd) * 0.5f, (p(P_CHAR) - bch) * 0.8f, p(P_AT_VIB), p(P_GLIDE) * 0.8f, 0.7f);
            csapi::process(csL, csR, n);
            for (int i = 0; i < n; ++i) { tmpL[i] += csL[i] * 4.0f; tmpR[i] += csR[i] * 4.0f; }
        }
#endif

        float drivePre = 1.f + sDrive * 10.f, driveComp = 1.f / (1.f + sDrive * 2.f);
        float dlyT = (float)(kDlyBeats[std::min(5, std::max(0, pi(P_DLY_TIME)))] * 60.0 / tempo * sr);
        float dlyFb = p(P_DLY_FB);
        verb.setSize(p(P_VERB_SIZE));
        for (int i = 0; i < n; ++i) {
            float L = tmpL[i], R = tmpR[i];
            if (sDrive > 1e-3f) {
                L = std::tanh(L * drivePre) * driveComp;
                R = std::tanh(R * drivePre) * driveComp;
            }
            float wL, wR;
            ens.process(0.5f * (L + R), wL, wR);
            L = L * (1.f - 0.5f * sEns) + wL * sEns * 1.2f;
            R = R * (1.f - 0.5f * sEns) + wR * sEns * 1.2f;
            dly.process(L, R, sDly, dlyT, dlyFb);
            preL.write(L);
            preR.write(R);
            float pd = std::max(1.f, sPre);
            float vL, vR;
            verb.process(preL.tap(pd), preR.tap(pd), vL, vR);
            L = L * (1.f - 0.4f * sVerb) + vL * sVerb;
            R = R * (1.f - 0.4f * sVerb) + vR * sVerb;
            outL[i] = std::tanh(L * sVol);
            outR[i] = std::tanh(R * sVol);
        }
    }

    clap_process_status process(const clap_process_t* proc) {
#ifdef NEB_HAS_SSE
        unsigned int oldCsr = _mm_getcsr();
        _mm_setcsr(oldCsr | 0x8040);
#endif
        out = proc->out_events;
        const uint32_t frames = proc->frames_count;
        if (proc->transport && (proc->transport->flags & CLAP_TRANSPORT_HAS_TEMPO))
            tempo = std::max(20.0, std::min(400.0, proc->transport->tempo));

        float* outL = nullptr;
        float* outR = nullptr;
        if (proc->audio_outputs_count > 0 && proc->audio_outputs[0].data32) {
            outL = proc->audio_outputs[0].data32[0];
            outR = proc->audio_outputs[0].channel_count > 1 ? proc->audio_outputs[0].data32[1] : nullptr;
        }
        float scratchR[kChunk];
        const clap_input_events_t* in = proc->in_events;
        const uint32_t nev = in ? in->size(in) : 0;
        uint32_t ei = 0, pos = 0;
        while (pos < frames) {
            curPos = pos;
            while (ei < nev) {
                const clap_event_header_t* h = in->get(in, ei);
                if (h->time > pos) break;
                handleEvent(h);
                ++ei;
            }
            uint32_t next = frames;
            if (ei < nev) next = std::min(next, in->get(in, ei)->time);
            next = std::min(next, pos + (uint32_t)kChunk);
            if (next <= pos) next = pos + 1;
            if (outL) renderChunk(pos, (int)(next - pos), outL + pos, outR ? outR + pos : scratchR);
            pos = next;
        }
        curPos = frames ? frames - 1 : 0;
        while (ei < nev) handleEvent(in->get(in, ei++));
        out = nullptr;
#ifdef NEB_HAS_SSE
        _mm_setcsr(oldCsr);
#endif
        return CLAP_PROCESS_CONTINUE;
    }
};

// ==================================================================== CLAP glue
static const char* const kFeatures[] = {CLAP_PLUGIN_FEATURE_INSTRUMENT, CLAP_PLUGIN_FEATURE_SYNTHESIZER,
                                        CLAP_PLUGIN_FEATURE_STEREO, nullptr};
static const clap_plugin_descriptor_t kDesc = {
    CLAP_VERSION_INIT, "com.nathan.nebula80", "Nebula 80", "Nathan", "", "", "", "0.1.0",
    "CS-80 brass and leads, ring bells, electric grand, tine piano, ensemble and timpani with a big hall",
    kFeatures,
};

static Plugin* self(const clap_plugin_t* p) { return (Plugin*)p->plugin_data; }

static uint32_t params_count(const clap_plugin_t*) { return P_COUNT; }
static bool params_get_info(const clap_plugin_t*, uint32_t index, clap_param_info_t* info) {
    if (index >= P_COUNT) return false;
    const ParamDef& d = kParams[index];
    std::memset(info, 0, sizeof(*info));
    info->id = d.id;
    info->flags = CLAP_PARAM_IS_AUTOMATABLE;
    if (d.unit == U_ENUM || d.unit == U_INT) info->flags |= CLAP_PARAM_IS_STEPPED;
    if (d.unit == U_ENUM) info->flags |= CLAP_PARAM_IS_ENUM;
    std::snprintf(info->name, CLAP_NAME_SIZE, "%s", d.name);
    std::snprintf(info->module, CLAP_PATH_SIZE, "%s", d.module);
    info->min_value = d.mn;
    info->max_value = d.mx;
    info->default_value = defaultOf(d.id);
    return true;
}
static bool params_get_value(const clap_plugin_t* plugin, clap_id id, double* outv) {
    if (id >= P_COUNT) return false;
    *outv = self(plugin)->vals[id].load();
    return true;
}
static void fmtTime(char* buf, uint32_t size, float sec) {
    if (sec < 0.01f) std::snprintf(buf, size, "%.1f ms", sec * 1000.f);
    else if (sec < 1.f) std::snprintf(buf, size, "%.0f ms", sec * 1000.f);
    else std::snprintf(buf, size, "%.2f s", sec);
}
static void fmtHz(char* buf, uint32_t size, float hz) {
    if (hz < 1000.f) std::snprintf(buf, size, "%.0f Hz", hz);
    else std::snprintf(buf, size, "%.2f kHz", hz / 1000.f);
}
static bool params_value_to_text(const clap_plugin_t*, clap_id id, double value, char* buf, uint32_t size) {
    if (id >= P_COUNT) return false;
    const ParamDef& d = kParams[id];
    float v = (float)value;
    switch (d.unit) {
        case U_PCT: std::snprintf(buf, size, "%.0f %%", v * 100.f); break;
        case U_HZ: fmtHz(buf, size, cutoffHz(v)); break;
        case U_HPHZ: if (v < 0.005f) std::snprintf(buf, size, "Off"); else fmtHz(buf, size, hpHz(v)); break;
        case U_TIME_A: fmtTime(buf, size, attackSec(v)); break;
        case U_TIME_D: fmtTime(buf, size, decaySec(v)); break;
        case U_TIME_R: fmtTime(buf, size, releaseSec(v)); break;
        case U_GLIDE: if (v < 0.001f) std::snprintf(buf, size, "Off"); else fmtTime(buf, size, glideSec(v)); break;
        case U_VIBHZ: std::snprintf(buf, size, "%.1f Hz", vibHz(v)); break;
        case U_VIBDEL: fmtTime(buf, size, vibDelaySec(v)); break;
        case U_PREDLY: std::snprintf(buf, size, "%.0f ms", predelayMs(v)); break;
        case U_DB: std::snprintf(buf, size, "%.1f dB", v); break;
        case U_ENUM: {
            int i = std::max(0, std::min((int)std::lround(value), (int)d.mx));
            std::snprintf(buf, size, "%s", d.labels[i]);
            break;
        }
        case U_INT: std::snprintf(buf, size, "%d st", (int)std::lround(value)); break;
    }
    return true;
}
static bool params_text_to_value(const clap_plugin_t*, clap_id id, const char* text, double* outv) {
    if (id >= P_COUNT || !text) return false;
    const ParamDef& d = kParams[id];
    if (d.unit == U_ENUM) {
        for (int i = 0; i <= (int)d.mx; ++i)
            if (strcasecmp(text, d.labels[i]) == 0) { *outv = i; return true; }
    }
    if (!strcasecmp(text, "off") && (d.unit == U_GLIDE || d.unit == U_HPHZ)) { *outv = 0; return true; }
    char* end = nullptr;
    double x = std::strtod(text, &end);
    if (end == text) return false;
    bool ms = std::strstr(text, "ms") != nullptr;
    bool kk = std::strchr(text, 'k') || std::strchr(text, 'K');
    double sec = ms ? x / 1000.0 : x;
    double v = x;
    switch (d.unit) {
        case U_PCT: v = x / 100.0; break;
        case U_HZ: v = std::log(std::max(30.0, x * (kk ? 1000.0 : 1.0)) / 30.0) / std::log(600.0); break;
        case U_HPHZ: v = std::log(std::max(20.0, x * (kk ? 1000.0 : 1.0)) / 20.0) / std::log(100.0); break;
        case U_TIME_A: v = std::log(std::max(1e-3, sec) / 0.001) / std::log(4000.0); break;
        case U_TIME_D: v = std::log(std::max(5e-3, sec) / 0.005) / std::log(1600.0); break;
        case U_TIME_R: v = std::log(std::max(1e-2, sec) / 0.01) / std::log(1000.0); break;
        case U_GLIDE: v = sec <= 0 ? 0 : std::log(std::max(5e-3, sec) / 0.005) / std::log(600.0); break;
        case U_VIBHZ: v = (x - 2.0) / 8.0; break;
        case U_VIBDEL: v = sec / 2.0; break;
        case U_PREDLY: v = x / 150.0; break;
        default: break;
    }
    *outv = std::min(d.mx, std::max(d.mn, v));
    return true;
}
static void params_flush(const clap_plugin_t* plugin, const clap_input_events_t* in, const clap_output_events_t* outEv) {
    Plugin* pl = self(plugin);
    if (!in) return;
    pl->out = outEv;
    pl->curPos = 0;
    uint32_t n = in->size(in);
    for (uint32_t i = 0; i < n; ++i) {
        const clap_event_header_t* h = in->get(in, i);
        if (h->space_id == CLAP_CORE_EVENT_SPACE_ID && h->type == CLAP_EVENT_PARAM_VALUE) pl->handleEvent(h);
    }
    pl->out = nullptr;
}
static const clap_plugin_params_t kParamsExt = {params_count, params_get_info, params_get_value,
                                                params_value_to_text, params_text_to_value, params_flush};

static bool writeAll(const clap_ostream_t* s, const void* data, uint64_t size) {
    const uint8_t* p = (const uint8_t*)data;
    while (size) {
        int64_t w = s->write(s, p, size);
        if (w <= 0) return false;
        p += w;
        size -= (uint64_t)w;
    }
    return true;
}
static bool readAll(const clap_istream_t* s, void* data, uint64_t size) {
    uint8_t* p = (uint8_t*)data;
    while (size) {
        int64_t r = s->read(s, p, size);
        if (r <= 0) return false;
        p += r;
        size -= (uint64_t)r;
    }
    return true;
}
static const uint32_t kMagic = 0x4E454230;  // 'NEB0'
static bool state_save(const clap_plugin_t* plugin, const clap_ostream_t* s) {
    Plugin* pl = self(plugin);
    uint32_t hdr[3] = {kMagic, 1, P_COUNT};
    if (!writeAll(s, hdr, sizeof(hdr))) return false;
    for (uint32_t i = 0; i < P_COUNT; ++i) {
        double v = pl->vals[i].load();
        if (!writeAll(s, &i, sizeof(i)) || !writeAll(s, &v, sizeof(v))) return false;
    }
    return true;
}
static bool state_load(const clap_plugin_t* plugin, const clap_istream_t* s) {
    Plugin* pl = self(plugin);
    uint32_t hdr[3];
    if (!readAll(s, hdr, sizeof(hdr)) || hdr[0] != kMagic) return false;
    for (uint32_t n = 0; n < hdr[2]; ++n) {
        uint32_t id;
        double v;
        if (!readAll(s, &id, sizeof(id)) || !readAll(s, &v, sizeof(v))) return false;
        if (id < P_COUNT) pl->vals[id].store(std::min(kParams[id].mx, std::max(kParams[id].mn, v)));
    }
    if (pl->hostParams) pl->hostParams->rescan(pl->host, CLAP_PARAM_RESCAN_VALUES);
    return true;
}
static const clap_plugin_state_t kStateExt = {state_save, state_load};

static uint32_t audio_ports_count(const clap_plugin_t*, bool isInput) { return isInput ? 0 : 1; }
static bool audio_ports_get(const clap_plugin_t*, uint32_t index, bool isInput, clap_audio_port_info_t* info) {
    if (isInput || index != 0) return false;
    info->id = 0;
    std::snprintf(info->name, CLAP_NAME_SIZE, "Output");
    info->flags = CLAP_AUDIO_PORT_IS_MAIN;
    info->channel_count = 2;
    info->port_type = CLAP_PORT_STEREO;
    info->in_place_pair = CLAP_INVALID_ID;
    return true;
}
static const clap_plugin_audio_ports_t kAudioPortsExt = {audio_ports_count, audio_ports_get};
static uint32_t note_ports_count(const clap_plugin_t*, bool isInput) { return isInput ? 1 : 0; }
static bool note_ports_get(const clap_plugin_t*, uint32_t index, bool isInput, clap_note_port_info_t* info) {
    if (!isInput || index != 0) return false;
    info->id = 0;
    info->supported_dialects = CLAP_NOTE_DIALECT_CLAP | CLAP_NOTE_DIALECT_MIDI;
    info->preferred_dialect = CLAP_NOTE_DIALECT_CLAP;
    std::snprintf(info->name, CLAP_NAME_SIZE, "Notes");
    return true;
}
static const clap_plugin_note_ports_t kNotePortsExt = {note_ports_count, note_ports_get};

static bool plugin_init(const clap_plugin_t* plugin) {
    Plugin* pl = self(plugin);
    pl->hostParams = (const clap_host_params_t*)pl->host->get_extension(pl->host, CLAP_EXT_PARAMS);
    return true;
}
static void plugin_destroy(const clap_plugin_t* plugin) { delete self(plugin); }
static bool plugin_activate(const clap_plugin_t* plugin, double sr, uint32_t, uint32_t) {
    self(plugin)->activate(sr);
    return true;
}
static void plugin_deactivate(const clap_plugin_t*) {}
static bool plugin_start_processing(const clap_plugin_t*) { return true; }
static void plugin_stop_processing(const clap_plugin_t*) {}
static void plugin_reset(const clap_plugin_t* plugin) { self(plugin)->resetState(); }
static clap_process_status plugin_process(const clap_plugin_t* plugin, const clap_process_t* proc) {
    return self(plugin)->process(proc);
}
static const void* plugin_get_extension(const clap_plugin_t*, const char* id) {
    if (!std::strcmp(id, CLAP_EXT_PARAMS)) return &kParamsExt;
    if (!std::strcmp(id, CLAP_EXT_STATE)) return &kStateExt;
    if (!std::strcmp(id, CLAP_EXT_AUDIO_PORTS)) return &kAudioPortsExt;
    if (!std::strcmp(id, CLAP_EXT_NOTE_PORTS)) return &kNotePortsExt;
    return nullptr;
}
static void plugin_on_main_thread(const clap_plugin_t*) {}

static const clap_plugin_t* createPlugin(const clap_host_t* host) {
    Plugin* pl = new (std::nothrow) Plugin();
    if (!pl) return nullptr;
    pl->host = host;
    pl->clap.desc = &kDesc;
    pl->clap.plugin_data = pl;
    pl->clap.init = plugin_init;
    pl->clap.destroy = plugin_destroy;
    pl->clap.activate = plugin_activate;
    pl->clap.deactivate = plugin_deactivate;
    pl->clap.start_processing = plugin_start_processing;
    pl->clap.stop_processing = plugin_stop_processing;
    pl->clap.reset = plugin_reset;
    pl->clap.process = plugin_process;
    pl->clap.get_extension = plugin_get_extension;
    pl->clap.on_main_thread = plugin_on_main_thread;
    return &pl->clap;
}

static uint32_t factory_count(const clap_plugin_factory_t*) { return 1; }
static const clap_plugin_descriptor_t* factory_desc(const clap_plugin_factory_t*, uint32_t i) {
    return i == 0 ? &kDesc : nullptr;
}
static const clap_plugin_t* factory_create(const clap_plugin_factory_t*, const clap_host_t* host, const char* id) {
    if (!clap_version_is_compatible(host->clap_version) || std::strcmp(id, kDesc.id)) return nullptr;
    return createPlugin(host);
}
static const clap_plugin_factory_t kFactory = {factory_count, factory_desc, factory_create};
static bool entry_init(const char*) { return true; }
static void entry_deinit() {}
static const void* entry_get_factory(const char* id) {
    return std::strcmp(id, CLAP_PLUGIN_FACTORY_ID) == 0 ? &kFactory : nullptr;
}

}  // namespace neb

extern "C" CLAP_EXPORT const clap_plugin_entry_t clap_entry = {
    CLAP_VERSION_INIT, neb::entry_init, neb::entry_deinit, neb::entry_get_factory};
