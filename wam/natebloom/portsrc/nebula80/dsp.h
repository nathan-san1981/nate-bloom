// Hypnagogia — DSP building blocks
#pragma once
#include <cmath>
#include <cstdint>
#include <vector>
#include <algorithm>

namespace hyp {

constexpr float kPi = 3.14159265358979323846f;

inline float clampf(float x, float a, float b) { return x < a ? a : (x > b ? b : x); }

// sin(2*pi*t), t in turns, parabolic approximation with one refinement (~ -56 dB harmonics)
inline float sinTurns(float t) {
    t -= std::floor(t);
    float u = t - 0.5f;
    float y = 8.f * u - 16.f * u * std::fabs(u);
    y = 0.225f * (y * std::fabs(y) - y) + y;
    return -y;
}

inline float fastTanh(float x) {
    if (x > 3.f) return 1.f;
    if (x < -3.f) return -1.f;
    float x2 = x * x;
    return x * (27.f + x2) / (27.f + 9.f * x2);
}

inline float blep(float t, float dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1.f; }
    if (t > 1.f - dt) { t = (t - 1.f) / dt; return t * t + t + t + 1.f; }
    return 0.f;
}

struct Rng {
    uint32_t s = 0x9E3779B9u;
    inline uint32_t next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; }
    inline float uni() { return (next() >> 8) * (1.f / 16777216.f); }
    inline float bi() { return uni() * 2.f - 1.f; }
};

// 4-pole ladder, TPT stages, instantaneous feedback solve + saturating input
struct Ladder {
    float s[4] = {0, 0, 0, 0};
    void reset() { s[0] = s[1] = s[2] = s[3] = 0.f; }
    inline float process(float x, float g, float k) {
        const float G = g / (1.f + g);
        const float b = 1.f / (1.f + g);
        const float G2 = G * G, G3 = G2 * G, G4 = G3 * G;
        const float S = b * (G3 * s[0] + G2 * s[1] + G * s[2] + s[3]);
        const float xin = x * (1.f + 0.6f * k);
        const float y4 = (G4 * xin + S) / (1.f + k * G4);
        float y = fastTanh(xin - k * y4);
        for (int i = 0; i < 4; ++i) {
            float v = (y - s[i]) * G;
            float o = v + s[i];
            s[i] = o + v;
            y = o;
        }
        return y;
    }
};

// Simper/Cytomic state-variable filter
struct SVF {
    float ic1 = 0, ic2 = 0, a1 = 1, a2 = 0, a3 = 0;
    void reset() { ic1 = ic2 = 0.f; }
    void set(float g, float k) { a1 = 1.f / (1.f + g * (g + k)); a2 = g * a1; a3 = g * a2; }
    inline float bp(float v0) {  // peak gain 1/k
        float v3 = v0 - ic2;
        float v1 = a1 * ic1 + a2 * v3;
        float v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2.f * v1 - ic1;
        ic2 = 2.f * v2 - ic2;
        return v1;
    }
    // returns lowpass, writes highpass / bandpass
    inline float tick(float v0, float k, float& hp, float& bp) {
        float v3 = v0 - ic2;
        float v1 = a1 * ic1 + a2 * v3;
        float v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2.f * v1 - ic1;
        ic2 = 2.f * v2 - ic2;
        bp = v1;
        hp = v0 - k * v1 - v2;
        return v2;
    }
};


struct Env {
    int st = 0;  // 0 idle 1 attack 2 decay 3 sustain 4 release
    float v = 0.f;
    void on() { st = 1; v = 0.f; }
    void off() { if (st != 0) st = 4; }
    inline float next(float aInc, float dCoef, float s, float rCoef) {
        switch (st) {
            case 1: v += aInc; if (v >= 1.f) { v = 1.f; st = 2; } break;
            case 2: v = s + (v - s) * dCoef; if (std::fabs(v - s) < 1e-4f) st = 3; break;
            case 3: v += (s - v) * 0.002f; break;
            case 4: v *= rCoef; if (v < 1e-4f) { v = 0.f; st = 0; } break;
            default: break;
        }
        return v;
    }
};

