// Nate Bloom fast pads for Linux: the same small sample player as the Android app, on miniaudio (PipeWire or
// PulseAudio, else ALSA or JACK), as a Node-API module the app's preload script loads.
// The page renders each pad's sound ahead of time and loads it here; a tap then only asks for a slot to play,
// which starts on the next audio block. Commands reach the audio thread through a queue it never waits on.
#define MINIAUDIO_IMPLEMENTATION
#define MA_NO_DECODING
#define MA_NO_ENCODING
#define MA_NO_GENERATION
#define MA_NO_RESOURCE_MANAGER
#define MA_NO_NODE_GRAPH
#define MA_NO_ENGINE
#include "miniaudio.h"

#include <node_api.h>
#include <algorithm>
#include <atomic>
#include <climits>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <vector>
#include "nbsynth_host.h"
#if __has_include(<ableton/Link.hpp>)
#include "nb_ablink.h"   // Ableton Link (native/ablink)
#define NB_HAS_ABLINK 1
#endif

namespace {

nbsh::Host gSynth;   // Nathan's plugin instruments, played here when the page turns fast plugins on

struct Sample {
    std::vector<int16_t> data;   // interleaved stereo
    int32_t frames = 0;
};

constexpr int kSlots = 512;      // pad * 8 + render
constexpr int kVoices = 64;
constexpr int kQueue = 1024;

std::shared_ptr<Sample> gSamples[kSlots];
std::mutex gSampleLock;

struct Voice {
    std::shared_ptr<Sample> s;
    int32_t pos = 0;
    float gl = 0, gr = 0;
    int choke = 0, pad = -1;
    int32_t fadeLeft = -1, fadeLen = 1;
    bool active = false;
};
Voice gVoices[kVoices];

enum CmdType { PLAY = 1, STOP_ALL = 2, STOP_PAD = 3, CHOKE = 4 };
struct Cmd {
    int type = 0, slot = 0, choke = 0, pad = -1;
    float gl = 0, gr = 0;
    std::shared_ptr<Sample> s;
};
Cmd gQueue[kQueue];
std::atomic<uint32_t> gHead{0}, gTail{0};
std::mutex gPushLock;

bool push(Cmd&& c) {
    std::lock_guard<std::mutex> l(gPushLock);
    uint32_t h = gHead.load(std::memory_order_relaxed), n = (h + 1) % kQueue;
    if (n == gTail.load(std::memory_order_acquire)) return false;
    gQueue[h] = std::move(c);
    gHead.store(n, std::memory_order_release);
    return true;
}
bool pop(Cmd& c) {
    uint32_t t = gTail.load(std::memory_order_relaxed);
    if (t == gHead.load(std::memory_order_acquire)) return false;
    c = std::move(gQueue[t]);
    gTail.store((t + 1) % kQueue, std::memory_order_release);
    return true;
}

std::mutex gDevLock;
ma_context gCtx;
ma_device gDev;
bool gCtxOk = false;
std::atomic<bool> gRunning{false};
std::atomic<int32_t> gRate{48000};
std::atomic<int64_t> gCallbacks{0};

void startFade(Voice& v, float ms) {
    int32_t len = std::max<int32_t>(16, (int32_t) (gRate.load() * ms / 1000.0f));
    if (v.fadeLeft < 0 || v.fadeLeft > len) { v.fadeLeft = len; v.fadeLen = len; }
}

void handle(Cmd& c) {
    if (c.type == STOP_ALL) { for (auto& v : gVoices) if (v.active) startFade(v, 15); return; }
    if (c.type == STOP_PAD) { for (auto& v : gVoices) if (v.active && v.pad == c.pad) startFade(v, 15); return; }
    if (c.type == CHOKE) { for (auto& v : gVoices) if (v.active && v.choke == c.choke && v.pad != c.pad) startFade(v, 8); return; }
    if (c.type != PLAY || !c.s || c.s->frames <= 0) return;
    if (c.choke > 0) for (auto& v : gVoices) if (v.active && v.choke == c.choke && v.pad != c.pad) startFade(v, 8);
    Voice* slot = nullptr;
    for (auto& v : gVoices) if (!v.active) { slot = &v; break; }
    if (!slot) {
        int32_t best = INT32_MAX;
        for (auto& v : gVoices) { int32_t left = v.s ? v.s->frames - v.pos : 0; if (left < best) { best = left; slot = &v; } }
    }
    slot->s = std::move(c.s);
    slot->pos = 0; slot->gl = c.gl; slot->gr = c.gr; slot->choke = c.choke; slot->pad = c.pad;
    slot->fadeLeft = -1; slot->fadeLen = 1; slot->active = true;
}

inline float softClip(float x) {
    float a = std::fabs(x);
    if (a <= 0.84f) return x;
    float y = 0.84f + 0.16f * std::tanh((a - 0.84f) / 0.16f);
    return x < 0 ? -y : y;
}

void onAudio(ma_device*, void* output, const void*, ma_uint32 frameCount) {
    float* out = static_cast<float*>(output);
    const int32_t numFrames = (int32_t) frameCount;
    std::memset(out, 0, sizeof(float) * 2 * numFrames);
    Cmd c;
    while (pop(c)) handle(c);
    for (auto& v : gVoices) {
        if (!v.active) continue;
        const Sample* s = v.s.get();
        if (!s) { v.active = false; continue; }
        int32_t n = std::min(numFrames, s->frames - v.pos);
        const int16_t* src = s->data.data() + 2 * v.pos;
        const float gl = v.gl * (1.0f / 32768.0f), gr = v.gr * (1.0f / 32768.0f);
        for (int32_t i = 0; i < n; i++) {
            float g = 1.0f;
            if (v.fadeLeft >= 0) {
                if (v.fadeLeft == 0) { n = i; break; }
                g = (float) v.fadeLeft / (float) v.fadeLen;
                v.fadeLeft--;
            }
            out[2 * i] += src[2 * i] * gl * g;
            out[2 * i + 1] += src[2 * i + 1] * gr * g;
        }
        v.pos += n;
        if (v.pos >= s->frames || v.fadeLeft == 0) { v.active = false; v.s.reset(); }
    }
    gSynth.process(out, numFrames);
    for (int32_t i = 0; i < 2 * numFrames; i++) out[i] = softClip(out[i]);
    gCallbacks.fetch_add(1, std::memory_order_relaxed);
}

// tests and the CI machine have no sound card: NB_FASTPADS_NULL=1 plays into miniaudio's silent "null" device
const bool gTestMode = std::getenv("NB_FASTPADS_TEST") != nullptr;

// the output the page picked (its name, as the sound server lists it); empty: the system default
std::string gWantDevice;
bool ensureContext() {
    if (gCtxOk) return true;
    ma_backend nullOnly[] = { ma_backend_null };
    const bool useNull = std::getenv("NB_FASTPADS_NULL") != nullptr;
    if (ma_context_init(useNull ? nullOnly : nullptr, useNull ? 1 : 0, nullptr, &gCtx) != MA_SUCCESS) return false;
    gCtxOk = true; return true;
}
bool openDevice() {
    if (gRunning.load()) return true;
    if (!ensureContext()) return false;
    ma_device_config cfg = ma_device_config_init(ma_device_type_playback);
    cfg.playback.format = ma_format_f32;
    cfg.playback.channels = 2;
    cfg.sampleRate = 48000;
    cfg.periodSizeInFrames = 256;          // about 5 ms
    cfg.periods = 2;
    cfg.performanceProfile = ma_performance_profile_low_latency;
    cfg.dataCallback = onAudio;
    cfg.pulse.pStreamNamePlayback = "Nate Bloom fast pads";
    ma_device_id chosen; bool haveChosen = false;
    if (!gWantDevice.empty()) {
        ma_device_info* pb = nullptr; ma_uint32 nb = 0;
        if (ma_context_get_devices(&gCtx, &pb, &nb, nullptr, nullptr) == MA_SUCCESS)
            for (ma_uint32 i = 0; i < nb && !haveChosen; i++)
                if (gWantDevice == pb[i].name || std::strstr(pb[i].name, gWantDevice.c_str()) || std::strstr(gWantDevice.c_str(), pb[i].name)) { chosen = pb[i].id; haveChosen = true; }
    }
    if (haveChosen) cfg.playback.pDeviceID = &chosen;
    if (ma_device_init(&gCtx, &cfg, &gDev) != MA_SUCCESS) return false;
    gRate.store((int32_t) gDev.sampleRate);
    if (ma_device_start(&gDev) != MA_SUCCESS) { ma_device_uninit(&gDev); return false; }
    gRunning.store(true);
    std::fprintf(stderr, "[NateBloomFast] %s, %u Hz, period %u x %u\n", ma_get_backend_name(gCtx.backend), gDev.sampleRate,
                 gDev.playback.internalPeriodSizeInFrames, gDev.playback.internalPeriods);
    return true;
}

void closeDevice() {
    if (!gRunning.load()) return;
    ma_device_uninit(&gDev);   // (stops the callback first)
    gRunning.store(false);
    for (auto& v : gVoices) { v.active = false; v.s.reset(); }
    Cmd c; while (pop(c)) {}
}

// ---------- Node-API ----------
napi_value boolean(napi_env env, bool b) { napi_value r; napi_get_boolean(env, b, &r); return r; }
napi_value undef(napi_env env) { napi_value r; napi_get_undefined(env, &r); return r; }
int32_t argInt(napi_env env, napi_value v, int32_t d = 0) { int32_t x = d; if (napi_get_value_int32(env, v, &x) != napi_ok) return d; return x; }
double argNum(napi_env env, napi_value v, double d = 0) { double x = d; if (napi_get_value_double(env, v, &x) != napi_ok) return d; return x; }
size_t args(napi_env env, napi_callback_info info, napi_value* argv, size_t n) { size_t argc = n; napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr); return argc; }

