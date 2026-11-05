// Hypnagogia — a CLAP synth for hypnagogic, OPN-flavoured sound design.
// Engines: Juno Arp, Vapor Choir, Glass FM, Harpsichord, Drone.
// FX: Drive, Lo-Fi, Juno chorus, tape wobble/slowdown, Echo Jam loop/freeze,
//     ping-pong delay, FDN reverb. Built-in tempo-synced arpeggiator.
#include <clap/clap.h>

#include <atomic>
#include <climits>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>
#include <strings.h>

#include "dsp.h"
#ifdef NB_FM6
#include "fm6api.h"   // (Nate Bloom build 229) Glass FM on a 6-operator FM voice
#endif

#if defined(__x86_64__) || defined(__SSE__)
#include <xmmintrin.h>
#define HYP_HAS_SSE 1
#endif

namespace hyp {

constexpr int kMaxVoices = 16;
constexpr int kChunk = 16;
constexpr int kStrings = 3;

enum Engine { E_JUNO = 0, E_CHOIR, E_FM, E_HARP, E_DRONE, E_COUNT };

enum ParamId : clap_id {
    P_ENGINE = 0, P_TONE, P_MOTION, P_SPREAD,
    P_CUTOFF, P_RESO,
    P_ATTACK, P_DECAY, P_SUSTAIN, P_RELEASE,
    P_ARP_MODE, P_ARP_RATE, P_ARP_OCT, P_ARP_GATE,
    P_CHORUS, P_WOBBLE, P_SLOWDOWN, P_LOFI, P_DRIVE,
    P_JAM_MIX, P_JAM_LEN, P_JAM_FREEZE,
    P_DLY_MIX, P_DLY_TIME, P_DLY_FB,
    P_VERB_MIX, P_VERB_SIZE,
    P_VOLUME,
    P_COUNT
};

enum Unit { U_PCT, U_HZ, U_TIME_A, U_TIME_D, U_TIME_R, U_DB, U_ENUM, U_INT, U_SEMI };

static const char* const kEngineLabels[] = {"Juno Arp", "Vapor Choir", "Glass FM", "Harpsichord", "Drone"};
static const char* const kArpModeLabels[] = {"Off", "Up", "Down", "Up/Down", "Random", "As Played"};
static const char* const kArpRateLabels[] = {"1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"};
static const double kArpRateBeats[] = {1.0, 0.5, 1.0 / 3.0, 0.25, 1.0 / 6.0, 0.125};
static const char* const kChorusLabels[] = {"Off", "I", "II", "I+II"};
static const char* const kJamLenLabels[] = {"1/16", "1/8", "1/4", "1/2", "1 bar", "2 bars"};
static const double kJamLenBeats[] = {0.25, 0.5, 1.0, 2.0, 4.0, 8.0};
static const char* const kDlyLabels[] = {"1/16", "1/8", "1/8 dot", "1/4", "1/4 dot", "1/2"};
static const double kDlyBeats[] = {0.25, 0.5, 0.75, 1.0, 1.5, 2.0};
static const char* const kOffOn[] = {"Off", "On"};

struct ParamDef {
    clap_id id;
    const char* name;
    const char* module;
    double mn, mx, def;
    Unit unit;
    const char* const* labels;
};

static const ParamDef kParams[P_COUNT] = {
    {P_ENGINE, "Engine", "Voice", 0, 4, 0, U_ENUM, kEngineLabels},
    {P_TONE, "Tone", "Voice", 0, 1, 0.5, U_PCT, nullptr},
    {P_MOTION, "Motion", "Voice", 0, 1, 0.4, U_PCT, nullptr},
    {P_SPREAD, "Spread", "Voice", 0, 1, 0.35, U_PCT, nullptr},
    {P_CUTOFF, "Cutoff", "Filter", 0, 1, 0.72, U_HZ, nullptr},
    {P_RESO, "Resonance", "Filter", 0, 1, 0.2, U_PCT, nullptr},
    {P_ATTACK, "Attack", "Envelope", 0, 1, 0.05, U_TIME_A, nullptr},
    {P_DECAY, "Decay", "Envelope", 0, 1, 0.5, U_TIME_D, nullptr},
    {P_SUSTAIN, "Sustain", "Envelope", 0, 1, 0.7, U_PCT, nullptr},
    {P_RELEASE, "Release", "Envelope", 0, 1, 0.45, U_TIME_R, nullptr},
    {P_ARP_MODE, "Arp Mode", "Arp", 0, 5, 0, U_ENUM, kArpModeLabels},
    {P_ARP_RATE, "Arp Rate", "Arp", 0, 5, 3, U_ENUM, kArpRateLabels},
    {P_ARP_OCT, "Arp Octaves", "Arp", 1, 4, 2, U_INT, nullptr},
    {P_ARP_GATE, "Arp Gate", "Arp", 0.05, 1, 0.6, U_PCT, nullptr},
    {P_CHORUS, "Chorus", "FX", 0, 3, 1, U_ENUM, kChorusLabels},
    {P_WOBBLE, "Tape Wobble", "FX", 0, 1, 0.15, U_PCT, nullptr},
    {P_SLOWDOWN, "Slowdown", "FX", 0, 1, 0, U_SEMI, nullptr},
    {P_LOFI, "Lo-Fi", "FX", 0, 1, 0, U_PCT, nullptr},
    {P_DRIVE, "Drive", "FX", 0, 1, 0, U_PCT, nullptr},
    {P_JAM_MIX, "Echo Jam", "Echo Jam", 0, 1, 0, U_PCT, nullptr},
    {P_JAM_LEN, "Jam Length", "Echo Jam", 0, 5, 2, U_ENUM, kJamLenLabels},
    {P_JAM_FREEZE, "Jam Freeze", "Echo Jam", 0, 1, 0, U_ENUM, kOffOn},
    {P_DLY_MIX, "Delay Mix", "Delay", 0, 1, 0.2, U_PCT, nullptr},
    {P_DLY_TIME, "Delay Time", "Delay", 0, 5, 2, U_ENUM, kDlyLabels},
    {P_DLY_FB, "Delay Feedback", "Delay", 0, 0.95, 0.45, U_PCT, nullptr},
    {P_VERB_MIX, "Reverb Mix", "Reverb", 0, 1, 0.3, U_PCT, nullptr},
    {P_VERB_SIZE, "Reverb Size", "Reverb", 0, 1, 0.55, U_PCT, nullptr},
    {P_VOLUME, "Volume", "Output", -36, 6, -6, U_DB, nullptr},
};

inline float cutoffHz(float v) { return 30.f * std::pow(600.f, v); }       // 30 Hz .. 18 kHz
inline float attackSec(float v) { return 0.001f * std::pow(4000.f, v); }   // 1 ms .. 4 s
inline float decaySec(float v) { return 0.005f * std::pow(1600.f, v); }    // 5 ms .. 8 s
inline float releaseSec(float v) { return 0.01f * std::pow(1000.f, v); }   // 10 ms .. 10 s

// Vowel formants (U O A E I: dark -> bright), Hz and linear gains
static const float kVowelF[5][3] = {
    {325, 700, 2530}, {450, 800, 2830}, {800, 1150, 2900}, {400, 1600, 2700}, {290, 2250, 3000}};
static const float kVowelG[5][3] = {
    {1.f, 0.25f, 0.06f}, {1.f, 0.35f, 0.10f}, {1.f, 0.55f, 0.15f}, {1.f, 0.35f, 0.20f}, {1.f, 0.20f, 0.18f}};
static const float kFmRatios[8] = {0.5f, 1.f, 2.f, 3.f, 3.5f, 4.f, 5.19f, 7.13f};
static const float kEngineGain[E_COUNT] = {1.4f, 2.0f, 0.7f, 1.25f, 1.8f};

struct Ctl {
    float sr, isr;
    float tone, motion, spread, cutoff, reso, decayRaw;
    float aInc, dCoef, sus, rCoef;
    float pitch;
};

struct Voice {
    bool active = false, released = false, fromArp = false;
    int key = 60, engine = 0;
    float vel = 1.f;
    uint64_t age = 0;
    float gL = 0.707f, gR = 0.707f;
    Env env;
    Ladder lad;
    Rng rng;
    float ph[4] = {0, 0, 0, 0};
    float subPh = 0, lfoPh = 0, vibPh = 0, slowPh = 0;
    float driftCur = 0, driftTgt = 0;
    int driftCnt = 0;
    SVF form[3];
    float fmEnv = 1.f, fbPrev = 0.f;
#ifdef NB_FM6
    fm6api::V *fm = nullptr;
    // (229) the choir's singers: glottal phase, vibrato phase and rate, jitter; the harpsichord's body and release thunk
    float gph[3] = {0, 0, 0}, gvib[3] = {0, 0, 0}, gvr[3] = {5.f, 5.f, 5.f}, gjit[3] = {0, 0, 0};
    SVF form4, body[2]; float thunk = 0.f, apz[3] = {0, 0, 0}, apx[3] = {0, 0, 0};
#endif
    std::vector<float> ks[kStrings];
    int ksMask = 0, ksW = 0;
    float ksLast[kStrings] = {0, 0, 0};
    std::vector<float> exc;
    int excLen = 0, excPos = 0;
    SVF res[4];
    float resDrift[4] = {0, 0, 0, 0}, resDriftT[4] = {0, 0, 0, 0};

