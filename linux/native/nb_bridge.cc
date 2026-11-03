// (187) Nate Bloom ↔ Bitwig, the app's side (in nbfastpads.node, the page's renderer):
//  - the bridge's shared memory (nb_bridge_shm.h): made here and kept alive; a thread copies, every millisecond,
//    between it and the page's own shared memory (a SharedArrayBuffer the page's AudioWorklet and MIDI loop use):
//    the page's sound into each slot's out ring, the host's MIDI and audio from it;
//  - JACK ports (optional): "Nate Bloom" in JACK / PipeWire with a stereo pair for the mix and for each part, fed the
//    same way (each pair claims a slot, as a bridge plugin would);
//  - ALSA MIDI ports (no root, no kernel module): "Nate Bloom in" for other apps to play Nate Bloom (its notes come to
//    the page like a bridge's), and "Nate Bloom send" → "Nate Bloom out", so the page's MIDI out reaches other apps.
// libjack and libasound are opened at run time: without them the rest still works.
#include <node_api.h>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include <dlfcn.h>
#include <fcntl.h>
#include <poll.h>
#include <pthread.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
#include "nb_bridge_shm.h"

namespace nbbrapp {
using namespace nbbr;

// the page's shared memory, per slot (NSLOT + 1: the last is the ALSA "Nate Bloom in" port, MIDI only)
static const int HS = 32;      // header doubles per slot
static const int NM = 512;     // MIDI entries per slot (frame, b0, b1, b2)
enum { H_STATE, H_GEN, H_SR, H_NOW, H_READ, H_OUTW, H_INW, H_LAT, H_BPM, H_PLAY, H_SONG, H_MHEAD, H_MTAIL, H_AGE, H_HASIN,
       H_NAMEGEN, H_UNDER, H_KIND /* 1 plugin, 2 JACK */, H_AF, H_AW, H_RATIO };

static Shm* gShm = nullptr; static int gShmFd = -1;
static double* gH = nullptr; static float* gR = nullptr; static double* gM = nullptr;
static napi_ref gHRef = nullptr, gRRef = nullptr, gMRef = nullptr;
static std::thread gThr; static std::atomic<bool> gRun{false};
static std::mutex gMu;
static int64_t gCopied[NSLOT + 1], gInCopied[NSLOT + 1]; static uint32_t gGen[NSLOT + 1]; static uint64_t gBeat[NSLOT + 1]; static int64_t gBeatAt[NSLOT + 1];

static int64_t nowMs() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (int64_t)t.tv_sec * 1000 + t.tv_nsec / 1000000; }