napi_value Start(napi_env env, napi_callback_info) { std::lock_guard<std::mutex> l(gDevLock); return boolean(env, openDevice()); }
napi_value Sleep(napi_env env, napi_callback_info) { std::lock_guard<std::mutex> l(gDevLock); closeDevice(); return undef(env); }
// setDevice(name): play on that output from now on ("" for the default); reopens if running
napi_value SetDevice(napi_env env, napi_callback_info info) {
    napi_value a[1]; char buf[512] = {0}; size_t len = 0;
    if (args(env, info, a, 1) >= 1) napi_get_value_string_utf8(env, a[0], buf, sizeof buf, &len);
    std::lock_guard<std::mutex> l(gDevLock);
    gWantDevice.assign(buf, len);
    if (!gRunning.load()) return boolean(env, true);
    closeDevice(); return boolean(env, openDevice());
}
// devices(): the playback outputs the sound server lists, as a JSON array of names
napi_value Devices(napi_env env, napi_callback_info) {
    std::lock_guard<std::mutex> l(gDevLock);
    std::string o = "[";
    ensureContext();
    ma_device_info* pb = nullptr; ma_uint32 nb = 0;
    if (gCtxOk && ma_context_get_devices(&gCtx, &pb, &nb, nullptr, nullptr) == MA_SUCCESS)
        for (ma_uint32 i = 0; i < nb; i++) { if (i) o += ","; o += "\""; for (const char* c = pb[i].name; *c; c++) { if (*c == '"' || *c == '\\') o += '\\'; o += *c; } o += "\""; }
    o += "]";
    napi_value r; napi_create_string_utf8(env, o.c_str(), NAPI_AUTO_LENGTH, &r); return r;
}
napi_value Rate(napi_env env, napi_callback_info) { napi_value r; napi_create_int32(env, gRate.load(), &r); return r; }