    inline float ksTap(int j, float d) const {
        int i = (int)d;
        float fr = d - (float)i;
        const float* b = ks[j].data();
        float a = b[(ksW - i) & ksMask];
        float c = b[(ksW - i - 1) & ksMask];
        return a + (c - a) * fr;
    }
};

struct Held {
    int key;
    float vel;
    uint64_t order;
};

struct Plugin {
    clap_plugin_t clap;
    const clap_host_t* host = nullptr;
    const clap_host_params_t* hostParams = nullptr;
    std::atomic<double> vals[P_COUNT];

    float sr = 48000.f;
    Voice voices[kMaxVoices];
    uint64_t ageCounter = 0;
    Rng rng;
    float bend = 0.f;

    Held held[128];
    int nHeld = 0;
    uint64_t heldOrder = 0;
    bool arpWasOn = false, arpFirst = false;
    int64_t lastStep = LLONG_MIN;
    int arpIdx = 0, arpKey = -1, arpGateLeft = 0;
    double freeBeat = 0, tempo = 120, songBeat = 0;
    bool playing = false;

    JunoChorus chorus;
    Tape tape;
    EchoJam jam;
    PingPong dly;
    Reverb verb;
    float holdL = 0, holdR = 0, holdPh = 0;
    float sJam = 0, sDly = 0, sVerb = 0, sVol = 0.5f, sDrive = 0, sLofi = 0, sWob = 0, sChorus = 0, sSlow = 0, sCut = 0.72f;
    int chorusMode = 1;
    float tmpL[kChunk], tmpR[kChunk];

    Plugin() {
        for (int i = 0; i < (int)P_COUNT; ++i) vals[i].store(kParams[i].def);
    }

    inline float p(int id) const { return (float)vals[id].load(std::memory_order_relaxed); }
    inline int pi(int id) const { return (int)std::lround(vals[id].load(std::memory_order_relaxed)); }

    // ---------------------------------------------------------------- lifecycle
    void activate(double sampleRate) {
        sr = (float)sampleRate;
#ifdef NB_FM6
        fm6api::setup(sr);
        for (auto &vv : voices) if (!vv.fm) vv.fm = fm6api::make();
#endif
        int ksSize = 1;
        while (ksSize < (int)(sr / 4.f) + 16) ksSize <<= 1;
        for (auto& v : voices) {
            for (int j = 0; j < kStrings; ++j) v.ks[j].assign(ksSize, 0.f);
            v.exc.assign(ksSize, 0.f);
            v.ksMask = ksSize - 1;
            v.active = false;
        }
        chorus.init(sr);
        tape.init(sr);
        jam.init(sr);
        dly.init(sr);
        verb.init(sr);
        resetState();
    }

    void resetState() {
        for (int i = 0; i < kMaxVoices; ++i) {
            voices[i].active = false;
            voices[i].rng.s = 0x1234567u + 7919u * (uint32_t)i;
        }
        chorus.clear();
        tape.clear();
        jam.clear();
        dly.clear();
        verb.clear();
        nHeld = 0;
        arpKey = -1;
        arpFirst = false;
        lastStep = LLONG_MIN;
        bend = 0;
    }

    // ---------------------------------------------------------------- voices
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