static bool shmOpen() {
  if (gShm) return true;
  const int fd = shm_open(SHM_NAME, O_CREAT | O_RDWR, 0666); if (fd < 0) return false;
  fchmod(fd, 0666);
  struct stat st{}; fstat(fd, &st);
  const bool fresh = (size_t)st.st_size != sizeof(Shm);
  if (fresh && ftruncate(fd, sizeof(Shm)) != 0) { close(fd); return false; }
  void* p = mmap(nullptr, sizeof(Shm), PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  if (p == MAP_FAILED) { close(fd); return false; }
  gShm = (Shm*)p; gShmFd = fd;
  if (fresh || gShm->magic != MAGIC || gShm->version != VERSION) { memset((void*)gShm, 0, sizeof(Shm)); gShm->version = VERSION; gShm->nslot = NSLOT; gShm->magic = MAGIC; }
  gShm->appPid = (uint32_t)getpid();
  return true;
}

// ---------------- JACK (optional) ----------------
typedef void* jack_client_t; typedef void* jack_port_t; typedef uint32_t jack_nframes_t;
struct Jk {
  void* lib = nullptr; jack_client_t c = nullptr; std::atomic<bool> on{false};
  jack_client_t (*open)(const char*, int, int*, ...) = nullptr; int (*close)(jack_client_t) = nullptr;
  jack_port_t (*reg)(jack_client_t, const char*, const char*, unsigned long, unsigned long) = nullptr;
  int (*setProc)(jack_client_t, int (*)(jack_nframes_t, void*), void*) = nullptr; int (*act)(jack_client_t) = nullptr;
  void* (*buf)(jack_port_t, jack_nframes_t) = nullptr; jack_nframes_t (*sr)(jack_client_t) = nullptr;
  struct Part { int slot = -1; jack_port_t L = nullptr, R = nullptr; int64_t P = 0; uint32_t lat = 0; };
  std::vector<Part> parts; std::string why; uint32_t rate = 0;
} gJ;
static int claimSlot(const char* name, uint32_t sr, uint32_t lat, uint32_t kind) {
  if (!gShm) return -1;
  for (int i = 0; i < NSLOT; i++) { uint32_t z = 0; Slot& s = gShm->slot[i];
    if (s.state.compare_exchange_strong(z, 1)) {
      s.now.store(0); s.readPos.store(0); s.writePos.store(0); s.inWrite.store(0); s.under.store(0); s.mHead.store(0); s.mTail.store(0);
      s.sr = sr; s.latency = lat; s.hasIn = 0; s.pad0 = kind;
      snprintf(s.name, sizeof s.name, "%s", name); s.nameGen.fetch_add(1); s.gen.fetch_add(1);
      return i; } }
  return -1;
}
static int jackProc(jack_nframes_t n, void*) {
  if (!gShm) return 0;
  for (auto& p : gJ.parts) {
    float* L = (float*)gJ.buf(p.L, n); float* R = (float*)gJ.buf(p.R, n); if (!L || !R) continue;
    if (p.slot < 0) { memset(L, 0, n * 4); memset(R, 0, n * 4); continue; }
    Slot& s = gShm->slot[p.slot];
    s.now.store(p.P, std::memory_order_release);
    const int64_t rd = p.P - p.lat, W = s.writePos.load(std::memory_order_acquire);
    uint64_t miss = 0;
    for (jack_nframes_t i = 0; i < n; i++) { const int64_t ix = rd + i;
      if (ix >= 0 && ix < W && ix > W - RING) { L[i] = s.out[0][ix & (RING - 1)]; R[i] = s.out[1][ix & (RING - 1)]; } else { L[i] = R[i] = 0; miss++; } }
    if (miss && W > 0) s.under.fetch_add(miss);
    s.readPos.store(rd + n, std::memory_order_release); s.beat.fetch_add(1);
    p.P += n;
  }
  return 0;
}
static bool jackStart(int nparts) {
  if (gJ.on.load()) return true;
  if (!gJ.lib) { gJ.lib = dlopen("libjack.so.0", RTLD_NOW | RTLD_LOCAL); if (!gJ.lib) { gJ.why = "JACK (or PipeWire's JACK, pipewire-jack) isn't installed"; return false; }
    gJ.open = (jack_client_t (*)(const char*, int, int*, ...))dlsym(gJ.lib, "jack_client_open"); gJ.close = (int (*)(jack_client_t))dlsym(gJ.lib, "jack_client_close");
    gJ.reg = (jack_port_t (*)(jack_client_t, const char*, const char*, unsigned long, unsigned long))dlsym(gJ.lib, "jack_port_register");
    gJ.setProc = (int (*)(jack_client_t, int (*)(jack_nframes_t, void*), void*))dlsym(gJ.lib, "jack_set_process_callback");
    gJ.act = (int (*)(jack_client_t))dlsym(gJ.lib, "jack_activate"); gJ.buf = (void* (*)(jack_port_t, jack_nframes_t))dlsym(gJ.lib, "jack_port_get_buffer");
    gJ.sr = (jack_nframes_t (*)(jack_client_t))dlsym(gJ.lib, "jack_get_sample_rate"); }
  if (!gJ.open || !gJ.reg || !gJ.setProc || !gJ.act || !gJ.buf || !gJ.sr) { gJ.why = "this libjack is missing functions"; return false; }
  int status = 0; gJ.c = gJ.open("Nate Bloom", 1 /* JackNoStartServer */, &status);
  if (!gJ.c) { gJ.why = "no JACK server to join (PipeWire's JACK needs pipewire-jack)"; return false; }
  gJ.rate = gJ.sr(gJ.c); gJ.parts.clear();
  const uint32_t lat = ((uint32_t)(0.030 * gJ.rate) + 127) / 128 * 128;
  for (int k = 0; k <= nparts; k++) {
    Jk::Part p; char nm[64];
    if (k == 0) snprintf(nm, sizeof nm, "JACK · mix"); else snprintf(nm, sizeof nm, "JACK · part %d", k);
    p.slot = claimSlot(nm, gJ.rate, lat, 2); p.lat = lat;
    char pl[32], pr[32]; if (k == 0) { snprintf(pl, sizeof pl, "mix L"); snprintf(pr, sizeof pr, "mix R"); } else { snprintf(pl, sizeof pl, "part %d L", k); snprintf(pr, sizeof pr, "part %d R", k); }
    p.L = gJ.reg(gJ.c, pl, "32 bit float mono audio", 2 /* JackPortIsOutput */, 0); p.R = gJ.reg(gJ.c, pr, "32 bit float mono audio", 2, 0);
    gJ.parts.push_back(p);
  }
  gJ.setProc(gJ.c, jackProc, nullptr);
  if (gJ.act(gJ.c) != 0) { gJ.close(gJ.c); gJ.c = nullptr; for (auto& p : gJ.parts) if (p.slot >= 0) gShm->slot[p.slot].state.store(0); gJ.parts.clear(); gJ.why = "JACK wouldn't start the client"; return false; }
  gJ.on.store(true); gJ.why = "";
  return true;
}
static void jackStop() {
  if (!gJ.on.load()) return;
  gJ.on.store(false); if (gJ.c && gJ.close) gJ.close(gJ.c); gJ.c = nullptr;
  for (auto& p : gJ.parts) if (p.slot >= 0 && gShm) gShm->slot[p.slot].state.store(0);
  gJ.parts.clear();
}

// ---------------- ALSA sequencer ports (optional) ----------------
struct SeqEv {   // snd_seq_event_t (28 bytes)
  uint8_t type, flags, tag, queue; uint32_t time[2]; uint8_t srcClient, srcPort, dstClient, dstPort;
  union { struct { uint8_t channel, note, velocity, off; uint32_t duration; } note; struct { uint8_t channel, u[3]; uint32_t param; int32_t value; } ctrl; uint8_t raw[12]; } d;
};
struct Sq {
  void* lib = nullptr; void* h = nullptr; int pIn = -1, pSend = -1, pOut = -1, client = -1; std::thread thr; std::atomic<bool> run{false}; std::string why;
  int (*open)(void**, const char*, int, int) = nullptr; int (*close)(void*) = nullptr; int (*setName)(void*, const char*) = nullptr;
  int (*mkPort)(void*, const char*, unsigned int, unsigned int) = nullptr; int (*input)(void*, SeqEv**) = nullptr;
  int (*outDirect)(void*, SeqEv*) = nullptr; int (*pollN)(void*, short) = nullptr; int (*pollD)(void*, struct pollfd*, unsigned int, short) = nullptr;
  int (*clientId)(void*) = nullptr; int (*pending)(void*, int) = nullptr;
  int (*meNew)(size_t, void**) = nullptr; long (*meDecode)(void*, unsigned char*, long, const SeqEv*) = nullptr; void (*meNoStat)(void*, int) = nullptr;
  void* dec = nullptr;
} gS;
static void pushMidi(int slot, int64_t frame, const uint8_t* b, int n) {
  if (!gH || !gM) return;
  double* H = gH + slot * HS; const int64_t head = (int64_t)H[H_MHEAD]; double* m = gM + ((size_t)slot * NM + (head % NM)) * 4;
  m[0] = (double)frame; m[1] = b[0]; m[2] = n > 1 ? b[1] : 0; m[3] = n > 2 ? b[2] : 0;
  H[H_MHEAD] = (double)(head + 1);
}
static void seqLoop() {
  pthread_setname_np(pthread_self(), "nb-midiports");
  const int nfd = gS.pollN(gS.h, POLLIN); std::vector<struct pollfd> fds(nfd > 0 ? nfd : 1);
  while (gS.run.load()) {
    gS.pollD(gS.h, fds.data(), fds.size(), POLLIN);
    if (poll(fds.data(), fds.size(), 100) <= 0) continue;
    do {
      SeqEv* ev = nullptr; if (gS.input(gS.h, &ev) < 0 || !ev) break;
      if (ev->dstPort == gS.pSend) {   // the page's MIDI out → "Nate Bloom out"
        SeqEv o = *ev; o.srcPort = (uint8_t)gS.pOut; o.dstClient = 254; o.dstPort = 253; o.queue = 253; gS.outDirect(gS.h, &o);
      } else if (ev->dstPort == gS.pIn) {   // another app → the page (like a bridge's MIDI, stamped "now")
        unsigned char b[16]; const long n = gS.meDecode ? gS.meDecode(gS.dec, b, sizeof b, ev) : -1;
        if (n > 0 && n <= 3) { std::lock_guard<std::mutex> lk(gMu); pushMidi(NSLOT, -1, b, (int)n); }
      }
    } while (gS.pending && gS.pending(gS.h, 0) > 0);
  }
}
static bool seqStart() {
  if (gS.run.load()) return true;
  if (!gS.lib) { gS.lib = dlopen("libasound.so.2", RTLD_NOW | RTLD_LOCAL); if (!gS.lib) { gS.why = "no libasound"; return false; }
    gS.open = (int (*)(void**, const char*, int, int))dlsym(gS.lib, "snd_seq_open"); gS.close = (int (*)(void*))dlsym(gS.lib, "snd_seq_close");
    gS.setName = (int (*)(void*, const char*))dlsym(gS.lib, "snd_seq_set_client_name"); gS.mkPort = (int (*)(void*, const char*, unsigned int, unsigned int))dlsym(gS.lib, "snd_seq_create_simple_port");
    gS.input = (int (*)(void*, SeqEv**))dlsym(gS.lib, "snd_seq_event_input"); gS.outDirect = (int (*)(void*, SeqEv*))dlsym(gS.lib, "snd_seq_event_output_direct");
    gS.pollN = (int (*)(void*, short))dlsym(gS.lib, "snd_seq_poll_descriptors_count"); gS.pollD = (int (*)(void*, struct pollfd*, unsigned int, short))dlsym(gS.lib, "snd_seq_poll_descriptors");
    gS.clientId = (int (*)(void*))dlsym(gS.lib, "snd_seq_client_id"); gS.pending = (int (*)(void*, int))dlsym(gS.lib, "snd_seq_event_input_pending");
    gS.meNew = (int (*)(size_t, void**))dlsym(gS.lib, "snd_midi_event_new"); gS.meDecode = (long (*)(void*, unsigned char*, long, const SeqEv*))dlsym(gS.lib, "snd_midi_event_decode");
    gS.meNoStat = (void (*)(void*, int))dlsym(gS.lib, "snd_midi_event_no_status"); }
  if (!gS.open || !gS.mkPort || !gS.input || !gS.outDirect || !gS.pollN || !gS.pollD) { gS.why = "this libasound is missing functions"; return false; }
  if (gS.open(&gS.h, "default", 3 /* duplex */, 0) < 0) { gS.why = "the ALSA sequencer isn't there (/dev/snd/seq)"; gS.h = nullptr; return false; }
  gS.setName(gS.h, "Nate Bloom");
  const unsigned W = (1u << 1) | (1u << 6), R = (1u << 0) | (1u << 5), T = (1u << 1) | (1u << 20) | (1u << 16);
  gS.pIn = gS.mkPort(gS.h, "Nate Bloom in", W, T); gS.pSend = gS.mkPort(gS.h, "Nate Bloom send", W, T); gS.pOut = gS.mkPort(gS.h, "Nate Bloom out", R, T);
  gS.client = gS.clientId ? gS.clientId(gS.h) : -1;
  if (gS.meNew && gS.meNew(64, &gS.dec) == 0 && gS.meNoStat) gS.meNoStat(gS.dec, 1);
  gS.run.store(true); gS.thr = std::thread(seqLoop);
  return true;
}

// ---------------- the copier ----------------
static void loop() {
  pthread_setname_np(pthread_self(), "nb-bridge");
  int64_t lastBeat = 0;
  while (gRun.load()) {
    const int64_t t = nowMs();
    if (t - lastBeat >= 5) { gShm->appBeat.fetch_add(1); lastBeat = t; }
    if (gH) gShm->appSr = (uint32_t)gH[(NSLOT + 1) * HS + 0];
    for (int i = 0; i < NSLOT; i++) {
      Slot& s = gShm->slot[i]; double* H = gH + i * HS;
      const uint32_t st = s.state.load(std::memory_order_acquire);
      if (!st) { if (H[H_STATE] != 0) H[H_STATE] = 0; continue; }
      const uint32_t gen = s.gen.load();
      if (gen != gGen[i] || H[H_STATE] == 0) {   // a new claim: both sides start over
        std::lock_guard<std::mutex> lk(gMu);
        gGen[i] = gen; gCopied[i] = 0; gInCopied[i] = 0; gBeat[i] = s.beat.load(); gBeatAt[i] = t;
        H[H_OUTW] = 0; H[H_INW] = 0; H[H_MHEAD] = 0; H[H_MTAIL] = 0; H[H_AF] = 0; H[H_AW] = 0; H[H_RATIO] = 0;
        H[H_GEN] = (double)gen; H[H_STATE] = 1;
        s.mTail.store(s.mHead.load());
      }
      H[H_SR] = s.sr; H[H_NOW] = (double)s.now.load(std::memory_order_acquire); H[H_READ] = (double)s.readPos.load(std::memory_order_acquire);
      H[H_LAT] = s.latency; H[H_BPM] = s.bpm; H[H_PLAY] = s.playing; H[H_SONG] = s.songBeats; H[H_HASIN] = s.hasIn; H[H_NAMEGEN] = s.nameGen.load(); H[H_UNDER] = (double)s.under.load(); H[H_KIND] = s.pad0 ? s.pad0 : 1;
      const uint64_t b = s.beat.load(); if (b != gBeat[i]) { gBeat[i] = b; gBeatAt[i] = t; } H[H_AGE] = (double)(t - gBeatAt[i]);
      // the page's sound → the slot's out ring
      const int64_t pw = (int64_t)H[H_OUTW];
      if (pw > gCopied[i]) {
        int64_t from = std::max(gCopied[i], pw - (int64_t)RING + 1);
        float* oL = gR + ((size_t)i * 4 + 0) * RING; float* oR = gR + ((size_t)i * 4 + 1) * RING;
        for (int64_t x = from; x < pw; ) { const int a = (int)(x & (RING - 1)); const int64_t n = std::min<int64_t>(pw - x, RING - a);
          memcpy(&s.out[0][a], oL + a, n * 4); memcpy(&s.out[1][a], oR + a, n * 4); x += n; }
        gCopied[i] = pw; s.writePos.store(pw, std::memory_order_release);
      } else if (pw < gCopied[i]) { gCopied[i] = pw; s.writePos.store(pw, std::memory_order_release); }   // (the page started over)
      // the host's audio → the page
      const int64_t iw = s.inWrite.load(std::memory_order_acquire);
      if (iw > gInCopied[i]) {
        int64_t from = std::max(gInCopied[i], iw - (int64_t)RING + 1);
        float* iL = gR + ((size_t)i * 4 + 2) * RING; float* iR = gR + ((size_t)i * 4 + 3) * RING;
        for (int64_t x = from; x < iw; ) { const int a = (int)(x & (RING - 1)); const int64_t n = std::min<int64_t>(iw - x, RING - a);
          memcpy(iL + a, &s.in[0][a], n * 4); memcpy(iR + a, &s.in[1][a], n * 4); x += n; }
        gInCopied[i] = iw; H[H_INW] = (double)iw;
      }
      // its MIDI → the page
      uint32_t tl = s.mTail.load(), hd = s.mHead.load(std::memory_order_acquire);
      if (tl != hd) { std::lock_guard<std::mutex> lk(gMu);
        while (tl != hd) { const MidiEv& e = s.mev[tl % NMIDI]; pushMidi(i, e.frame, e.b, 3); tl++; }
        s.mTail.store(tl); }
    }
    timespec ts{0, 1000000}; nanosleep(&ts, nullptr);
  }
}

// ---------------- N-API ----------------
static size_t getargs(napi_env env, napi_callback_info info, napi_value* a, size_t n) { size_t c = n; napi_get_cb_info(env, info, &c, a, nullptr, nullptr); return c; }
static double argd(napi_env env, napi_value v, double d = 0) { double x = d; if (napi_get_value_double(env, v, &x) != napi_ok) return d; return x; }
static napi_value boolv(napi_env env, bool b) { napi_value v; napi_get_boolean(env, b, &v); return v; }
static void* typed(napi_env env, napi_value v, size_t* len) { napi_typedarray_type t; size_t n; void* d = nullptr; napi_value ab; size_t off;
  if (napi_get_typedarray_info(env, v, &t, &n, &d, &ab, &off) != napi_ok) return nullptr;
  if (len) *len = n;
  return d; }
static napi_value jstr(napi_env env, const std::string& s) { napi_value v; napi_create_string_utf8(env, s.c_str(), s.size(), &v); return v; }

// br_start(hdr Float64Array((NSLOT+2)*HS), rings Float32Array(NSLOT*4*RING), midi Float64Array((NSLOT+1)*NM*4)) -> true
static napi_value Start(napi_env env, napi_callback_info info) {
  napi_value a[3]; if (getargs(env, info, a, 3) < 3) return boolv(env, false);
  size_t hl = 0, rl = 0, ml = 0; double* h = (double*)typed(env, a[0], &hl); float* r = (float*)typed(env, a[1], &rl); double* m = (double*)typed(env, a[2], &ml);
  if (!h || !r || !m || hl < (size_t)(NSLOT + 2) * HS || rl < (size_t)NSLOT * 4 * RING || ml < (size_t)(NSLOT + 1) * NM * 4) return boolv(env, false);
  if (!shmOpen()) return boolv(env, false);
  if (gRun.load()) { gRun.store(false); if (gThr.joinable()) gThr.join(); }
  { std::lock_guard<std::mutex> lk(gMu);
    if (gHRef) napi_delete_reference(env, gHRef); if (gRRef) napi_delete_reference(env, gRRef); if (gMRef) napi_delete_reference(env, gMRef);
    napi_create_reference(env, a[0], 1, &gHRef); napi_create_reference(env, a[1], 1, &gRRef); napi_create_reference(env, a[2], 1, &gMRef);
    gH = h; gR = r; gM = m; for (int i = 0; i <= NSLOT; i++) { gGen[i] = 0xffffffffu; gCopied[i] = gInCopied[i] = 0; } }
  gRun.store(true); gThr = std::thread(loop);
  return boolv(env, true);
}
// br_info() -> JSON: each claimed slot's name, the JACK and MIDI ports' state
static napi_value Info(napi_env env, napi_callback_info) {
  std::string j = "{\"slots\":[";
  if (gShm) for (int i = 0; i < NSLOT; i++) { Slot& s = gShm->slot[i]; if (i) j += ",";
    char nm[70]; memcpy(nm, s.name, 64); nm[64] = 0; std::string e; for (const char* p = nm; *p; p++) { if (*p == '"' || *p == '\\') e += '\\'; if ((unsigned char)*p >= 32) e += *p; }
    j += "{\"state\":" + std::to_string(s.state.load()) + ",\"name\":\"" + e + "\",\"kind\":" + std::to_string(s.pad0 ? s.pad0 : 1) + "}"; }
  j += "],\"jack\":{\"on\":" + std::string(gJ.on.load() ? "true" : "false") + ",\"rate\":" + std::to_string(gJ.rate) + ",\"why\":\"" + gJ.why + "\",\"parts\":" + std::to_string(gJ.parts.empty() ? 0 : (int)gJ.parts.size() - 1) + "}";
  j += ",\"midi\":{\"on\":" + std::string(gS.run.load() ? "true" : "false") + ",\"client\":" + std::to_string(gS.client) + ",\"why\":\"" + gS.why + "\"}";
  j += ",\"shm\":" + std::string(gShm ? "true" : "false") + "}";
  return jstr(env, j);
}
static napi_value Jack(napi_env env, napi_callback_info info) {   // br_jack(on, parts) -> true when on
  napi_value a[2]; const size_t n = getargs(env, info, a, 2); bool on = false; if (n) napi_get_value_bool(env, a[0], &on);
  if (!on) { jackStop(); return boolv(env, false); }
  if (!shmOpen()) return boolv(env, false);
  if (gJ.on.load()) jackStop();
  return boolv(env, jackStart(std::max(0, std::min(8, n > 1 ? (int)argd(env, a[1], 4) : 4))));
}
static napi_value Midi(napi_env env, napi_callback_info info) {   // br_midi(on) -> true when the ports are there
  napi_value a[1]; bool on = true; if (getargs(env, info, a, 1)) napi_get_value_bool(env, a[0], &on);
  if (!on) { if (gS.run.load()) { gS.run.store(false); if (gS.thr.joinable()) gS.thr.join(); if (gS.h && gS.close) gS.close(gS.h); gS.h = nullptr; } return boolv(env, false); }
  return boolv(env, seqStart());
}
static napi_value Stop(napi_env env, napi_callback_info) {
  jackStop();
  if (gS.run.load()) { gS.run.store(false); if (gS.thr.joinable()) gS.thr.join(); if (gS.h && gS.close) gS.close(gS.h); gS.h = nullptr; }
  if (gRun.load()) { gRun.store(false); if (gThr.joinable()) gThr.join(); }
  return boolv(env, true);
}
}  // namespace nbbrapp

extern "C" napi_value nb_bridge_init(napi_env env, napi_value exports) {
  using namespace nbbrapp;
  const napi_property_descriptor d[] = {
    { "br_start", nullptr, Start, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "br_info", nullptr, Info, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "br_jack", nullptr, Jack, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "br_midi", nullptr, Midi, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "br_stop", nullptr, Stop, nullptr, nullptr, nullptr, napi_default, nullptr },
  };
  napi_define_properties(env, exports, sizeof d / sizeof d[0], d);
  return exports;
}