struct DelayLine {
    std::vector<float> b;
    int mask = 0, w = 0;
    void init(int minSize) {
        int s = 1;
        while (s < minSize) s <<= 1;
        b.assign(s, 0.f);
        mask = s - 1;
        w = 0;
    }
    void clear() { std::fill(b.begin(), b.end(), 0.f); w = 0; }
    inline void write(float x) { b[w] = x; w = (w + 1) & mask; }
    // d >= 1 : d = 1 is the most recent write
    inline float tap(float d) const {
        int i = (int)d;
        float fr = d - (float)i;
        float a = b[(w - i) & mask];
        float c = b[(w - i - 1) & mask];
        return a + (c - a) * fr;
    }
    inline float tapInt(int d) const { return b[(w - d) & mask]; }
};

struct Allpass {
    std::vector<float> b;
    int n = 1, i = 0;
    float g = 0.65f;
    void init(int len, float gain) { n = std::max(1, len); b.assign(n, 0.f); i = 0; g = gain; }
    void clear() { std::fill(b.begin(), b.end(), 0.f); }
    inline float process(float x) {
        float d = b[i];
        float v = x + g * d;
        float y = d - g * v;
        b[i] = v;
        if (++i >= n) i = 0;
        return y;
    }
};

// Juno-60 style BBD chorus (mono in, stereo wet out)
struct JunoChorus {
    DelayLine d;
    float ph = 0, lpL = 0, lpR = 0, lpA = 0.5f, sr = 48000;
    void init(float sampleRate) {
        sr = sampleRate;
        d.init((int)(sr * 0.02f) + 8);
        ph = lpL = lpR = 0;
        lpA = 1.f - std::exp(-2.f * kPi * 7500.f / sr);
    }
    void clear() { d.clear(); lpL = lpR = 0; }
    inline void process(float in, float& wL, float& wR, int mode) {
        d.write(in);
        float rate, mn, mx;
        switch (mode) {
            case 2: rate = 0.863f; mn = 1.66f; mx = 5.35f; break;
            case 3: rate = 9.75f;  mn = 3.30f; mx = 3.70f; break;
            default: rate = 0.513f; mn = 1.66f; mx = 5.35f; break;
        }
        ph += rate / sr;
        if (ph >= 1.f) ph -= 1.f;
        float tri = 1.f - 4.f * std::fabs(ph - 0.5f);
        float c = 0.5f * (mn + mx), dep = 0.5f * (mx - mn);
        float dl = std::max(1.f, (c + dep * tri) * sr * 0.001f);
        float dr = std::max(1.f, (c - dep * tri) * sr * 0.001f);
        lpL += lpA * (d.tap(dl) - lpL);
        lpR += lpA * (d.tap(dr) - lpR);
        wL = lpL;
        wR = lpR;
    }
};

// Wow/flutter tape transport + darkening
struct Tape {
    DelayLine dl, dr;
    float wow = 0, flut = 0, rnd = 0, rndT = 0, lpL = 0, lpR = 0, sr = 48000;
    int rndCnt = 0;
    Rng rng;
    void init(float sampleRate) {
        sr = sampleRate;
        dl.init((int)(sr * 0.06f));
        dr.init((int)(sr * 0.06f));
        wow = flut = rnd = rndT = lpL = lpR = 0;
    }
    void clear() { dl.clear(); dr.clear(); lpL = lpR = 0; }
    inline void process(float& L, float& R, float wobble, float lpA) {
        dl.write(L);
        dr.write(R);
        wow += 0.45f / sr; if (wow >= 1.f) wow -= 1.f;
        flut += 6.3f / sr; if (flut >= 1.f) flut -= 1.f;
        if (--rndCnt <= 0) { rndT = rng.bi(); rndCnt = (int)(0.12f * sr); }
        rnd += (rndT - rnd) * (8.f / sr);
        float ms = 8.f + wobble * (3.2f * sinTurns(wow) + 0.22f * sinTurns(flut) + 1.4f * rnd);
        float d = ms * sr * 0.001f;
        lpL += lpA * (dl.tap(d) - lpL);
        lpR += lpA * (dr.tap(d + wobble * 0.00015f * sr) - lpR);
        L = lpL;
        R = lpR;
    }
};