napi_value Info(napi_env env, napi_callback_info) {
    std::lock_guard<std::mutex> l(gDevLock);
    char buf[320];
    if (!gRunning.load()) std::snprintf(buf, sizeof buf, "{\"running\":false}");
    else {
        const ma_uint32 per = gDev.playback.internalPeriodSizeInFrames, n = gDev.playback.internalPeriods, sr = gDev.sampleRate ? gDev.sampleRate : 48000;
        // what the app holds (its periods) plus about one period in the sound server: an estimate, not a measurement
        const double ms = 1000.0 * (double) per * (n + 1) / sr;
        std::snprintf(buf, sizeof buf, "{\"running\":true,\"rate\":%u,\"burst\":%u,\"buffer\":%u,\"exclusive\":false,\"latencyMs\":%.1f,\"callbacks\":%lld,\"backend\":\"%s\"}",
                      sr, per, per * n, ms, (long long) gCallbacks.load(), ma_get_backend_name(gCtx.backend));
    }
    napi_value r; napi_create_string_utf8(env, buf, NAPI_AUTO_LENGTH, &r); return r;
}

// load(slot, Buffer of interleaved stereo int16 little-endian, frames)
napi_value Load(napi_env env, napi_callback_info info) {
    napi_value a[3]; if (args(env, info, a, 3) < 3) return boolean(env, false);
    const int32_t slot = argInt(env, a[0], -1); int32_t frames = argInt(env, a[2], 0);
    if (slot < 0 || slot >= kSlots || frames <= 0) return boolean(env, false);
    void* data = nullptr; size_t len = 0;
    bool isBuf = false; napi_is_buffer(env, a[1], &isBuf);
    if (isBuf) { if (napi_get_buffer_info(env, a[1], &data, &len) != napi_ok) return boolean(env, false); }
    else {
        bool isTa = false; napi_is_typedarray(env, a[1], &isTa); if (!isTa) return boolean(env, false);
        napi_typedarray_type t; size_t n; napi_value ab; size_t off;
        if (napi_get_typedarray_info(env, a[1], &t, &n, &data, &ab, &off) != napi_ok) return boolean(env, false);
        len = n * (t == napi_int16_array ? 2 : 1);
    }
    frames = std::min<int32_t>(frames, (int32_t) (len / 4));
    auto s = std::make_shared<Sample>();
    s->frames = frames; s->data.resize((size_t) frames * 2);
    std::memcpy(s->data.data(), data, (size_t) frames * 4);
    { std::lock_guard<std::mutex> l(gSampleLock); gSamples[slot] = std::move(s); }
    return boolean(env, true);
}

