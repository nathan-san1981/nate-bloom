// Duet 80 — voice engine.
//
// Signal path per voice (8 voices, each with two complete channels I and II):
//
//   VCO (saw / comparator-derived pulse w/ PWM / white noise)
//     -> HPF (12 dB state-variable, OTA nonlinearity)
//     -> LPF (12 dB state-variable, OTA nonlinearity, amplitude-dependent damping)
//     -> + sine (bypasses the filters, as on the original)
//     -> VCA (ADSR, touch & keyboard level scaling)
//   channel I + channel II -> MIX -> ring modulator (own AD sweep) -> voice output stage
//   sum of voices -> 2x decimator -> BBD-style stereo chorus -> output stage
//
// Analog behaviour modelled: per-voice-card component tolerances (pitch offset,
// expo-converter scale error, filter cutoff spread, envelope timing spread,
// PWM oscillator rate spread), slow VCO drift, RC-curve envelopes with attack
// overshoot target, OTA input saturation, resonance self-limiting, free-running
// PWM oscillators, voice-output soft saturation, DC coupling caps.
#pragma once
#include "params.h"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

namespace t77 {

constexpr int kVoices = 8;
constexpr int kCtl = 16; // control-rate sub-block (base-rate samples)
constexpr float kPi = 3.14159265358979f;
constexpr float kTwoPi = 6.28318530717959f;

// ---- calibration constants (measured from real CS-80 multisamples, see CALIBRATION.md)
constexpr float kTolCents = 27.7f;   // uniform +-; sd = 16 c x Age  (8 c at Age 0.5)
constexpr float kDriftCents = 5.0f;  // slow in-note wander: ~0.35 c sd at Age 0.5 (measured)
#ifndef T77_RESLIM
#define T77_RESLIM 0.06f
#endif
#ifndef T77_XLO
#define T77_XLO 6.0f
#endif
#ifndef T77_XHI
#define T77_XHI 0.75f
#endif
#ifndef T77_XN
#define T77_XN 1
#endif
constexpr float kResLimit = T77_RESLIM;     // resonance self-limiting (lower = cleaner)
constexpr float kExtraPoleLo = T77_XLO;     // extra LPF pole at k x cutoff, low resonance
constexpr float kExtraPoleHi = T77_XHI;     // ... and at full resonance
constexpr int kExtraPoles = T77_XN;
#ifndef T77_VDRIVE
#define T77_VDRIVE 0.25f
#endif
constexpr float kVoiceDrive = T77_VDRIVE;   // voice output stage drive (tanh input scale)
constexpr float kKeyTrack = 0.85f;           // VCF keyboard tracking, oct/oct (measured median 0.83)
constexpr float kSawBody = 0.20f;    // extra fundamental in the saw: ~+3 dB vs ideal ramp (measured)

// ---------------------------------------------------------------- helpers
struct Rng {
    uint32_t s = 0x9e3779b9u;
    explicit Rng(uint32_t seed = 1) : s(seed ? seed : 1) {}
    inline uint32_t next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; }
    inline float uni() { return (next() >> 8) * (1.0f / 16777216.0f); } // 0..1
    inline float bip() { return uni() * 2.0f - 1.0f; }                     // -1..1
};

inline float fastTanh(float x) {
    x = std::clamp(x, -3.0f, 3.0f);
    float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

inline float fastExp2(float x) { return std::exp2(x); }

inline float polyBlep(float t, float dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1.0f; }
    if (t > 1.0f - dt) { t = (t - 1.0f) / dt; return t * t + t + t + 1.0f; }
    return 0.0f;
}

inline float rcCoef(float seconds, float rate) {
    if (seconds <= 0.0f) return 1.0f;
    return 1.0f - std::exp(-1.0f / (seconds * rate));
}

// -------------------------------------------------------------- filters
// Topology-preserving state-variable filter with OTA-style nonlinearity.
// The original uses two cascaded SVFs (HPF then LPF) inside custom ICs that
// contain OTAs and an expo converter; the OTA differential pair is a tanh,
// and resonance self-limits as amplitude grows. Both are modelled here.
struct Svf {
    float s1 = 0, s2 = 0, bpPrev = 0;
    inline void reset() { s1 = s2 = bpPrev = 0; }
    // returns {hp, lp}
    inline void tick(float x, float g, float R, float &hp, float &lp) {
        x = fastTanh(x * 0.9f) * 1.1111f;              // OTA input stage
        float Re = R + kResLimit * bpPrev * bpPrev;     // amplitude-dependent damping
        if (Re > 2.0f) Re = 2.0f;
        hp = (x - (2.0f * Re + g) * s1 - s2) / (1.0f + 2.0f * Re * g + g * g);
        float v1 = g * hp;
        float bp = v1 + s1;
        s1 = bp + v1;
        float v2 = g * bp;
        lp = v2 + s2;
        s2 = lp + v2;
        // keep integrator states sane (models rail limits)
        s1 = std::clamp(s1, -8.0f, 8.0f);
        s2 = std::clamp(s2, -8.0f, 8.0f);
        bpPrev = bp;
    }
};