    void startVoice(int key, float vel, bool fromArp) {
        Voice& v = *allocVoice();
        v.active = true;
        v.released = false;
        v.fromArp = fromArp;
        v.key = key;
        v.vel = vel;
        v.age = ++ageCounter;
        v.engine = pi(P_ENGINE);
        if (v.engine < 0 || v.engine >= E_COUNT) v.engine = 0;
        float spread = p(P_SPREAD);
        float pan = clampf(spread * 0.8f * v.rng.bi(), -1.f, 1.f);
        v.gL = std::sqrt(0.5f * (1.f - pan));
        v.gR = std::sqrt(0.5f * (1.f + pan));
        v.env.on();
        v.lad.reset();
        v.lfoPh = v.rng.uni();
        v.vibPh = v.rng.uni();
        v.slowPh = v.rng.uni();
        v.driftCur = v.driftTgt = 0;
        v.driftCnt = 0;
        v.fmEnv = 1.f;
        v.fbPrev = 0.f;
        switch (v.engine) {
            case E_JUNO:
                v.ph[0] = 0.f; v.ph[1] = v.rng.uni(); v.subPh = 0.f;
                break;
            case E_CHOIR:
                for (int j = 0; j < 4; ++j) v.ph[j] = v.rng.uni();
                for (auto& f : v.form) f.reset();
#ifdef NB_FM6
                for (int j = 0; j < 3; ++j) { v.gph[j] = v.rng.uni(); v.gvib[j] = v.rng.uni(); v.gvr[j] = 4.6f + 1.2f * v.rng.uni(); v.gjit[j] = 0.f; }
                v.form4.reset();
#endif
                break;
            case E_FM:
                v.ph[0] = v.ph[1] = v.ph[2] = v.ph[3] = 0.f;
#ifdef NB_FM6
                // Tone picks the patch (tine, E. piano, glass bells, tubular bells), Motion the modulators' level
                if (v.fm) fm6api::start(v.fm, std::min(3, std::max(0, (int)std::lround(p(P_TONE) * 3.f))), key,
                                        std::max(1, std::min(127, (int)std::lround(vel * 127.f))), 0.3f + 0.7f * p(P_MOTION), 0.4f + 2.f * p(P_DECAY), 0.8f);
#endif
                break;
            case E_HARP: {
                for (int j = 0; j < kStrings; ++j) {
                    std::fill(v.ks[j].begin(), v.ks[j].end(), 0.f);
                    v.ksLast[j] = 0.f;
                }
                v.ksW = 0;
                float f = 440.f * std::exp2((key - 69) / 12.f) * pitchFactor();
                int E = std::min((int)(sr / f), v.ksMask);
                E = std::max(E, 4);
                float a = 0.12f + 0.8f * p(P_TONE);
                float lp = 0.f;
                for (int n = 0; n < E; ++n) {
                    lp += a * (v.rng.bi() - lp);
                    v.exc[n] = lp;
                }
                int P = std::max(1, (int)(E * 0.13f));  // pluck position comb -> nasal quill
                for (int n = E - 1; n >= P; --n) v.exc[n] -= v.exc[n - P];
                float peak = 1e-6f;
                for (int n = 0; n < E; ++n) peak = std::max(peak, std::fabs(v.exc[n]));
                float g = (0.35f + 0.65f * vel) / peak;
                for (int n = 0; n < E; ++n) v.exc[n] *= g;
                v.excLen = E;
                v.excPos = 0;
#ifdef NB_FM6
                v.body[0].reset(); v.body[1].reset(); v.thunk = 0.f; for (int j = 0; j < 3; ++j) v.apz[j] = v.apx[j] = 0.f;
#endif
                break;
            }
            case E_DRONE:
                for (int j = 0; j < 4; ++j) {
                    v.ph[j] = v.rng.uni();
                    v.res[j].reset();
                    v.resDrift[j] = v.rng.bi();
                    v.resDriftT[j] = v.rng.bi();
                }
                break;
        }
    }

    void releaseKey(int key, bool fromArp) {
        for (auto& v : voices)
            if (v.active && !v.released && v.fromArp == fromArp && (key < 0 || v.key == key)) {
                v.released = true;
                v.env.off();
#ifdef NB_FM6
                if (v.fm && v.engine == E_FM) fm6api::keyup(v.fm);
                if (v.engine == E_HARP) v.thunk = 0.25f * (0.4f + 0.6f * v.vel);   // the jack falls back: the damper's soft thunk
#endif
            }
    }

    void releaseAll() {
        for (auto& v : voices)
            if (v.active) { v.released = true; v.env.off(); }
    }

    void chokeKey(int key) {
        for (auto& v : voices)
            if (v.active && (key < 0 || v.key == key)) v.active = false;
    }

    float pitchFactor() const { return std::exp2((bend - sSlow * 12.f) / 12.f); }

    // ---------------------------------------------------------------- notes / arp
    bool arpOn() const { return pi(P_ARP_MODE) != 0; }

    void noteOn(int key, float vel) {
        if (key < 0 || key > 127) return;
        bool found = false;
        for (int i = 0; i < nHeld; ++i)
            if (held[i].key == key) { held[i].vel = vel; found = true; }
        if (!found && nHeld < 128) {
            if (nHeld == 0) { arpFirst = true; arpIdx = 0; }
            held[nHeld++] = {key, vel, ++heldOrder};
        }
        if (!arpOn()) startVoice(key, vel, false);
    }

    void noteOff(int key) {
        if (key < 0) {
            nHeld = 0;
        } else {
            for (int i = 0; i < nHeld; ++i)
                if (held[i].key == key) { held[i] = held[--nHeld]; break; }
        }
        if (!arpOn()) releaseKey(key, false);
    }