napi_value Clear(napi_env env, napi_callback_info info) {
    napi_value a[1]; if (args(env, info, a, 1) < 1) return undef(env);
    const int32_t slot = argInt(env, a[0], -1);
    if (slot >= 0 && slot < kSlots) { std::lock_guard<std::mutex> l(gSampleLock); gSamples[slot].reset(); }
    return undef(env);
}

napi_value Play(napi_env env, napi_callback_info info) {
    napi_value a[5]; if (args(env, info, a, 5) < 5) return boolean(env, false);
    const int32_t slot = argInt(env, a[0], -1); if (slot < 0 || slot >= kSlots || !(gRunning.load() || gTestMode)) return boolean(env, false);
    Cmd c;
    { std::lock_guard<std::mutex> l(gSampleLock); c.s = gSamples[slot]; }
    if (!c.s) return boolean(env, false);
    c.type = PLAY; c.slot = slot; c.gl = (float) argNum(env, a[1]); c.gr = (float) argNum(env, a[2]); c.choke = argInt(env, a[3]); c.pad = argInt(env, a[4], -1);
    return boolean(env, push(std::move(c)));
}

napi_value StopAll(napi_env env, napi_callback_info) { Cmd c; c.type = STOP_ALL; push(std::move(c)); return undef(env); }
napi_value StopPad(napi_env env, napi_callback_info info) { napi_value a[1]; args(env, info, a, 1); Cmd c; c.type = STOP_PAD; c.pad = argInt(env, a[0], -1); push(std::move(c)); return undef(env); }
napi_value Choke(napi_env env, napi_callback_info info) { napi_value a[2]; args(env, info, a, 2); Cmd c; c.type = CHOKE; c.choke = argInt(env, a[0]); c.pad = argInt(env, a[1], -1); push(std::move(c)); return undef(env); }

// test only: run the mixer for n frames without a sound card, return the first left sample
napi_value TestPull(napi_env env, napi_callback_info info) {
    napi_value a[1]; args(env, info, a, 1);
    const int32_t n = std::max(1, std::min(4096, argInt(env, a[0], 256)));
    std::vector<float> buf((size_t) n * 2);
    if (!gRunning.load()) onAudio(nullptr, buf.data(), nullptr, (ma_uint32) n);
    napi_value r; napi_create_double(env, gRunning.load() ? -1 : buf[0], &r); return r;
}

// Nathan's plugin instruments
napi_value SynthList(napi_env env, napi_callback_info) { const std::string s = gSynth.list(); napi_value r; napi_create_string_utf8(env, s.c_str(), NAPI_AUTO_LENGTH, &r); return r; }
napi_value SynthLoad(napi_env env, napi_callback_info info) { napi_value a[1]; args(env, info, a, 1); return boolean(env, gSynth.load(argInt(env, a[0], -1), gRate.load())); }
napi_value SynthOff(napi_env env, napi_callback_info info) { napi_value a[1]; args(env, info, a, 1); gSynth.off(argInt(env, a[0], -1)); return undef(env); }
napi_value SynthMidi(napi_env env, napi_callback_info info) { napi_value a[4]; args(env, info, a, 4); gSynth.midi(argInt(env, a[0], -1), argInt(env, a[1]), argInt(env, a[2]), argInt(env, a[3])); return undef(env); }
napi_value SynthParam(napi_env env, napi_callback_info info) { napi_value a[3]; args(env, info, a, 3); gSynth.param(argInt(env, a[0], -1), argInt(env, a[1], -1), (float) argNum(env, a[2])); return undef(env); }
napi_value SynthTempo(napi_env env, napi_callback_info info) { napi_value a[2]; args(env, info, a, 2); gSynth.tempo(argNum(env, a[0], 120), argInt(env, a[1])); return undef(env); }
napi_value SynthGain(napi_env env, napi_callback_info info) { napi_value a[2]; args(env, info, a, 2); gSynth.setGain(argInt(env, a[0], -1), (float) argNum(env, a[1], 1)); return undef(env); }

