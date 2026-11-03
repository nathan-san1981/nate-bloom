// Nate Bloom Bridge: a CLAP instrument for Bitwig (or any CLAP host) that plays a sound of Nate Bloom's and brings its
// sound back on the host's track, in time. Put one on a track; in Nate Bloom's Bitwig sheet pick what it plays (any
// sound, or everything). The track's notes, knobs and wheels go to Nate Bloom; its sound comes back delayed by the
// latency this plugin reports, which the host makes up for, so it lands exactly where the notes are. Audio sent into
// the plugin's input (a sidechain) reaches Nate Bloom too. The two meet in /dev/shm/nate-bloom-bridge
// (../native/nb_bridge_shm.h). Without Nate Bloom running it's silent and waits for it.
#include <clap/clap.h>
#include <clap/ext/track-info.h>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
#include "../native/nb_bridge_shm.h"

using namespace nbbr;

struct Br {
  clap_plugin_t pl; const clap_host_t* host;
  const clap_host_track_info_t* hti = nullptr; const clap_host_latency_t* hlat = nullptr;
  Shm* sh = nullptr; int slot = -1; int lastSlot = -1; double sr = 48000; uint32_t lat = 1536; int64_t P = 0;
  uint64_t appBeatSeen = 0; int64_t appBeatAt = 0; bool appAlive = false; std::atomic<bool> wantOpen{false}; int idle = 0;
  char name[64] = "Bridge";
};
static Br* me(const clap_plugin_t* p) { return (Br*)p->plugin_data; }
static int64_t ms() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (int64_t)t.tv_sec * 1000 + t.tv_nsec / 1000000; }

static const char* FEAT[] = { CLAP_PLUGIN_FEATURE_INSTRUMENT, CLAP_PLUGIN_FEATURE_SYNTHESIZER, CLAP_PLUGIN_FEATURE_STEREO, nullptr };
static const clap_plugin_descriptor_t DESC = { CLAP_VERSION, "com.natebloom.bridge", "Nate Bloom Bridge", "Nate Bloom",
  "https://nathan-san1981.github.io/nate-bloom/", "", "", "1.0.0", "Plays a sound of Nate Bloom's and brings it back on this track, in time", FEAT };

// ---- the shared memory ----
static bool shOpen(Br* b) {
  if (b->sh) return true;
  const int fd = shm_open(SHM_NAME, O_RDWR, 0); if (fd < 0) return false;
  struct stat st{}; fstat(fd, &st); if ((size_t)st.st_size != sizeof(Shm)) { close(fd); return false; }
  void* p = mmap(nullptr, sizeof(Shm), PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0); close(fd);
  if (p == MAP_FAILED) return false;
  Shm* s = (Shm*)p; if (s->magic != MAGIC || s->version != VERSION) { munmap(p, sizeof(Shm)); return false; }
  b->sh = s; return true;
}
static void setName(Br* b) {
  if (b->hti) { clap_track_info_t ti{}; if (b->hti->get(b->host, &ti) && (ti.flags & CLAP_TRACK_INFO_HAS_TRACK_NAME) && ti.name[0]) snprintf(b->name, sizeof b->name, "%.63s", ti.name); }
  if (b->sh && b->slot >= 0) { Slot& s = b->sh->slot[b->slot]; snprintf(s.name, sizeof s.name, "%s", b->name); s.nameGen.fetch_add(1); }
}
static bool claim(Br* b) {
  if (b->slot >= 0) return true;
  if (!shOpen(b)) return false;
  auto take = [&](int i) { uint32_t z = 0; Slot& s = b->sh->slot[i];
    if (!s.state.compare_exchange_strong(z, 1)) return false;
    s.now.store(0); s.readPos.store(0); s.writePos.store(0); s.inWrite.store(0); s.under.store(0); s.mHead.store(0); s.mTail.store(0);
    s.sr = (uint32_t)b->sr; s.latency = b->lat; s.hasIn = 0; s.pad0 = 1; s.bpm = 0; s.playing = 0;
    b->slot = i; b->lastSlot = i; b->P = 0; setName(b); s.gen.fetch_add(1); return true; };
  if (b->lastSlot >= 0 && take(b->lastSlot)) return true;
  for (int i = 0; i < NSLOT; i++) if (take(i)) return true;
  return false;
}
static void release(Br* b) { if (b->sh && b->slot >= 0) b->sh->slot[b->slot].state.store(0); b->slot = -1; }