// Tempo-synced stutter echo that can freeze into a seamless loop
struct EchoJam {
    DelayLine l, r;
    bool frozen = false;
    int start = 0, loopLen = 1, p = 0, xf = 1;
    float sr = 48000;
    void init(float sampleRate) {
        sr = sampleRate;
        l.init((int)(sr * 9.f));
        r.init((int)(sr * 9.f));
        frozen = false;
    }
    void clear() { l.clear(); r.clear(); frozen = false; fadeLeft = 0; }
    int fadeLeft = 0, fadeLen = 1;

    inline void loopSample(float& jL, float& jR) {
        int i = (start + p) & l.mask;
        jL = l.b[i];
        jR = r.b[i];
        int edge = loopLen - xf;
        if (p >= edge) {
            float t = (float)(p - edge + 1) / (float)xf;
            int j = (start + p - loopLen) & l.mask;
            jL += (l.b[j] - jL) * t;
            jR += (r.b[j] - jR) * t;
        }
        if (++p >= loopLen) p = 0;
    }

    inline void process(float& L, float& R, float mix, int len, bool freeze) {
        len = std::max(16, std::min(len, l.mask - (int)(0.05f * sr)));
        if (freeze != frozen) {
            if (freeze) {
                loopLen = len;
                start = (l.w - loopLen) & l.mask;
                p = 0;
                xf = std::max(1, std::min(loopLen / 4, (int)(0.012f * sr)));
            }
            frozen = freeze;
            fadeLen = fadeLeft = (int)(0.02f * sr);
        }
        float jL, jR;
        if (frozen) {
            // the echo tap that the live path would have read is the loop sample itself
            int i = (start + p) & l.mask;
            float oldL = L + 0.8f * l.b[i], oldR = R + 0.8f * r.b[i];
            loopSample(jL, jR);
            if (fadeLeft > 0) {
                float t = (float)fadeLeft-- / (float)fadeLen;
                jL += (oldL - jL) * t;
                jR += (oldR - jR) * t;
            }
        } else {
            float rl = l.tapInt(len), rr = r.tapInt(len);
            l.write(L + rl * 0.5f);
            r.write(R + rr * 0.5f);
            jL = L + rl * 0.8f;
            jR = R + rr * 0.8f;
            if (fadeLeft > 0) {  // fade out of the loop we were playing
                float oL, oR;
                loopSample(oL, oR);
                float t = (float)fadeLeft-- / (float)fadeLen;
                jL += (oL - jL) * t;
                jR += (oR - jR) * t;
            }
        }
        L += (jL - L) * mix;
        R += (jR - R) * mix;
    }
};

struct PingPong {
    DelayLine l, r;
    float cur = 0, lpL = 0, lpR = 0, hpL = 0, hpR = 0, aLP = 0.3f, aHP = 0.02f, sr = 48000;
    void init(float sampleRate) {
        sr = sampleRate;
        l.init((int)(sr * 2.6f));
        r.init((int)(sr * 2.6f));
        cur = 0;
        aLP = 1.f - std::exp(-2.f * kPi * 4500.f / sr);
        aHP = 1.f - std::exp(-2.f * kPi * 180.f / sr);
    }
    void clear() { l.clear(); r.clear(); lpL = lpR = hpL = hpR = 0; }
    inline void process(float& L, float& R, float mix, float target, float fb) {
        target = clampf(target, 1.f, (float)(l.mask - 2));
        if (cur < 1.f) cur = target;
        cur += (target - cur) * (20.f / sr);
        float rl = l.tap(cur), rr = r.tap(cur);
        lpL += aLP * (rl - lpL); hpL += aHP * (lpL - hpL);
        lpR += aLP * (rr - lpR); hpR += aHP * (lpR - hpR);
        l.write(0.5f * (L + R) + (lpR - hpR) * fb);
        r.write((lpL - hpL) * fb);
        L += rl * mix;
        R += rr * mix;
    }
};

