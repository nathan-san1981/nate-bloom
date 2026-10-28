// Nathan's plugin instruments in the apps' fast audio (Android AAudio, Linux miniaudio): the same DSP as the web
// app (its WebAssembly through wasm2c, see nbsynth.c), playing straight to the speakers. Notes and knob changes
// reach the audio thread through a queue it never waits on; each audio block, every instrument that's on renders
// and is mixed in with the pads.
#pragma once
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include "nbsynth.h"

namespace nbsh {

enum SType { S_MIDI = 1, S_PARAM = 2, S_TEMPO = 3, S_GAIN = 4, S_ON = 5, S_OFF = 6 };
struct SCmd { int type = 0, plug = -1, a = 0, b = 0, c = 0; float v = 0; double d = 0; };

class Host {
public:
    static constexpr int kMax = 16, kQ = 2048;

    // [ "twin77", ... ] as JSON
    std::string list() const {
        std::string s = "[";
        for (int i = 0; i < nbs_count(); i++) { if (i) s += ","; s += "\""; s += nbs_id(i); s += "\""; }
        return s + "]";
    }
    int find(const char* id) const { return nbs_find(id); }

    // start an instrument at this rate (it plays once its first notes arrive); not on the audio thread
    bool load(int i, int rate) {
        if (i < 0 || i >= nbs_count() || i >= kMax) return false;
        std::lock_guard<std::mutex> l(load_);
        if (on_[i].load() && rate_[i] == rate) { SCmd c; c.type = S_ON; c.plug = i; push(c); return true; }   // already running: just notes off (S_ON resets)
        if (on_[i].load()) { off(i); std::this_thread::sleep_for(std::chrono::milliseconds(30)); }   // (the audio thread lets go of it first)
        if (!nbs_create(i, (float) rate)) return false;
        rate_[i] = rate;
        gain_[i] = gain_[i] > 0 ? gain_[i] : 1.0f;
        on_[i].store(true);
        return true;
    }
    void off(int i) { if (i >= 0 && i < kMax) { SCmd c; c.type = S_OFF; c.plug = i; push(c); on_[i].store(false); } }
    void midi(int i, int st, int d1, int d2) { SCmd c; c.type = S_MIDI; c.plug = i; c.a = st; c.b = d1; c.c = d2; push(c); }
    void param(int i, int idx, float v) { SCmd c; c.type = S_PARAM; c.plug = i; c.a = idx; c.v = v; push(c); }
    void tempo(double bpm, int playing) { SCmd c; c.type = S_TEMPO; c.d = bpm; c.a = playing; push(c); }
    void setGain(int i, float g) { SCmd c; c.type = S_GAIN; c.plug = i; c.v = g; push(c); }
    bool anyOn() const { for (int i = 0; i < kMax; i++) if (on_[i].load(std::memory_order_relaxed)) return true; return false; }

    // the audio thread: add every playing instrument into out (interleaved stereo)
    void process(float* out, int frames) {
        static thread_local bool ready = false;
        if (!ready) { nbs_thread_init(); ready = true; }
        SCmd c;
        while (pop(c)) apply(c);
        for (int i = 0; i < kMax && i < nbs_count(); i++) {
            if (!play_[i]) continue;
            const float g = g_[i];
            for (int at = 0; at < frames;) {
                const int n = std::min(512, frames - at);
                if (!nbs_render(i, n, L_, R_)) { play_[i] = false; on_[i].store(false); break; }
                for (int k = 0; k < n; k++) { out[2 * (at + k)] += L_[k] * g; out[2 * (at + k) + 1] += R_[k] * g; }
                at += n;
            }
        }
    }

private:
    void apply(const SCmd& c) {
        if (c.type == S_TEMPO) { for (int i = 0; i < kMax && i < nbs_count(); i++) if (play_[i]) nbs_tempo(i, c.d, c.a); tempo_ = c.d; playing_ = c.a; return; }
        if (c.plug < 0 || c.plug >= kMax) return;
        switch (c.type) {
            case S_ON: if (play_[c.plug]) nbs_reset(c.plug); break;
            case S_OFF: if (play_[c.plug]) nbs_reset(c.plug); play_[c.plug] = false; break;
            case S_GAIN: g_[c.plug] = c.v; break;
            case S_PARAM: nbs_param(c.plug, c.a, c.v); break;
            case S_MIDI:
                if (!play_[c.plug] && on_[c.plug].load() && nbs_alive(c.plug)) { play_[c.plug] = true; if (tempo_ > 0) nbs_tempo(c.plug, tempo_, playing_); }
                if (play_[c.plug]) nbs_midi(c.plug, c.a, c.b, c.c);
                break;
        }
        if (c.type == S_PARAM && !play_[c.plug] && on_[c.plug].load() && nbs_alive(c.plug)) play_[c.plug] = true;
    }
    bool push(const SCmd& c) {
        std::lock_guard<std::mutex> l(push_);
        uint32_t h = head_.load(std::memory_order_relaxed), n = (h + 1) % kQ;
        if (n == tail_.load(std::memory_order_acquire)) return false;
        q_[h] = c; head_.store(n, std::memory_order_release); return true;
    }
    bool pop(SCmd& c) {
        uint32_t t = tail_.load(std::memory_order_relaxed);
        if (t == head_.load(std::memory_order_acquire)) return false;
        c = q_[t]; tail_.store((t + 1) % kQ, std::memory_order_release); return true;
    }
    SCmd q_[kQ];
    std::atomic<uint32_t> head_{0}, tail_{0};
    std::mutex push_, load_;
    std::atomic<bool> on_[kMax] = {};
    int rate_[kMax] = {};
    float gain_[kMax] = {};
    // audio thread only
    bool play_[kMax] = {};
    float g_[kMax] = { 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 };
    double tempo_ = 0; int playing_ = 0;
    float L_[512], R_[512];
};

}  // namespace nbsh