    void arpTrigger(int mode, int octaves, int stepSamples, float gate) {
        Held sorted[128];
        int n = nHeld;
        for (int i = 0; i < n; ++i) sorted[i] = held[i];
        if (mode == 5)
            std::sort(sorted, sorted + n, [](const Held& a, const Held& b) { return a.order < b.order; });
        else
            std::sort(sorted, sorted + n, [](const Held& a, const Held& b) { return a.key < b.key; });
        int seqK[512];
        float seqV[512];
        int ns = 0;
        for (int o = 0; o < octaves; ++o)
            for (int i = 0; i < n && ns < 512; ++i) {
                int k = sorted[i].key + 12 * o;
                if (k > 127) continue;
                seqK[ns] = k;
                seqV[ns] = sorted[i].vel;
                ++ns;
            }
        if (ns == 0) return;
        int idx = 0;
        switch (mode) {
            case 1: idx = arpIdx % ns; break;
            case 2: idx = ns - 1 - (arpIdx % ns); break;
            case 3: {
                int period = ns > 1 ? 2 * ns - 2 : 1;
                int m = arpIdx % period;
                idx = m < ns ? m : period - m;
                break;
            }
            case 4: idx = (int)(rng.next() % (uint32_t)ns); break;
            default: idx = arpIdx % ns; break;
        }
        ++arpIdx;
        if (arpKey >= 0) releaseKey(arpKey, true);
        startVoice(seqK[idx], seqV[idx], true);
        arpKey = seqK[idx];
        arpGateLeft = std::max(kChunk, (int)(gate * (float)stepSamples));
    }

    double beatAt(uint32_t pos) const {
        double bps = tempo / 60.0 / (double)sr;
        return (playing ? songBeat : freeBeat) + (double)pos * bps;
    }

    void arpTick(uint32_t pos, int n) {
        int mode = pi(P_ARP_MODE);
        bool on = mode != 0;
        if (on != arpWasOn) {
            releaseAll();
            arpKey = -1;
            arpIdx = 0;
            arpFirst = nHeld > 0;
            arpWasOn = on;
        }
        if (!on) return;
        if (arpKey >= 0 && arpGateLeft > 0) {
            arpGateLeft -= n;
            if (arpGateLeft <= 0) { releaseKey(arpKey, true); arpKey = -1; }
        }
        if (nHeld == 0) return;
        int rateIdx = std::min(5, std::max(0, pi(P_ARP_RATE)));
        double rate = kArpRateBeats[rateIdx];
        int stepSamples = (int)(rate * 60.0 / tempo * sr);
        int oct = std::min(4, std::max(1, pi(P_ARP_OCT)));
        float gate = p(P_ARP_GATE);
        if (arpFirst) {
            if (!playing) freeBeat = -(double)pos * tempo / 60.0 / (double)sr;
            lastStep = (int64_t)std::floor(beatAt(pos) / rate + 1e-9);
            arpFirst = false;
            arpTrigger(mode, oct, stepSamples, gate);
        } else {
            int64_t st = (int64_t)std::floor(beatAt(pos) / rate + 1e-9);
            if (st != lastStep) {
                lastStep = st;
                arpTrigger(mode, oct, stepSamples, gate);
            }
        }
    }

    // ---------------------------------------------------------------- events
    void handleEvent(const clap_event_header_t* h) {
        if (h->space_id != CLAP_CORE_EVENT_SPACE_ID) return;
        switch (h->type) {
            case CLAP_EVENT_NOTE_ON: {
                auto* e = (const clap_event_note_t*)h;
                noteOn(e->key, (float)e->velocity);
                break;
            }
            case CLAP_EVENT_NOTE_OFF: {
                auto* e = (const clap_event_note_t*)h;
                noteOff(e->key);
                break;
            }
            case CLAP_EVENT_NOTE_CHOKE: {
                auto* e = (const clap_event_note_t*)h;
                noteOff(e->key);
                chokeKey(e->key);
                break;
            }
            case CLAP_EVENT_MIDI: {
                auto* e = (const clap_event_midi_t*)h;
                uint8_t st = e->data[0] & 0xF0;
                if (st == 0x90 && e->data[2] > 0) noteOn(e->data[1], e->data[2] / 127.f);
                else if (st == 0x80 || st == 0x90) noteOff(e->data[1]);
                else if (st == 0xE0) bend = ((int)(e->data[1] | (e->data[2] << 7)) - 8192) / 8192.f * 2.f;
                else if (st == 0xB0 && (e->data[1] == 123 || e->data[1] == 120)) { noteOff(-1); releaseAll(); }
                break;
            }
            case CLAP_EVENT_PARAM_VALUE: {
                auto* e = (const clap_event_param_value_t*)h;
                if (e->param_id < P_COUNT) {
                    const auto& d = kParams[e->param_id];
                    vals[e->param_id].store(std::min(d.mx, std::max(d.mn, e->value)));
                }
                break;
            }
            default: break;
        }
    }