// ---- ports ----
static uint32_t apCount(const clap_plugin_t*, bool in) { return 1; }
static bool apGet(const clap_plugin_t*, uint32_t i, bool in, clap_audio_port_info_t* o) {
  if (i) return false; memset(o, 0, sizeof *o);
  o->id = in ? 1 : 2; snprintf(o->name, sizeof o->name, "%s", in ? "To Nate Bloom" : "From Nate Bloom");
  o->flags = in ? 0 : CLAP_AUDIO_PORT_IS_MAIN; o->channel_count = 2; o->port_type = CLAP_PORT_STEREO; o->in_place_pair = CLAP_INVALID_ID; return true;
}
static const clap_plugin_audio_ports_t AP = { apCount, apGet };
static uint32_t npCount(const clap_plugin_t*, bool in) { return in ? 1 : 0; }
static bool npGet(const clap_plugin_t*, uint32_t i, bool, clap_note_port_info_t* o) {
  if (i) return false; o->id = 1; o->supported_dialects = CLAP_NOTE_DIALECT_CLAP | CLAP_NOTE_DIALECT_MIDI; o->preferred_dialect = CLAP_NOTE_DIALECT_MIDI; snprintf(o->name, sizeof o->name, "notes"); return true;
}
static const clap_plugin_note_ports_t NP = { npCount, npGet };
static uint32_t latGet(const clap_plugin_t* p) { return me(p)->lat; }
static const clap_plugin_latency_t LAT = { latGet };
static void tiChanged(const clap_plugin_t* p) { setName(me(p)); }
static const clap_plugin_track_info_t TI = { tiChanged };
static bool stSave(const clap_plugin_t*, const clap_ostream_t* s) { const char v[4] = { 'N', 'B', 'B', '1' }; return s->write(s, v, 4) == 4; }
static bool stLoad(const clap_plugin_t*, const clap_istream_t* s) { char v[4]; s->read(s, v, 4); return true; }
static const clap_plugin_state_t ST = { stSave, stLoad };

// ---- life ----
static bool pInit(const clap_plugin_t* p) { Br* b = me(p);
  b->hti = (const clap_host_track_info_t*)b->host->get_extension(b->host, CLAP_EXT_TRACK_INFO);
  b->hlat = (const clap_host_latency_t*)b->host->get_extension(b->host, CLAP_EXT_LATENCY);
  return true; }
static void pDestroy(const clap_plugin_t* p) { Br* b = me(p); release(b); if (b->sh) munmap(b->sh, sizeof(Shm)); delete b; }
static bool pActivate(const clap_plugin_t* p, double sr, uint32_t, uint32_t) {
  Br* b = me(p); b->sr = sr; b->lat = ((uint32_t)(0.056 * sr) + 127) / 128 * 128;   // (~56 ms: the browser's bursts, the trip both ways and Nate Bloom's effects chain; the host makes it up)
  claim(b); return true; }
static void pDeactivate(const clap_plugin_t* p) { release(me(p)); }
static bool pStart(const clap_plugin_t*) { return true; }
static void pStop(const clap_plugin_t*) {}
static void pReset(const clap_plugin_t*) {}
static void pMain(const clap_plugin_t* p) { Br* b = me(p); if (b->wantOpen.exchange(false)) { if (b->slot < 0) claim(b); } }