#ifdef NB_HAS_ABLINK
// Ableton Link: tempo, beat grid and Play/Stop shared with Bitwig and the other Link apps on the network
nbabl::Session gAbl;
napi_value dbl(napi_env env, double x) { napi_value r; napi_create_double(env, x, &r); return r; }
napi_value AblEnable(napi_env env, napi_callback_info info) { napi_value a[2]; args(env, info, a, 2); bool on = false; napi_get_value_bool(env, a[0], &on); return boolean(env, gAbl.enable(on, argNum(env, a[1], 120))); }
napi_value AblSync(napi_env env, napi_callback_info info) { napi_value a[1]; args(env, info, a, 1); bool on = true; napi_get_value_bool(env, a[0], &on); gAbl.setSync(on); return undef(env); }
napi_value AblState(napi_env env, napi_callback_info info) { napi_value a[1]; args(env, info, a, 1); const std::string s = gAbl.state(argNum(env, a[0], 4)); napi_value r; napi_create_string_utf8(env, s.c_str(), NAPI_AUTO_LENGTH, &r); return r; }
napi_value AblNow(napi_env env, napi_callback_info) { return dbl(env, gAbl.now()); }
napi_value AblTimeAtBeat(napi_env env, napi_callback_info info) { napi_value a[2]; args(env, info, a, 2); return dbl(env, gAbl.timeAtBeat(argNum(env, a[0]), argNum(env, a[1], 4))); }
napi_value AblTempo(napi_env env, napi_callback_info info) { napi_value a[1]; args(env, info, a, 1); gAbl.setTempo(argNum(env, a[0], 0)); return undef(env); }
napi_value AblStart(napi_env env, napi_callback_info info) { napi_value a[2]; args(env, info, a, 2); return dbl(env, gAbl.start(argNum(env, a[0]), argNum(env, a[1], 4))); }
napi_value AblStop(napi_env env, napi_callback_info info) { napi_value a[1]; args(env, info, a, 1); gAbl.stop(argNum(env, a[0])); return undef(env); }
#endif

napi_value Init(napi_env env, napi_value exports) {
    const napi_property_descriptor props[] = {
        { "start", nullptr, Start, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "sleep", nullptr, Sleep, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "info", nullptr, Info, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "rate", nullptr, Rate, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "load", nullptr, Load, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "clear", nullptr, Clear, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "play", nullptr, Play, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "stopAll", nullptr, StopAll, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "stopPad", nullptr, StopPad, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "choke", nullptr, Choke, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "testPull", nullptr, TestPull, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "setDevice", nullptr, SetDevice, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "devices", nullptr, Devices, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "synthList", nullptr, SynthList, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "synthLoad", nullptr, SynthLoad, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "synthOff", nullptr, SynthOff, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "synthMidi", nullptr, SynthMidi, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "synthParam", nullptr, SynthParam, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "synthTempo", nullptr, SynthTempo, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "synthGain", nullptr, SynthGain, nullptr, nullptr, nullptr, napi_default, nullptr },
#ifdef NB_HAS_ABLINK
        { "ablEnable", nullptr, AblEnable, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "ablSync", nullptr, AblSync, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "ablState", nullptr, AblState, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "ablNow", nullptr, AblNow, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "ablTimeAtBeat", nullptr, AblTimeAtBeat, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "ablTempo", nullptr, AblTempo, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "ablStart", nullptr, AblStart, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "ablStop", nullptr, AblStop, nullptr, nullptr, nullptr, napi_default, nullptr },
#endif
    };
    napi_define_properties(env, exports, sizeof props / sizeof props[0], props);
    return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