    // ---------------------------------------------------------------- voice rendering
    void renderVoice(Voice& v, int n, const Ctl& c) {
        // slow analog drift
        if (--v.driftCnt <= 0) { v.driftTgt = v.rng.bi(); v.driftCnt = (int)(0.3f * c.sr / kChunk); }
        v.driftCur += (v.driftTgt - v.driftCur) * 0.01f;
        float driftCents = v.driftCur * (v.engine == E_JUNO ? 3.f + 6.f * c.spread : 2.f);
        float f = 440.f * std::exp2((v.key - 69) / 12.f + driftCents / 1200.f) * c.pitch;
        f = clampf(f, 5.f, 0.45f * c.sr);

        float envOct = 0.f;
        if (v.engine == E_JUNO) envOct = 2.5f;
        else if (v.engine == E_HARP) envOct = 1.2f;
        else if (v.engine == E_CHOIR) envOct = 0.4f;
        float keyTrack = 0.5f * (v.key - 60) / 12.f;
        float fc = c.cutoff * std::exp2(envOct * v.env.v * (0.5f + 0.5f * v.vel) + keyTrack);
        fc = clampf(fc, 20.f, 0.45f * c.sr);
        const float g = std::tan(kPi * fc * c.isr);
        const float k = c.reso * 3.9f;
        const float velAmp = 0.4f + 0.6f * v.vel;
        const float eg = kEngineGain[v.engine];
        float sus = c.sus;
        if (v.engine == E_HARP) sus = 1.f;  // the string decides the decay

        switch (v.engine) {
            case E_JUNO: {
                v.lfoPh += 0.6f * n * c.isr;
                v.lfoPh -= std::floor(v.lfoPh);
                float pw = 0.5f + 0.42f * c.motion * sinTurns(v.lfoPh);
                float sawA = 1.f - 0.6f * c.tone;
                float pulA = std::min(1.f, c.tone * 1.5f) * 0.8f;
                float subA = std::max(0.f, c.tone - 0.4f) * 0.9f;
                float detA = c.spread * 0.7f;
                float dt = f * c.isr, dt2 = dt * (1.f + 0.008f * c.spread), dts = dt * 0.5f;
                for (int i = 0; i < n; ++i) {
                    float t = v.ph[0];
                    float saw = 2.f * t - 1.f - blep(t, dt);
                    float t2 = t + 1.f - pw;
                    t2 -= std::floor(t2);
                    float pul = (t < pw ? 1.f : -1.f) + blep(t, dt) - blep(t2, dt);
                    float ts = v.subPh;
                    float ts2 = ts + 0.5f;
                    ts2 -= std::floor(ts2);
                    float sub = (ts < 0.5f ? 1.f : -1.f) + blep(ts, dts) - blep(ts2, dts);
                    float t3 = v.ph[1];
                    float saw2 = 2.f * t3 - 1.f - blep(t3, dt2);
                    float x = 0.5f * (saw * sawA + pul * pulA + sub * subA + saw2 * detA);
                    v.ph[0] += dt; if (v.ph[0] >= 1.f) v.ph[0] -= 1.f;
                    v.ph[1] += dt2; if (v.ph[1] >= 1.f) v.ph[1] -= 1.f;
                    v.subPh += dts; if (v.subPh >= 1.f) v.subPh -= 1.f;
                    x = v.lad.process(x, g, k);
                    float a = v.env.next(c.aInc, c.dCoef, sus, c.rCoef) * velAmp * eg;
                    tmpL[i] += x * a * v.gL;
                    tmpR[i] += x * a * v.gR;
                }
                break;
            }
            case E_CHOIR: {
                v.vibPh += 5.2f * n * c.isr; v.vibPh -= std::floor(v.vibPh);
                v.slowPh += 0.13f * n * c.isr; v.slowPh -= std::floor(v.slowPh);
                float morph = clampf(c.tone * 4.f + c.motion * 1.1f * sinTurns(v.slowPh), 0.f, 4.f);
                int i0 = std::min(3, (int)morph);
                float fr = morph - (float)i0;
                static const float kQ[3] = {9.f, 12.f, 14.f};
                float fg[3], fk[3];
                for (int j = 0; j < 3; ++j) {
                    float F = (kVowelF[i0][j] + (kVowelF[i0 + 1][j] - kVowelF[i0][j]) * fr) * c.pitch;
                    F = clampf(F, 40.f, 0.45f * c.sr);
                    fg[j] = kVowelG[i0][j] + (kVowelG[i0 + 1][j] - kVowelG[i0][j]) * fr;
                    fk[j] = 1.f / kQ[j];
                    v.form[j].set(std::tan(kPi * F * c.isr), fk[j]);
                }
                float vib = 1.f + 0.005f * (0.25f + c.motion) * sinTurns(v.vibPh);
                float d = 0.003f + 0.012f * c.spread;
                float dt0 = f * vib * c.isr, dt1 = dt0 * (1.f + d), dt2 = dt0 * (1.f - d);
#ifdef NB_FM6
                // (229) three singers, each a glottal pulse (Rosenberg's: a rising half-cosine, a quicker fall, then closed)
                // with its own vibrato and a little jitter, and breath riding on the flow; a fourth formant for the ring
                const float dts[3] = {dt0, dt1, dt2};
                float vr[3]; for (int j = 0; j < 3; ++j) { v.gvib[j] += v.gvr[j] * n * c.isr; v.gvib[j] -= std::floor(v.gvib[j]); v.gjit[j] += 0.15f * (0.004f * v.rng.bi() - v.gjit[j]); vr[j] = 1.f + 0.006f * (0.3f + c.motion) * sinTurns(v.gvib[j]) + v.gjit[j]; }
                const float To = 0.42f + 0.12f * (1.f - c.tone), Tc = 0.16f;   // (open and closing parts of the cycle: breathier when darker)
                v.form4.set(std::tan(kPi * clampf(3400.f * c.pitch, 40.f, 0.45f * c.sr) * c.isr), 1.f / 16.f);
                for (int i = 0; i < n; ++i) {
                    float src = 0.f, flowSum = 0.f;
                    for (int j = 0; j < 3; ++j) {
                        float t = v.gph[j], gflow;
                        gflow = t < To ? 0.5f * (1.f - std::cos(kPi * t / To)) : t < To + Tc ? std::cos(0.5f * kPi * (t - To) / Tc) : 0.f;
                        float prev = v.apx[j]; v.apx[j] = gflow; src += (gflow - prev) * 8.f; flowSum += gflow;   // (the flow's slope is what the tract hears)
                        v.gph[j] += dts[j] * vr[j]; if (v.gph[j] >= 1.f) v.gph[j] -= 1.f;
                    }
                    src = src * (1.f / 3.f) + v.rng.bi() * (0.03f + 0.05f * flowSum);   // breath
                    float y = 0.f;
                    for (int j = 0; j < 3; ++j) y += fg[j] * fk[j] * v.form[j].bp(src);
                    y += 0.08f * (1.f / 16.f) * v.form4.bp(src);
                    float x = 4.4f * y + 0.08f * src;
#else
                for (int i = 0; i < n; ++i) {
                    float s0 = 2.f * v.ph[0] - 1.f - blep(v.ph[0], dt0);
                    float s1 = 2.f * v.ph[1] - 1.f - blep(v.ph[1], dt1);
                    float s2 = 2.f * v.ph[2] - 1.f - blep(v.ph[2], dt2);
                    v.ph[0] += dt0; if (v.ph[0] >= 1.f) v.ph[0] -= 1.f;
                    v.ph[1] += dt1; if (v.ph[1] >= 1.f) v.ph[1] -= 1.f;
                    v.ph[2] += dt2; if (v.ph[2] >= 1.f) v.ph[2] -= 1.f;
                    float src = (s0 + s1 + s2) * (1.f / 3.f) + 0.06f * v.rng.bi();
                    float y = 0.f;
                    for (int j = 0; j < 3; ++j) y += fg[j] * fk[j] * v.form[j].bp(src);
                    float x = 1.6f * y + 0.08f * src;
#endif
                    x = v.lad.process(x, g, k);
                    float a = v.env.next(c.aInc, c.dCoef, sus, c.rCoef) * velAmp * eg;
                    tmpL[i] += x * a * v.gL;
                    tmpR[i] += x * a * v.gR;
                }
                break;
            }
            case E_FM: {
                float ratio = kFmRatios[std::min(7, std::max(0, (int)std::lround(c.tone * 7.f)))];
                float idxT = (0.2f + c.motion * 6.f) * 0.159155f * (0.5f + 0.5f * v.vel);
                float fmCoef = std::exp(-1.f / (std::max(0.01f, decaySec(c.decayRaw) * 0.25f) * c.sr));
                float floorL = c.sus * 0.35f;
                float dtm = f * ratio * c.isr, dtc = f * c.isr, dtc2 = dtc * (1.f + 0.004f * c.spread), dto = 2.f * dtc;
                float spreadMix = c.spread;
                float norm = 1.f / (1.f + spreadMix);
#ifdef NB_FM6
                if (v.fm) {
                    for (int i = 0; i < n; ++i) {
                        float x = fm6api::next(v.fm) * 6.f;
                        x = v.lad.process(x, g, k);
                        float a = v.env.next(c.aInc, c.dCoef, sus, c.rCoef) * eg;
                        tmpL[i] += x * a * v.gL;
                        tmpR[i] += x * a * v.gR;
                    }
                    break;
                }
#endif
                for (int i = 0; i < n; ++i) {
                    v.fmEnv *= fmCoef;
                    float lvl = floorL + (1.f - floorL) * v.fmEnv;
                    float m = sinTurns(v.ph[0] + 0.02f * v.fbPrev);
                    v.fbPrev = m;
                    float im = idxT * lvl * m;
                    float car = sinTurns(v.ph[1] + im);
                    float car2 = sinTurns(v.ph[2] + im);
                    float oct = sinTurns(v.ph[3]);
                    v.ph[0] += dtm; v.ph[0] -= std::floor(v.ph[0]);
                    v.ph[1] += dtc; v.ph[1] -= std::floor(v.ph[1]);
                    v.ph[2] += dtc2; v.ph[2] -= std::floor(v.ph[2]);
                    v.ph[3] += dto; v.ph[3] -= std::floor(v.ph[3]);
                    float x = (car + spreadMix * car2) * norm + 0.1f * oct * lvl;
                    x = v.lad.process(x, g, k);
                    float a = v.env.next(c.aInc, c.dCoef, sus, c.rCoef) * velAmp * eg;
                    tmpL[i] += x * a * v.gL;
                    tmpR[i] += x * a * v.gR;
                }
                break;
            }
            case E_HARP: {
                float bd = clampf(0.5f - 0.4f * c.tone, 0.08f, 0.5f);
                float P = c.sr / f;
                float dly[kStrings] = {P - bd, P * (1.f - 0.003f * c.spread) - bd, 0.5f * P - bd};
                float amp[kStrings] = {1.f, 0.75f, 0.7f * c.motion};
                float gs[kStrings];
                for (int j = 0; j < kStrings; ++j) {
                    dly[j] = clampf(dly[j], 1.f, (float)(v.ksMask - 2));
                    float fj = (j == 2) ? 2.f * f : f;
                    float t60 = v.released ? 0.12f
                                           : clampf((0.4f + 7.f * c.decayRaw) * std::sqrt(261.6f / fj), 0.1f, 15.f);
                    gs[j] = std::pow(0.001f, 1.f / (fj * t60));
                }
#ifdef NB_FM6
                v.body[0].set(std::tan(kPi * 260.f * c.isr), 0.9f); v.body[1].set(std::tan(kPi * 1150.f * c.isr), 1.2f);
#endif
                for (int i = 0; i < n; ++i) {
                    float e = v.excPos < v.excLen ? v.exc[v.excPos++] : 0.f;
                    float x = 0.f;
                    for (int j = 0; j < kStrings; ++j) {
                        float r = v.ksTap(j, dly[j]);
                        float fl = r + bd * (v.ksLast[j] - r);
                        v.ksLast[j] = r;
                        float y = gs[j] * fl + e;
                        v.ks[j][v.ksW] = y;
                        x += y * amp[j];
                    }
                    v.ksW = (v.ksW + 1) & v.ksMask;
                    x *= 0.45f;
#ifdef NB_FM6
                    {   // the soundboard (two broad resonances), and the damper's thunk on release
                        float bpo = v.body[0].bp(x), bpo2 = v.body[1].bp(x);
                        x = x * 0.8f + 0.35f * bpo + 0.25f * bpo2;
                        if (v.thunk > 1e-4f) { x += v.thunk * v.rng.bi() * 0.5f; v.thunk *= 0.9985f; }
                    }
#endif
                    x = v.lad.process(x, g, k);
                    float a = v.env.next(c.aInc, c.dCoef, sus, c.rCoef) * eg;
                    tmpL[i] += x * a * v.gL;
                    tmpR[i] += x * a * v.gR;
                }
                break;
            }
            case E_DRONE: {
                v.slowPh += 0.07f * n * c.isr; v.slowPh -= std::floor(v.slowPh);
                static const float kH[4] = {1.f, 2.f, 3.f, 5.f};
                float nrGain[4];
                for (int j = 0; j < 4; ++j) {
                    if (v.rng.uni() < 0.004f) v.resDriftT[j] = v.rng.bi();
                    v.resDrift[j] += (v.resDriftT[j] - v.resDrift[j]) * 0.002f;
                    float F = clampf(f * kH[j] * (1.f + c.motion * 0.02f * v.resDrift[j]), 20.f, 0.45f * c.sr);
                    v.res[j].set(std::tan(kPi * F * c.isr), 0.02f);
                    nrGain[j] = 0.35f * std::sqrt(110.f / F) / std::sqrt((float)(j + 1));
                }
                float flutter = 1.f + c.motion * 0.35f * sinTurns(v.slowPh * 3.f);
                float d = 0.003f + 0.01f * c.spread;
                float dt[4] = {f * c.isr, f * (1.f + d) * c.isr, 1.5f * f * c.isr, 2.f * f * (1.f - 0.5f * d) * c.isr};
                float toneN = c.tone, toneS = 1.f - c.tone;
                for (int i = 0; i < n; ++i) {
                    float s = sinTurns(v.ph[0]) + 0.8f * sinTurns(v.ph[1]) + 0.45f * sinTurns(v.ph[2]) +
                              0.3f * sinTurns(v.ph[3]);
                    for (int j = 0; j < 4; ++j) { v.ph[j] += dt[j]; v.ph[j] -= std::floor(v.ph[j]); }
                    float noise = v.rng.bi();
                    float nr = 0.f;
                    for (int j = 0; j < 4; ++j) nr += v.res[j].bp(noise) * nrGain[j];
                    float x = (toneS * 0.3f * s + toneN * nr) * flutter;
                    x = v.lad.process(x, g, k);
                    float a = v.env.next(c.aInc, c.dCoef, sus, c.rCoef) * velAmp * eg;
                    tmpL[i] += x * a * v.gL;
                    tmpR[i] += x * a * v.gR;
                }
                break;
            }
        }
        if (v.env.st == 0) v.active = false;
    }

    // ---------------------------------------------------------------- chunk render
    void renderChunk(uint32_t pos, int n, float* outL, float* outR) {
        arpTick(pos, n);

        const float chunkA = 1.f - std::exp(-(float)n / (0.02f * sr));
        auto sm = [&](float& s, float t) { s += (t - s) * chunkA; };
        sm(sCut, p(P_CUTOFF));
        sm(sSlow, p(P_SLOWDOWN));
        sm(sJam, p(P_JAM_MIX));
        sm(sDly, p(P_DLY_MIX));
        sm(sVerb, p(P_VERB_MIX));
        sm(sVol, std::pow(10.f, p(P_VOLUME) / 20.f));
        sm(sDrive, p(P_DRIVE));
        sm(sLofi, p(P_LOFI));
        sm(sWob, p(P_WOBBLE));
        int cm = pi(P_CHORUS);
        if (cm > 0) chorusMode = cm;
        sm(sChorus, cm > 0 ? 1.f : 0.f);

        Ctl c;
        c.sr = sr;
        c.isr = 1.f / sr;
        c.tone = p(P_TONE);
        c.motion = p(P_MOTION);
        c.spread = p(P_SPREAD);
        c.cutoff = cutoffHz(sCut);
        c.reso = p(P_RESO);
        c.decayRaw = p(P_DECAY);
        c.aInc = 1.f / (attackSec(p(P_ATTACK)) * sr);
        c.dCoef = std::exp(-6.9f / (decaySec(p(P_DECAY)) * sr));
        c.sus = p(P_SUSTAIN);
        c.rCoef = std::exp(-6.9f / (releaseSec(p(P_RELEASE)) * sr));
        c.pitch = pitchFactor();

        for (int i = 0; i < n; ++i) tmpL[i] = tmpR[i] = 0.f;
        for (auto& v : voices)
            if (v.active) renderVoice(v, n, c);

        // FX settings for this chunk
        float drivePre = 1.f + sDrive * 24.f, driveComp = 1.f / (1.f + sDrive * 2.5f);
        float lofiRate = 44100.f * std::pow(3500.f / 44100.f, sLofi) / sr;
        float lofiSteps = std::pow(2.f, 15.f - 11.f * sLofi);
        float tapeFc = clampf(19000.f * (1.f - 0.72f * sSlow) - sWob * 5000.f, 1500.f, 0.45f * sr);
        float tapeA = 1.f - std::exp(-2.f * kPi * tapeFc / sr);
        int jamLen = (int)(kJamLenBeats[std::min(5, std::max(0, pi(P_JAM_LEN)))] * 60.0 / tempo * sr);
        bool freeze = pi(P_JAM_FREEZE) != 0;
        float dlyT = (float)(kDlyBeats[std::min(5, std::max(0, pi(P_DLY_TIME)))] * 60.0 / tempo * sr);
        float dlyFb = p(P_DLY_FB);
        verb.setSize(p(P_VERB_SIZE));

        for (int i = 0; i < n; ++i) {
            float L = tmpL[i], R = tmpR[i];
            if (sDrive > 1e-3f) {
                L = std::tanh(L * drivePre) * driveComp;
                R = std::tanh(R * drivePre) * driveComp;
            }
            if (sLofi > 1e-3f) {
                holdPh += lofiRate;
                if (holdPh >= 1.f) {
                    holdPh -= 1.f;
                    holdL = std::round(L * lofiSteps) / lofiSteps;
                    holdR = std::round(R * lofiSteps) / lofiSteps;
                }
                L += (holdL - L) * std::min(1.f, sLofi * 4.f);
                R += (holdR - R) * std::min(1.f, sLofi * 4.f);
            }
            {
                float wL, wR;
                chorus.process(0.5f * (L + R), wL, wR, chorusMode);
                L = (L + wL * sChorus) * (1.f - 0.25f * sChorus);
                R = (R + wR * sChorus) * (1.f - 0.25f * sChorus);
            }
            tape.process(L, R, sWob, tapeA);
            jam.process(L, R, sJam, jamLen, freeze);
            dly.process(L, R, sDly, dlyT, dlyFb);
            float vL, vR;
            verb.process(L, R, vL, vR);
            L = L * (1.f - 0.4f * sVerb) + vL * sVerb;
            R = R * (1.f - 0.4f * sVerb) + vR * sVerb;
            L = std::tanh(L * sVol);
            R = std::tanh(R * sVol);
            outL[i] = L;
            outR[i] = R;
        }
    }

    clap_process_status process(const clap_process_t* proc) {
#ifdef HYP_HAS_SSE
        unsigned int oldCsr = _mm_getcsr();
        _mm_setcsr(oldCsr | 0x8040);  // FTZ + DAZ
#endif
        const uint32_t frames = proc->frames_count;
        if (proc->transport) {
            const auto* t = proc->transport;
            if (t->flags & CLAP_TRANSPORT_HAS_TEMPO) tempo = std::max(20.0, std::min(400.0, t->tempo));
            playing = (t->flags & CLAP_TRANSPORT_IS_PLAYING) && (t->flags & CLAP_TRANSPORT_HAS_BEATS_TIMELINE);
            if (playing) songBeat = (double)t->song_pos_beats / (double)CLAP_BEATTIME_FACTOR;
        } else {
            playing = false;
        }

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
        while (ei < nev) handleEvent(in->get(in, ei++));

        if (!playing) freeBeat += (double)frames * tempo / 60.0 / (double)sr;
#ifdef HYP_HAS_SSE
        _mm_setcsr(oldCsr);
#endif
        return CLAP_PROCESS_CONTINUE;
    }
};

// ==================================================================== CLAP glue
static const char* const kFeatures[] = {CLAP_PLUGIN_FEATURE_INSTRUMENT, CLAP_PLUGIN_FEATURE_SYNTHESIZER,
                                        CLAP_PLUGIN_FEATURE_STEREO, nullptr};

static const clap_plugin_descriptor_t kDesc = {
    CLAP_VERSION_INIT,
    "com.nathan.hypnagogia",
    "Hypnagogia",
    "Nathan",
    "",
    "",
    "",
    "0.1.0",
    "Juno arps, vapor choirs, FM glass, harpsichord and drones through echo-jam tape FX",
    kFeatures,
};

static Plugin* self(const clap_plugin_t* p) { return (Plugin*)p->plugin_data; }

// ---- params
static uint32_t params_count(const clap_plugin_t*) { return P_COUNT; }

static bool params_get_info(const clap_plugin_t*, uint32_t index, clap_param_info_t* info) {
    if (index >= P_COUNT) return false;
    const ParamDef& d = kParams[index];
    std::memset(info, 0, sizeof(*info));
    info->id = d.id;
    info->flags = CLAP_PARAM_IS_AUTOMATABLE;
    if (d.unit == U_ENUM || d.unit == U_INT) info->flags |= CLAP_PARAM_IS_STEPPED;
    if (d.unit == U_ENUM) info->flags |= CLAP_PARAM_IS_ENUM;
    info->cookie = nullptr;
    std::snprintf(info->name, CLAP_NAME_SIZE, "%s", d.name);
    std::snprintf(info->module, CLAP_PATH_SIZE, "%s", d.module);
    info->min_value = d.mn;
    info->max_value = d.mx;
    info->default_value = d.def;
    return true;
}

static bool params_get_value(const clap_plugin_t* plugin, clap_id id, double* out) {
    if (id >= P_COUNT) return false;
    *out = self(plugin)->vals[id].load();
    return true;
}

static void fmtTime(char* buf, uint32_t size, float sec) {
    if (sec < 0.01f) std::snprintf(buf, size, "%.1f ms", sec * 1000.f);
    else if (sec < 1.f) std::snprintf(buf, size, "%.0f ms", sec * 1000.f);
    else std::snprintf(buf, size, "%.2f s", sec);
}

static bool params_value_to_text(const clap_plugin_t*, clap_id id, double value, char* buf, uint32_t size) {
    if (id >= P_COUNT) return false;
    const ParamDef& d = kParams[id];
    float v = (float)value;
    switch (d.unit) {
        case U_PCT: std::snprintf(buf, size, "%.0f %%", v * 100.f); break;
        case U_HZ: {
            float hz = cutoffHz(v);
            if (hz < 1000.f) std::snprintf(buf, size, "%.0f Hz", hz);
            else std::snprintf(buf, size, "%.2f kHz", hz / 1000.f);
            break;
        }
        case U_TIME_A: fmtTime(buf, size, attackSec(v)); break;
        case U_TIME_D: fmtTime(buf, size, decaySec(v)); break;
        case U_TIME_R: fmtTime(buf, size, releaseSec(v)); break;
        case U_DB: std::snprintf(buf, size, "%.1f dB", v); break;
        case U_ENUM: {
            int i = (int)std::lround(value);
            i = std::max(0, std::min(i, (int)d.mx));
            std::snprintf(buf, size, "%s", d.labels[i]);
            break;
        }
        case U_INT: std::snprintf(buf, size, "%d", (int)std::lround(value)); break;
        case U_SEMI: std::snprintf(buf, size, "-%.1f st", v * 12.f); break;
    }
    return true;
}

static bool params_text_to_value(const clap_plugin_t*, clap_id id, const char* text, double* out) {
    if (id >= P_COUNT || !text) return false;
    const ParamDef& d = kParams[id];
    if (d.unit == U_ENUM) {
        for (int i = 0; i <= (int)d.mx; ++i)
            if (strcasecmp(text, d.labels[i]) == 0) { *out = i; return true; }
    }
    char* end = nullptr;
    double x = std::strtod(text, &end);
    if (end == text) return false;
    bool ms = std::strstr(text, "ms") != nullptr;
    bool k = std::strchr(text, 'k') || std::strchr(text, 'K');
    double v = x;
    switch (d.unit) {
        case U_PCT: v = x / 100.0; break;
        case U_HZ: v = std::log(std::max(30.0, x * (k ? 1000.0 : 1.0)) / 30.0) / std::log(600.0); break;
        case U_TIME_A: v = std::log(std::max(1e-3, ms ? x / 1000.0 : x) / 0.001) / std::log(4000.0); break;
        case U_TIME_D: v = std::log(std::max(5e-3, ms ? x / 1000.0 : x) / 0.005) / std::log(1600.0); break;
        case U_TIME_R: v = std::log(std::max(1e-2, ms ? x / 1000.0 : x) / 0.01) / std::log(1000.0); break;
        case U_SEMI: v = std::fabs(x) / 12.0; break;
        default: break;
    }
    *out = std::min(d.mx, std::max(d.mn, v));
    return true;
}

static void params_flush(const clap_plugin_t* plugin, const clap_input_events_t* in, const clap_output_events_t*) {
    Plugin* pl = self(plugin);
    if (!in) return;
    uint32_t n = in->size(in);
    for (uint32_t i = 0; i < n; ++i) {
        const clap_event_header_t* h = in->get(in, i);
        if (h->space_id == CLAP_CORE_EVENT_SPACE_ID && h->type == CLAP_EVENT_PARAM_VALUE) pl->handleEvent(h);
    }
}

static const clap_plugin_params_t kParamsExt = {params_count, params_get_info, params_get_value,
                                                params_value_to_text, params_text_to_value, params_flush};

// ---- state
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

static const uint32_t kMagic = 0x48595047;  // 'HYPG'

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

// ---- ports
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

// ---- plugin
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

// ---- factory / entry
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

}  // namespace hyp

extern "C" CLAP_EXPORT const clap_plugin_entry_t clap_entry = {
    CLAP_VERSION_INIT, hyp::entry_init, hyp::entry_deinit, hyp::entry_get_factory};