static void midiOut(Br* b, Slot& s, int64_t frame, uint8_t s0, uint8_t d1, uint8_t d2) {
  const uint32_t hd = s.mHead.load(), tl = s.mTail.load(std::memory_order_acquire);
  if (hd - tl >= (uint32_t)NMIDI) return;   // (the app isn't reading: dropped)
  MidiEv& e = s.mev[hd % NMIDI]; e.frame = frame; e.b[0] = s0; e.b[1] = d1; e.b[2] = d2; e.b[3] = 0;
  s.mHead.store(hd + 1, std::memory_order_release);
}
static clap_process_status pProcess(const clap_plugin_t* p, const clap_process_t* pr) {
  Br* b = me(p); const uint32_t n = pr->frames_count;
  float* oL = pr->audio_outputs_count ? pr->audio_outputs[0].data32[0] : nullptr; float* oR = pr->audio_outputs_count ? pr->audio_outputs[0].data32[1] : nullptr;
  if (b->slot < 0 || !b->sh) {
    if (oL) memset(oL, 0, n * 4); if (oR) memset(oR, 0, n * 4);
    if (++b->idle * (double)n > b->sr) { b->idle = 0; b->wantOpen.store(true); b->host->request_callback(b->host); }   // (look for Nate Bloom once a second)
    return CLAP_PROCESS_CONTINUE;
  }
  Slot& s = b->sh->slot[b->slot];
  // is the app there? (its heartbeat moves every 5 ms)
  const uint64_t ab = b->sh->appBeat.load(); const int64_t t = ms();
  if (ab != b->appBeatSeen) { b->appBeatSeen = ab; b->appBeatAt = t; b->appAlive = true; } else if (t - b->appBeatAt > 400) b->appAlive = false;
  if (s.state.load() != 1) { b->slot = -1; b->wantOpen.store(true); b->host->request_callback(b->host); }   // (the app cleared it: claim again)
  // notes, knobs and wheels → the app, stamped with where they fall in this block
  const uint32_t ne = pr->in_events->size(pr->in_events);
  for (uint32_t i = 0; i < ne; i++) {
    const clap_event_header_t* h = pr->in_events->get(pr->in_events, i); if (h->space_id != CLAP_CORE_EVENT_SPACE_ID) continue;
    const int64_t fr = b->P + h->time;
    if (h->type == CLAP_EVENT_NOTE_ON || h->type == CLAP_EVENT_NOTE_OFF) { const clap_event_note_t* e = (const clap_event_note_t*)h; if (e->key < 0) continue;
      const uint8_t ch = (uint8_t)((e->channel < 0 ? 0 : e->channel) & 15), v = (uint8_t)std::lround(std::fmin(1.0, std::fmax(0.0, e->velocity)) * 127);
      midiOut(b, s, fr, (h->type == CLAP_EVENT_NOTE_ON ? 0x90 : 0x80) | ch, (uint8_t)e->key, h->type == CLAP_EVENT_NOTE_ON ? (v ? v : 1) : v); }
    else if (h->type == CLAP_EVENT_NOTE_CHOKE) { const clap_event_note_t* e = (const clap_event_note_t*)h; if (e->key >= 0) midiOut(b, s, fr, 0x80 | ((e->channel < 0 ? 0 : e->channel) & 15), (uint8_t)e->key, 0); }
    else if (h->type == CLAP_EVENT_MIDI) { const clap_event_midi_t* e = (const clap_event_midi_t*)h; if ((e->data[0] & 0xf0) >= 0x80 && (e->data[0] & 0xf0) <= 0xe0) midiOut(b, s, fr, e->data[0], e->data[1], e->data[2]); }
  }
  // the host's transport
  if (pr->transport) { const clap_event_transport_t* tr = pr->transport;
    if (tr->flags & CLAP_TRANSPORT_HAS_TEMPO) s.bpm = tr->tempo;
    s.playing = (tr->flags & CLAP_TRANSPORT_IS_PLAYING) ? 1 : 0;
    if (tr->flags & CLAP_TRANSPORT_HAS_BEATS_TIMELINE) s.songBeats = (double)tr->song_pos_beats / CLAP_BEATTIME_FACTOR; }
  s.now.store(b->P, std::memory_order_release);
  // the app's sound for this block: what it wrote at P - latency
  const int64_t rd = b->P - (int64_t)b->lat, W = s.writePos.load(std::memory_order_acquire);
  uint64_t miss = 0;
  for (uint32_t i = 0; i < n; i++) { const int64_t ix = rd + i;
    float l = 0, r = 0;
    if (b->appAlive && ix >= 0 && ix < W && ix > W - RING) { l = s.out[0][ix & (RING - 1)]; r = s.out[1][ix & (RING - 1)]; } else if (W > 0) miss++;
    if (oL) oL[i] = l; if (oR) oR[i] = r; }
  if (miss) s.under.fetch_add(miss);
  s.readPos.store(rd + n, std::memory_order_release);
  // the host's audio in → the app
  if (pr->audio_inputs_count && pr->audio_inputs[0].channel_count && pr->audio_inputs[0].data32) {
    const float* iL = pr->audio_inputs[0].data32[0]; const float* iR = pr->audio_inputs[0].channel_count > 1 ? pr->audio_inputs[0].data32[1] : iL;
    bool any = false;
    for (uint32_t i = 0; i < n; i++) { const int a = (int)((b->P + i) & (RING - 1)); s.in[0][a] = iL ? iL[i] : 0; s.in[1][a] = iR ? iR[i] : 0; if (!any && iL && iL[i] != 0) any = true; }
    if (any) s.hasIn = 1;
    s.inWrite.store(b->P + n, std::memory_order_release);
  }
  s.beat.fetch_add(1);
  b->P += n;
  return CLAP_PROCESS_CONTINUE;
}
static const void* pExt(const clap_plugin_t*, const char* id) {
  if (!strcmp(id, CLAP_EXT_AUDIO_PORTS)) return &AP; if (!strcmp(id, CLAP_EXT_NOTE_PORTS)) return &NP; if (!strcmp(id, CLAP_EXT_LATENCY)) return &LAT;
  if (!strcmp(id, CLAP_EXT_TRACK_INFO)) return &TI; if (!strcmp(id, CLAP_EXT_STATE)) return &ST; return nullptr;
}

// ---- the factory and entry ----
static uint32_t fCount(const clap_plugin_factory_t*) { return 1; }
static const clap_plugin_descriptor_t* fDesc(const clap_plugin_factory_t*, uint32_t i) { return i == 0 ? &DESC : nullptr; }
static const clap_plugin_t* fCreate(const clap_plugin_factory_t*, const clap_host_t* h, const char* id) {
  if (strcmp(id, DESC.id)) return nullptr;
  Br* b = new Br(); b->host = h;
  b->pl = { &DESC, b, pInit, pDestroy, pActivate, pDeactivate, pStart, pStop, pReset, pProcess, pExt, pMain };
  return &b->pl;
}
static const clap_plugin_factory_t F = { fCount, fDesc, fCreate };
static bool eInit(const char*) { return true; }
static void eDeinit() {}
static const void* eFactory(const char* id) { return !strcmp(id, CLAP_PLUGIN_FACTORY_ID) ? &F : nullptr; }
extern "C" CLAP_EXPORT const clap_plugin_entry_t clap_entry = { CLAP_VERSION, eInit, eDeinit, eFactory };