// 8-line FDN reverb with Hadamard mixing, damping and light modulation
struct Reverb {
    DelayLine line[8];
    float len[8] = {}, lp[8] = {}, gain[8] = {};
    Allpass apL[2], apR[2];
    float dampA = 0.5f, sr = 48000, modPh = 0, lastSize = -1;
    void init(float sampleRate, float scale = 1.f, float dampHz = 5200.f) {
        sr = sampleRate;
        static const float ms[8] = {41.3f, 47.9f, 53.1f, 59.3f, 67.7f, 73.9f, 83.3f, 91.7f};
        for (int i = 0; i < 8; ++i) {
            len[i] = ms[i] * scale * sr * 0.001f;
            line[i].init((int)len[i] + 64);
            lp[i] = 0;
        }
        float k = sr / 44100.f;
        apL[0].init((int)(142 * k), 0.7f); apL[1].init((int)(379 * k), 0.65f);
        apR[0].init((int)(107 * k), 0.7f); apR[1].init((int)(277 * k), 0.65f);
        dampA = 1.f - std::exp(-2.f * kPi * dampHz / sr);
        lastSize = -1;
    }
    void clear() {
        for (auto& d : line) d.clear();
        for (auto& a : apL) a.clear();
        for (auto& a : apR) a.clear();
        for (float& x : lp) x = 0;
    }
    void setSize(float size) {
        if (std::fabs(size - lastSize) < 1e-4f) return;
        lastSize = size;
        float t60 = 0.7f * std::pow(28.f, size);  // 0.7 s .. ~20 s
        for (int i = 0; i < 8; ++i) gain[i] = std::pow(10.f, -3.f * len[i] / (t60 * sr));
    }
    inline void process(float inL, float inR, float& oL, float& oR) {
        float xL = apL[1].process(apL[0].process(inL));
        float xR = apR[1].process(apR[0].process(inR));
        modPh += 0.31f / sr;
        if (modPh >= 1.f) modPh -= 1.f;
        float o[8];
        for (int i = 0; i < 8; ++i) {
            float d = len[i];
            if (i == 1) d += 7.f * sinTurns(modPh);
            if (i == 6) d += 7.f * sinTurns(modPh + 0.37f);
            float x = line[i].tap(d);
            lp[i] += dampA * (x - lp[i]);
            o[i] = lp[i];
        }
        oL = (o[0] + o[2] + o[4] + o[6]) * 0.35f;
        oR = (o[1] + o[3] + o[5] + o[7]) * 0.35f;
        for (int h = 1; h < 8; h <<= 1)
            for (int i = 0; i < 8; i += h << 1)
                for (int j = i; j < i + h; ++j) {
                    float a = o[j], b = o[j + h];
                    o[j] = a + b;
                    o[j + h] = a - b;
                }
        const float norm = 0.35355339f;
        for (int i = 0; i < 8; ++i) line[i].write(o[i] * norm * gain[i] + ((i & 1) ? xR : xL) * 0.4f);
    }
};

// Tri-phase BBD string ensemble (Solina / VP-330 style), mono in, stereo wet out
struct Ensemble {
    DelayLine d;
    float ph = 0, ph2 = 0, sr = 48000, lpL = 0, lpR = 0, lpA = 0.5f;
    void init(float sampleRate) {
        sr = sampleRate;
        d.init((int)(sr * 0.03f) + 8);
        lpA = 1.f - std::exp(-2.f * kPi * 9000.f / sr);
    }
    void clear() { d.clear(); lpL = lpR = 0; }
    inline void process(float in, float& wL, float& wR) {
        d.write(in);
        ph += 0.62f / sr; if (ph >= 1.f) ph -= 1.f;
        ph2 += 6.1f / sr; if (ph2 >= 1.f) ph2 -= 1.f;
        float t[3];
        for (int i = 0; i < 3; ++i) {
            float ms = 7.f + 1.6f * sinTurns(ph + i / 3.f) + 0.12f * sinTurns(ph2 + i / 3.f);
            t[i] = d.tap(ms * sr * 0.001f);
        }
        lpL += lpA * (t[0] + 0.5f * t[1] - lpL);
        lpR += lpA * (t[2] + 0.5f * t[1] - lpR);
        wL = lpL * 0.8f;
        wR = lpR * 0.8f;
    }
};

}  // namespace hyp
