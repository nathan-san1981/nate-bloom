// Nate Bloom fast pads: a small low-latency sample player on AAudio.
// The page renders each pad's sound (at a few hit strengths) and hands the audio over once; a tap then only sends
// "play slot N at this gain", which this engine starts on its next audio block, with the shortest output buffer
// the device allows. Commands arrive on a lock-free queue so the audio thread never waits.
#include <aaudio/AAudio.h>
#include <android/log.h>
#include <jni.h>
#include <atomic>
#include <cmath>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <time.h>
#include <vector>
#include "nbsynth_host.h"

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "NateBloomFast", __VA_ARGS__)

namespace {

struct Sample {
    std::vector<int16_t> data;   // interleaved stereo (16-bit keeps 64 pads x 8 renders in a modest amount of memory)
    int32_t frames = 0;
};

constexpr int kSlots = 512;     // pad * 8 + render (64 pads x 3 strengths x 2 takes, and room)
constexpr int kVoices = 64;
constexpr int kQueue = 1024;

std::shared_ptr<Sample> gSamples[kSlots];
std::mutex gSampleLock;          // only taken when loading, never on the audio thread's hot path for long

struct Voice {
    std::shared_ptr<Sample> s;
    int32_t pos = 0;
    float gl = 0, gr = 0;
    int choke = 0, pad = -1;
    int32_t fadeLeft = -1, fadeLen = 1;   // > 0 while fading out
    bool active = false;
};
Voice gVoices[kVoices];
nbsh::Host gSynth;   // Nathan's plugin instruments, played here when the page turns fast plugins on

enum CmdType { PLAY = 1, STOP_ALL = 2, STOP_PAD = 3, CHOKE = 4 };
struct Cmd {
    int type = 0, slot = 0, choke = 0, pad = -1;
    float gl = 0, gr = 0;
    std::shared_ptr<Sample> s;
};

// producers take a lock (the JavaScript bridge thread, now and then the UI thread); the audio callback never does
Cmd gQueue[kQueue];
std::atomic<uint32_t> gHead{0}, gTail{0};
std::mutex gPushLock;

bool push(Cmd&& c) {
    std::lock_guard<std::mutex> l(gPushLock);
    uint32_t h = gHead.load(std::memory_order_relaxed);
    uint32_t n = (h + 1) % kQueue;
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

std::atomic<AAudioStream*> gStream{nullptr};
std::mutex gStreamLock;
std::atomic<int32_t> gRate{48000};
std::atomic<float> gMaster{1.0f};
std::atomic<int64_t> gCallbacks{0};
std::atomic<bool> gExclusive{false};

void startFade(Voice& v, float ms) {
    int32_t len = std::max(16, (int32_t) (gRate.load() * ms / 1000.0f));
    if (v.fadeLeft < 0 || v.fadeLeft > len) { v.fadeLeft = len; v.fadeLen = len; }
}

void handle(Cmd& c) {
    if (c.type == STOP_ALL) {
        for (auto& v : gVoices) if (v.active) startFade(v, 15);
        return;
    }
    if (c.type == STOP_PAD) {
        for (auto& v : gVoices) if (v.active && v.pad == c.pad) startFade(v, 15);
        return;
    }
    if (c.type == CHOKE) {
        for (auto& v : gVoices) if (v.active && v.choke == c.choke && v.pad != c.pad) startFade(v, 8);
        return;
    }
    if (c.type != PLAY || !c.s || c.s->frames <= 0) return;
    if (c.choke > 0) for (auto& v : gVoices) if (v.active && v.choke == c.choke && v.pad != c.pad) startFade(v, 8);
    // a free voice, or steal the one closest to its end
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
    // linear up to 0.84, then a smooth knee to 1.0 (the same idea as the web app's safety shaper)
    float a = std::fabs(x);
    if (a <= 0.84f) return x;
    float y = 0.84f + 0.16f * std::tanh((a - 0.84f) / 0.16f);
    return x < 0 ? -y : y;
}

std::atomic<int32_t> gXruns{0};
int32_t gBurst = 0;

aaudio_data_callback_result_t onAudio(AAudioStream* stream, void*, void* audioData, int32_t numFrames) {
    float* out = static_cast<float*>(audioData);
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
    float m = gMaster.load(std::memory_order_relaxed);
    for (int32_t i = 0; i < 2 * numFrames; i++) out[i] = softClip(out[i] * m);
    // every so often: if the device missed a deadline, give it one more burst of room (at most 6)
    if ((gCallbacks.fetch_add(1, std::memory_order_relaxed) & 127) == 0 && gBurst > 0) {
        int32_t x = AAudioStream_getXRunCount(stream);
        if (x > gXruns.load(std::memory_order_relaxed)) {
            gXruns.store(x, std::memory_order_relaxed);
            int32_t cur = AAudioStream_getBufferSizeInFrames(stream);
            if (cur < gBurst * 6) AAudioStream_setBufferSizeInFrames(stream, cur + gBurst);
        }
    }
    return AAUDIO_CALLBACK_RESULT_CONTINUE;
}

bool openStream();

void onError(AAudioStream*, void*, aaudio_result_t error) {
    LOG("stream error %d, reopening", error);
    // the stream can't be closed from this callback: reopen from another thread
    std::thread([] {
        std::lock_guard<std::mutex> l(gStreamLock);
        AAudioStream* old = gStream.exchange(nullptr);
        if (old) { AAudioStream_requestStop(old); AAudioStream_close(old); }
        openStream();
    }).detach();
}

bool openStreamWith(aaudio_sharing_mode_t sharing) {
    AAudioStreamBuilder* b = nullptr;
    if (AAudio_createStreamBuilder(&b) != AAUDIO_OK) return false;
    AAudioStreamBuilder_setDirection(b, AAUDIO_DIRECTION_OUTPUT);
    AAudioStreamBuilder_setPerformanceMode(b, AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);
    AAudioStreamBuilder_setSharingMode(b, sharing);
    AAudioStreamBuilder_setFormat(b, AAUDIO_FORMAT_PCM_FLOAT);
    AAudioStreamBuilder_setChannelCount(b, 2);
    AAudioStreamBuilder_setUsage(b, AAUDIO_USAGE_MEDIA);   // like the web view's own audio, so both get the same sound settings
    AAudioStreamBuilder_setContentType(b, AAUDIO_CONTENT_TYPE_MUSIC);
    AAudioStreamBuilder_setDataCallback(b, onAudio, nullptr);
    AAudioStreamBuilder_setErrorCallback(b, onError, nullptr);
    AAudioStream* s = nullptr;
    aaudio_result_t r = AAudioStreamBuilder_openStream(b, &s);
    AAudioStreamBuilder_delete(b);
    if (r != AAUDIO_OK || !s) { LOG("open failed (%s): %s", sharing == AAUDIO_SHARING_MODE_EXCLUSIVE ? "exclusive" : "shared", AAudio_convertResultToText(r)); return false; }
    int32_t burst = AAudioStream_getFramesPerBurst(s);
    gBurst = burst; gXruns.store(0);
    if (burst > 0) AAudioStream_setBufferSizeInFrames(s, burst * 2);
    gRate.store(AAudioStream_getSampleRate(s));
    gExclusive.store(AAudioStream_getSharingMode(s) == AAUDIO_SHARING_MODE_EXCLUSIVE);
    if (AAudioStream_requestStart(s) != AAUDIO_OK) { AAudioStream_close(s); return false; }
    gStream = s;
    LOG("stream open: %d Hz, burst %d, buffer %d, %s", gRate.load(), burst, AAudioStream_getBufferSizeInFrames(s), gExclusive.load() ? "exclusive" : "shared");
    return true;
}

bool openStream() {
    return openStreamWith(AAUDIO_SHARING_MODE_EXCLUSIVE) || openStreamWith(AAUDIO_SHARING_MODE_SHARED);
}

double latencyMs() {
    AAudioStream* s = gStream.load();
    if (!s) return -1;
    int64_t hwFrame = 0, hwTime = 0;
    if (AAudioStream_getTimestamp(s, CLOCK_MONOTONIC, &hwFrame, &hwTime) != AAUDIO_OK) {
        // no timestamp yet: the buffer itself is the best estimate
        return 1000.0 * AAudioStream_getBufferSizeInFrames(s) / gRate.load();
    }
    int64_t written = AAudioStream_getFramesWritten(s);
    timespec ts{};
    clock_gettime(CLOCK_MONOTONIC, &ts);
    int64_t now = (int64_t) ts.tv_sec * 1000000000LL + ts.tv_nsec;
    double appFrameHwTime = (double) hwTime + (double) (written - hwFrame) * 1e9 / gRate.load();
    return (appFrameHwTime - (double) now) / 1e6;
}

}  // namespace

extern "C" {

JNIEXPORT jboolean JNICALL Java_com_natebloom_app_FastPads_nStart(JNIEnv*, jobject) {
    std::lock_guard<std::mutex> l(gStreamLock);
    if (gStream) return JNI_TRUE;
    return openStream() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nStop(JNIEnv*, jobject) {
    std::lock_guard<std::mutex> l(gStreamLock);
    AAudioStream* s = gStream.exchange(nullptr);
    if (!s) return;
    AAudioStream_requestStop(s);
    AAudioStream_close(s);
    for (auto& v : gVoices) { v.active = false; v.s.reset(); }   // (the callback has stopped)
    Cmd c; while (pop(c)) {}
}

JNIEXPORT jstring JNICALL Java_com_natebloom_app_FastPads_nInfo(JNIEnv* env, jobject) {
    std::lock_guard<std::mutex> l(gStreamLock);
    char buf[256];
    if (!gStream) {
        snprintf(buf, sizeof buf, "{\"running\":false}");
    } else {
        AAudioStream* s = gStream.load();
        snprintf(buf, sizeof buf, "{\"running\":true,\"rate\":%d,\"burst\":%d,\"buffer\":%d,\"exclusive\":%s,\"latencyMs\":%.1f,\"callbacks\":%lld,\"xruns\":%d}",
                 gRate.load(), AAudioStream_getFramesPerBurst(s), AAudioStream_getBufferSizeInFrames(s),
                 gExclusive.load() ? "true" : "false", latencyMs(), (long long) gCallbacks.load(), AAudioStream_getXRunCount(s));
    }
    return env->NewStringUTF(buf);
}

// pcm: interleaved stereo 16-bit at the engine's rate
JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nLoad(JNIEnv* env, jobject, jint slot, jshortArray pcm, jint frames) {
    if (slot < 0 || slot >= kSlots) return;
    auto s = std::make_shared<Sample>();
    jsize n = env->GetArrayLength(pcm);
    frames = std::min<jint>(frames, n / 2);
    s->frames = frames;
    s->data.resize((size_t) frames * 2);
    jshort* p = env->GetShortArrayElements(pcm, nullptr);
    std::memcpy(s->data.data(), p, sizeof(int16_t) * (size_t) frames * 2);
    env->ReleaseShortArrayElements(pcm, p, JNI_ABORT);
    std::lock_guard<std::mutex> l(gSampleLock);
    gSamples[slot] = std::move(s);
}

JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nClear(JNIEnv*, jobject, jint slot) {
    if (slot < 0 || slot >= kSlots) return;
    std::lock_guard<std::mutex> l(gSampleLock);
    gSamples[slot].reset();
}

JNIEXPORT jboolean JNICALL Java_com_natebloom_app_FastPads_nPlay(JNIEnv*, jobject, jint slot, jfloat gl, jfloat gr, jint choke, jint pad) {
    if (slot < 0 || slot >= kSlots) return JNI_FALSE;
    Cmd c;
    {
        std::lock_guard<std::mutex> l(gSampleLock);
        c.s = gSamples[slot];
    }
    if (!c.s || !gStream.load()) return JNI_FALSE;
    c.type = PLAY; c.slot = slot; c.gl = gl; c.gr = gr; c.choke = choke; c.pad = pad;
    return push(std::move(c)) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nStopAll(JNIEnv*, jobject) {
    Cmd c; c.type = STOP_ALL; push(std::move(c));
}

JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nStopPad(JNIEnv*, jobject, jint pad) {
    Cmd c; c.type = STOP_PAD; c.pad = pad; push(std::move(c));
}

JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nChoke(JNIEnv*, jobject, jint group, jint exceptPad) {
    Cmd c; c.type = CHOKE; c.choke = group; c.pad = exceptPad; push(std::move(c));
}

JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nMaster(JNIEnv*, jobject, jfloat g) {
    gMaster.store(g);
}

JNIEXPORT jint JNICALL Java_com_natebloom_app_FastPads_nRate(JNIEnv*, jobject) {
    return gRate.load();
}

}  // extern "C"

// Nathan's plugin instruments (native/nbsynth)
extern "C" JNIEXPORT jstring JNICALL Java_com_natebloom_app_FastPads_nSynthList(JNIEnv* env, jobject) { return env->NewStringUTF(gSynth.list().c_str()); }
extern "C" JNIEXPORT jboolean JNICALL Java_com_natebloom_app_FastPads_nSynthLoad(JNIEnv*, jobject, jint i) { return gSynth.load(i, gRate.load()) ? JNI_TRUE : JNI_FALSE; }
extern "C" JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nSynthOff(JNIEnv*, jobject, jint i) { gSynth.off(i); }
extern "C" JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nSynthMidi(JNIEnv*, jobject, jint i, jint a, jint b, jint c) { gSynth.midi(i, a, b, c); }
extern "C" JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nSynthParam(JNIEnv*, jobject, jint i, jint k, jfloat v) { gSynth.param(i, k, v); }
extern "C" JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nSynthTempo(JNIEnv*, jobject, jdouble bpm, jint playing) { gSynth.tempo(bpm, playing); }
extern "C" JNIEXPORT void JNICALL Java_com_natebloom_app_FastPads_nSynthGain(JNIEnv*, jobject, jint i, jfloat g) { gSynth.setGain(i, g); }