inline float cutoffToG(float hz, float rate) {
    float w = hz / rate;
    if (w > 0.45f) w = 0.45f;
    if (w < 1e-5f) w = 1e-5f;
    return std::tan(kPi * w);
}

// Resonance lever -> SVF damping. The measured CS-80 filter Q stays between ~0.5
// and ~4 on resonant patches and the filter does not self-oscillate, so the
// lever spans Q 0.5 .. 6.
inline float resToDamping(float r) {
    r = std::clamp(r, 0.0f, 1.0f);
    float q = 0.5f * std::pow(12.0f, std::pow(r, 1.2f));
    return 0.5f / q;
}

// ------------------------------------------------------------ envelopes
// Capacitor-charge envelopes, like the discrete EG circuits: attack charges
// toward a target above the switch point, decay/release discharge exponentially.
struct AdsrEnv {
    enum Stage { Idle, Attack, Decay, Release } stage = Idle;
    float v = 0;
    float ka = 1, kd = 1, kr = 1, sus = 1;
    inline void gateOn() { stage = Attack; }
    inline void gateOff() { if (stage != Idle) stage = Release; }
    inline float tick() {
        switch (stage) {
        case Attack:
            v += (1.25f - v) * ka;
            if (v >= 1.0f) { v = 1.0f; stage = Decay; }
            break;
        case Decay: v += (sus - v) * kd; break;
        case Release:
            v += (0.0f - v) * kr;
            if (v < 1e-5f) { v = 0; stage = Idle; }
            break;
        default: break;
        }
        return v;
    }
};

// VCF EG: starts at -IL, swings to +AL, settles at 0 (the cutoff lever / brilliance
// is the sustain point), returns to -IL on release.
struct FilterEnv {
    enum Stage { Idle, Attack, Decay, Release } stage = Idle;
    float v = 0, il = 0, al = 0, target = 0;
    float ka = 1, kd = 1, kr = 1;
    bool rising = true;
    inline void gateOn(bool fresh) {
        if (fresh) v = -il;
        stage = Attack;
        rising = al >= v;
        target = al + 0.25f * (al - v);
    }
    inline void gateOff() { if (stage != Idle) stage = Release; }
    inline float tick() {
        switch (stage) {
        case Attack:
            v += (target - v) * ka;
            if ((rising && v >= al) || (!rising && v <= al)) { v = al; stage = Decay; }
            break;
        case Decay: v += (0.0f - v) * kd; break;
        case Release: v += (-il - v) * kr; break;
        default: v = -il; break;
        }
        return v;
    }
};

// ------------------------------------------------------------- oscillator
struct Vco {
    float phase = 0;       // 0..1
    float pwmPhase = 0;    // free-running PWM oscillator
    float drift = 0, driftVel = 0;
};

// -------------------------------------------------------------- the voice
struct Channel {
    Vco vco;
    Svf hpf, lpf;
    FilterEnv feg;
    AdsrEnv aeg;
    // per-control-block values, linearly ramped at the internal rate
    float dt = 0, dtInc = 0;
    float gH = 0.1f, gHInc = 0, RH = 1, RL = 1, extraK = 4.0f, lp1 = 0, lp2 = 0;
    float lpfBaseOct = 10, octInc = 0;
    float duty = 0.5f, dutyInc = 0;
    float amp = 0, ampInc = 0, ampTarget = 0;
    float sine = 0, sawOn = 1, sqOn = 0, noise = 0;
    float dcIn = 0, dcOut = 0;
    // tolerances (fixed per voice card, scaled by Age)
    float tolCents = 0, tolScale = 0, tolCut = 0, tolEnv = 0, tolPwm = 0;
};

struct Voice {
    bool active = false;
    bool gate = false;
    bool sustained = false;
    int key = 60, midiCh = 0;
    int32_t noteId = -1;
    uint64_t stamp = 0;
    float vel = 0.8f;
    float pressure = 0, pressureSm = 0;
    float tuning = 0;
    float pitch = 60, pitchTarget = 60;
    float bendEnv = 0;
    float subFadeT = 0;
    float ringEnv = 0; bool ringAttack = false; float ringPhase = 0;
    float ringInc = 0, ringDepth = 0;
    float outDc = 0, outDcIn = 0;
    Channel ch[2];
    Rng noise{1};
};

// ------------------------------------------------------------ decimator
struct HalfbandDecimator {
    std::vector<float> h;
    std::vector<float> buf;
    int pos = 0, n = 0;
    void design(int taps) {
        n = taps; h.assign(n, 0.0f); buf.assign(n * 2, 0.0f); pos = 0;
        const double beta = 6.8;
        auto bessel0 = [](double x) {
            double s = 1, t = 1;
            for (int k = 1; k < 30; ++k) { t *= (x / (2 * k)) * (x / (2 * k)); s += t; }
            return s;
        };
        double sum = 0;
        int mid = (n - 1) / 2;
        for (int i = 0; i < n; ++i) {
            int m = i - mid;
            double sinc = (m == 0) ? 0.5 : std::sin(M_PI * 0.5 * m) / (M_PI * m);
            double r = (double)m / mid;
            double w = bessel0(beta * std::sqrt(std::max(0.0, 1 - r * r))) / bessel0(beta);
            h[i] = (float)(sinc * w);
            sum += h[i];
        }
        for (auto &c : h) c = (float)(c / sum);
    }
    void reset() { std::fill(buf.begin(), buf.end(), 0.0f); pos = 0; }
    // push two 2x-rate samples, get one base-rate sample
    inline float process(float a, float b) {
        push(a); push(b);
        float acc = 0;
        const float *x = &buf[pos];
        for (int i = 0; i < n; ++i) acc += h[i] * x[i];
        return acc;
    }
    inline void push(float v) {
        buf[pos] = v; buf[pos + n] = v;
        pos = (pos + 1) % n;
    }
};

// -------------------------------------------------------------- chorus
struct BbdChorus {
    std::vector<float> line;
    int w = 0, size = 0;
    float rate = 48000, phase = 0, lpL = 0, lpR = 0, lpK = 0.5f;
    void init(float sr) {
        rate = sr;
        size = (int)(sr * 0.05f) + 4;
        line.assign(size, 0.0f);
        w = 0;
        lpK = 1.0f - std::exp(-kTwoPi * 9000.0f / sr);
    }
    void reset() { std::fill(line.begin(), line.end(), 0.0f); lpL = lpR = 0; }
    inline float tap(float delaySamples) {
        float rp = (float)w - delaySamples;
        while (rp < 0) rp += size;
        int i0 = (int)rp;
        float f = rp - i0;
        int i1 = (i0 + 1) % size;
        return line[i0] + (line[i1] - line[i0]) * f;
    }
    inline void process(float in, float speedHz, float depth, bool on, float &L, float &R) {
        line[w] = fastTanh(in * 0.8f) * 1.25f; // BBD input clipping
        if (!on) { L = R = in; w = (w + 1) % size; return; }
        phase += speedHz / rate;
        if (phase >= 1) phase -= 1;
        float mA = std::sin(kTwoPi * phase);
        float mB = std::sin(kTwoPi * phase + kPi * 0.5f);
        float base = 0.0065f * rate, span = (0.0005f + depth * 0.0045f) * rate;
        float a = tap(base + span * mA);
        float b = tap(base + span * mB);
        lpL += (a - lpL) * lpK;
        lpR += (b - lpR) * lpK;
        float wet = 0.45f + 0.35f * depth;
        float dry = 1.0f - 0.3f * wet;
        L = in * dry + lpL * wet;
        R = in * dry + lpR * wet;
        w = (w + 1) % size;
    }
};

// --------------------------------------------------------------- engine
class Engine {
  public:
    void init(double sampleRate);
    void reset();

    void noteOn(int key, int midiCh, int32_t noteId, float velocity);
    void noteOff(int key, int midiCh, int32_t noteId);
    void chokeAll();
    void polyPressure(int key, int32_t noteId, float p);
    void channelPressure(float p) { chanPressure = p; }
    void noteTuning(int key, int32_t noteId, float semis);
    void pitchBend(float v) { midiBend = v; }
    void modWheel(float v) { modWheelVal = v; }
    void sustainPedal(bool down);
    void setParams(const float *p) { curP = p; }

    // p: snapshot of all parameter values
    void process(const float *p, float *outL, float *outR, uint32_t frames);

    int activeVoices() const {
        int n = 0;
        for (auto &v : voices) n += v.active;
        return n;
    }

  private:
    void globalControl(const float *p);
    void voiceControl(Voice &v, const float *p, bool snap);
    Voice *allocate();
    inline float renderVoice(Voice &v);

    const float *curP = nullptr;
    bool glideActive = false, haveLastNote = false, gliss = false, chorusOn = true;
    float kGlide = 1, kBend = 1, bendSemis = 0;
    float chorusHz = 0.5f, chorusDepth = 0.5f, gainTarget = 0.8f;
    double sr = 48000;
    int os = 2;
    float rate2 = 96000; // internal rate
    Voice voices[kVoices];
    uint64_t stampCounter = 0;
    int nextVoice = 0;
    float lastPitch = 60;
    float chanPressure = 0, midiBend = 0, modWheelVal = 0;
    bool pedal = false;
    float subPhase = 0, subValue = 0, subHold = 0, subNoise = 0;
    float ribbonSm = 0;
    Rng rng{0x1234567u};
    HalfbandDecimator dec;
    BbdChorus chorus;
    float outDcL = 0, outDcInL = 0, outDcR = 0, outDcInR = 0;
    int ctlCount = 0;
    float gainSm = 0.5f;
};

} // namespace t77
