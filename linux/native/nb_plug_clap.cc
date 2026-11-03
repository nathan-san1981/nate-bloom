// (177) CLAP plugins in Nate Bloom (see nb_plug.h). CLAP headers: free-audio/clap (MIT), fetched at build time.
#include "nb_plug.h"
#include <clap/clap.h>
#include <dlfcn.h>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <map>
#include <mutex>

namespace nbplug {

bool isMainThread();
bool isAudioThread();

namespace {

struct Lib { void* h = nullptr; const clap_plugin_entry_t* entry = nullptr; int refs = 0; };
std::mutex libMu;
std::map<std::string, Lib> libs;   // a .clap opened once however many instances use it

const clap_plugin_entry_t* openLib(const std::string& path, std::string& err) {
  std::lock_guard<std::mutex> lk(libMu);
  Lib& L = libs[path];
  if (!L.h) {
    L.h = dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL);
    if (!L.h) { err = std::string("couldn't open it: ") + (dlerror() ? dlerror() : "?"); libs.erase(path); return nullptr; }
    L.entry = (const clap_plugin_entry_t*)dlsym(L.h, "clap_entry");
    if (!L.entry || !clap_version_is_compatible(L.entry->clap_version) || !L.entry->init(path.c_str())) { err = "not a CLAP plugin this host can use"; dlclose(L.h); libs.erase(path); return nullptr; }
  }
  L.refs++;
  return L.entry;
}
void closeLib(const std::string& path) {
  std::lock_guard<std::mutex> lk(libMu);
  auto it = libs.find(path); if (it == libs.end()) return;
  if (--it->second.refs > 0) return;
  // (kept open: some plugins don't survive being unloaded and loaded again in one process)
}

bool hasFeature(const clap_plugin_descriptor_t* d, const char* f) {
  if (!d->features) return false;
  for (const char* const* p = d->features; *p; p++) if (!strcmp(*p, f)) return true;
  return false;
}
std::string features(const clap_plugin_descriptor_t* d) {
  std::string s; if (!d->features) return s;
  for (const char* const* p = d->features; *p; p++) { if (!s.empty()) s += ","; s += *p; }
  return s;
}

// the events Nate Bloom sends a block: note on/off, MIDI, parameter changes, in time order
struct InEvents {
  clap_input_events_t api{};
  std::vector<uint8_t> store; std::vector<uint32_t> at;
  InEvents() { api.ctx = this; api.size = [](const clap_input_events_t* l) -> uint32_t { return (uint32_t)((InEvents*)l->ctx)->at.size(); };
    api.get = [](const clap_input_events_t* l, uint32_t i) -> const clap_event_header_t* { auto* s = (InEvents*)l->ctx; return i < s->at.size() ? (const clap_event_header_t*)(s->store.data() + s->at[i]) : nullptr; }; }
  void clear() { store.clear(); at.clear(); }
  template <class T> void push(const T& e) { const size_t o = store.size(); store.resize(o + sizeof(T)); memcpy(store.data() + o, &e, sizeof(T)); at.push_back((uint32_t)o); }
  void sortByTime() { std::stable_sort(at.begin(), at.end(), [&](uint32_t a, uint32_t b) { return ((clap_event_header_t*)(store.data() + a))->time < ((clap_event_header_t*)(store.data() + b))->time; }); }
};
struct OutEvents {
  clap_output_events_t api{};
  std::function<void(const clap_event_header_t*)> on;
  OutEvents() { api.ctx = this; api.try_push = [](const clap_output_events_t* l, const clap_event_header_t* e) -> bool { auto* s = (OutEvents*)l->ctx; if (s->on) s->on(e); return true; }; }
};

struct Clap : Backend {
  std::string path, uid;
  const clap_plugin_entry_t* entry = nullptr;
  const clap_plugin_t* p = nullptr;
  clap_host_t host{};
  const clap_plugin_audio_ports_t* aports = nullptr; const clap_plugin_note_ports_t* nports = nullptr;
  const clap_plugin_params_t* pparams = nullptr; const clap_plugin_state_t* pstate = nullptr; const clap_plugin_gui_t* pgui = nullptr;
  const clap_plugin_timer_support_t* ptimer = nullptr; const clap_plugin_posix_fd_support_t* pfd = nullptr; const clap_plugin_latency_t* plat = nullptr;
  bool inst = false, active = false, processing = false, guiMade = false, noteClap = true, noteMidi = false;
  double sr = 48000;
  std::string nm, vend;
  // audio
  struct Port { std::vector<std::vector<float>> ch; std::vector<float*> ptr; clap_audio_buffer_t buf{}; };
  std::vector<Port> ins, outs; std::vector<clap_audio_buffer_t> inBufs, outBufs;
  InEvents ev; OutEvents oev;
  std::map<clap_id, int> timers;   // the plugin's timer id -> the loop's
  clap_id nextTimer = 1;
  std::vector<int> fds;
  std::mutex paramMu; std::vector<std::pair<uint32_t, double>> fromGui;

  // ---- the host side, seen by the plugin ----
  static Clap* of(const clap_host_t* h) { return (Clap*)h->host_data; }
  static const void* getExt(const clap_host_t* h, const char* id) {
    static const clap_host_thread_check_t tc = { [](const clap_host_t*) { return isMainThread(); }, [](const clap_host_t*) { return isAudioThread(); } };
    static const clap_host_log_t lg = { [](const clap_host_t*, clap_log_severity s, const char* m) { if (s >= CLAP_LOG_ERROR && getenv("NB_DEBUG")) fprintf(stderr, "[clap] %s\n", m); } };
    static const clap_host_params_t pa = { [](const clap_host_t*, clap_param_rescan_flags) {}, [](const clap_host_t*, clap_id, clap_param_clear_flags) {}, [](const clap_host_t*) {} };
    static const clap_host_state_t st = { [](const clap_host_t*) {} };
    static const clap_host_latency_t la = { [](const clap_host_t*) {} };
    static const clap_host_audio_ports_t ap = { [](const clap_host_t*, uint32_t) { return false; }, [](const clap_host_t*, uint32_t) {} };
    static const clap_host_note_ports_t np = { [](const clap_host_t*) -> uint32_t { return CLAP_NOTE_DIALECT_CLAP | CLAP_NOTE_DIALECT_MIDI; }, [](const clap_host_t*, uint32_t) {} };
    static const clap_host_timer_support_t ts = {
      [](const clap_host_t* h, uint32_t ms, clap_id* id) -> bool { Clap* c = of(h); if (!c->loop) return false; const clap_id my = c->nextTimer++;
        c->timers[my] = c->loop->addTimer((int)std::max(10u, ms), [c, my] { if (c->ptimer && c->p) c->ptimer->on_timer(c->p, my); }); *id = my; return true; },
      [](const clap_host_t* h, clap_id id) -> bool { Clap* c = of(h); auto it = c->timers.find(id); if (it == c->timers.end()) return false; c->loop->removeTimer(it->second); c->timers.erase(it); return true; } };
    static const clap_host_posix_fd_support_t fs = {
      [](const clap_host_t* h, int fd, clap_posix_fd_flags_t) -> bool { Clap* c = of(h); if (!c->loop) return false; c->fds.push_back(fd);
        c->loop->addFd(fd, [c](int f) { if (c->pfd && c->p) c->pfd->on_fd(c->p, f, CLAP_POSIX_FD_READ); }); return true; },
      [](const clap_host_t*, int, clap_posix_fd_flags_t) -> bool { return true; },
      [](const clap_host_t* h, int fd) -> bool { Clap* c = of(h); c->loop->removeFd(fd); c->fds.erase(std::remove(c->fds.begin(), c->fds.end(), fd), c->fds.end()); return true; } };
    static const clap_host_gui_t gu = {
      [](const clap_host_t*) {},
      [](const clap_host_t* h, uint32_t w, uint32_t hh) -> bool { Clap* c = of(h); if (c->onGuiResize) { if (c->loop->onMain()) c->onGuiResize((int)w, (int)hh); else c->loop->post([c, w, hh] { c->onGuiResize((int)w, (int)hh); }); } return true; },
      [](const clap_host_t*) -> bool { return true; },
      [](const clap_host_t*) -> bool { return false; },
      [](const clap_host_t* h, bool) { Clap* c = of(h); if (c->onGuiClosed) c->loop->post([c] { c->onGuiClosed(); }); } };
    if (!strcmp(id, CLAP_EXT_THREAD_CHECK)) return &tc;
    if (!strcmp(id, CLAP_EXT_LOG)) return &lg;
    if (!strcmp(id, CLAP_EXT_PARAMS)) return &pa;
    if (!strcmp(id, CLAP_EXT_STATE)) return &st;
    if (!strcmp(id, CLAP_EXT_LATENCY)) return &la;
    if (!strcmp(id, CLAP_EXT_AUDIO_PORTS)) return &ap;
    if (!strcmp(id, CLAP_EXT_NOTE_PORTS)) return &np;
    if (!strcmp(id, CLAP_EXT_TIMER_SUPPORT)) return &ts;
    if (!strcmp(id, CLAP_EXT_POSIX_FD_SUPPORT)) return &fs;
    if (!strcmp(id, CLAP_EXT_GUI)) return &gu;
    return nullptr;
  }

  bool load(const std::string& path_, const std::string& uid_, double sr_, std::string& err) override {
    path = path_; uid = uid_; sr = sr_;
    entry = openLib(path, err); if (!entry) return false;
    auto* f = (const clap_plugin_factory_t*)entry->get_factory(CLAP_PLUGIN_FACTORY_ID);
    if (!f) { err = "it has no plugins in it"; return false; }
    const clap_plugin_descriptor_t* d = nullptr;
    for (uint32_t i = 0, n = f->get_plugin_count(f); i < n; i++) { auto* x = f->get_plugin_descriptor(f, i); if (x && (uid.empty() || uid == x->id)) { d = x; break; } }
    if (!d) { err = "that plugin isn't in this file any more"; return false; }
    uid = d->id; nm = d->name ? d->name : uid; vend = d->vendor ? d->vendor : "";
    inst = hasFeature(d, CLAP_PLUGIN_FEATURE_INSTRUMENT);
    host.clap_version = CLAP_VERSION; host.host_data = this; host.name = "Nate Bloom"; host.vendor = "Nate Bloom"; host.url = "https://nathan-san1981.github.io/nate-bloom/"; host.version = "1.0";
    host.get_extension = getExt;
    host.request_restart = [](const clap_host_t* h) { Clap* c = of(h); if (c->onRestart) c->loop->post([c] { c->onRestart(); }); };
    host.request_process = [](const clap_host_t*) {};
    host.request_callback = [](const clap_host_t* h) { Clap* c = of(h); c->loop->post([c] { if (c->p) c->p->on_main_thread(c->p); }); };
    p = f->create_plugin(f, &host, uid.c_str());
    if (!p) { err = "it wouldn't start"; return false; }
    if (!p->init(p)) { p->destroy(p); p = nullptr; err = "it wouldn't start (init)"; return false; }
    aports = (const clap_plugin_audio_ports_t*)p->get_extension(p, CLAP_EXT_AUDIO_PORTS);
    nports = (const clap_plugin_note_ports_t*)p->get_extension(p, CLAP_EXT_NOTE_PORTS);
    pparams = (const clap_plugin_params_t*)p->get_extension(p, CLAP_EXT_PARAMS);
    pstate = (const clap_plugin_state_t*)p->get_extension(p, CLAP_EXT_STATE);
    pgui = (const clap_plugin_gui_t*)p->get_extension(p, CLAP_EXT_GUI);
    ptimer = (const clap_plugin_timer_support_t*)p->get_extension(p, CLAP_EXT_TIMER_SUPPORT);
    pfd = (const clap_plugin_posix_fd_support_t*)p->get_extension(p, CLAP_EXT_POSIX_FD_SUPPORT);
    plat = (const clap_plugin_latency_t*)p->get_extension(p, CLAP_EXT_LATENCY);
    if (nports && nports->count(p, true) > 0) {
      clap_note_port_info_t ni{}; if (nports->get(p, 0, true, &ni)) { noteClap = (ni.supported_dialects & CLAP_NOTE_DIALECT_CLAP) != 0; noteMidi = (ni.supported_dialects & CLAP_NOTE_DIALECT_MIDI) != 0; if (!noteClap && !noteMidi) noteClap = true; }
      if (!inst && !hasFeature(d, CLAP_PLUGIN_FEATURE_AUDIO_EFFECT)) inst = true;
    }
    // every port the plugin has gets a buffer; the first (main) ones carry Nate Bloom's stereo
    auto mk = [&](bool in, std::vector<Port>& v) {
      const uint32_t n = aports ? aports->count(p, in) : 0; v.resize(n);
      for (uint32_t i = 0; i < n; i++) { clap_audio_port_info_t ai{}; aports->get(p, i, in, &ai); const uint32_t ch = std::max(1u, std::min(32u, ai.channel_count));
        v[i].ch.assign(ch, std::vector<float>(BLOCK, 0.f)); v[i].ptr.resize(ch); for (uint32_t c = 0; c < ch; c++) v[i].ptr[c] = v[i].ch[c].data();
        v[i].buf.data32 = v[i].ptr.data(); v[i].buf.channel_count = ch; }
    };
    mk(true, ins); mk(false, outs);
    if (outs.empty()) { err = "it has no audio out"; p->destroy(p); p = nullptr; return false; }
    inBufs.clear(); for (auto& x : ins) inBufs.push_back(x.buf); outBufs.clear(); for (auto& x : outs) outBufs.push_back(x.buf);
    if (!p->activate(p, sr, 1, BLOCK)) { err = "it wouldn't start at this sample rate"; p->destroy(p); p = nullptr; return false; }
    active = true;
    return true;
  }
  std::string name() override { return nm; }
  std::string vendor() override { return vend; }
  bool isInstrument() override { return inst; }
  int latency() override { return plat && p ? (int)plat->get(p) : 0; }
  std::vector<ParamInfo> params() override {
    std::vector<ParamInfo> v; if (!pparams || !p) return v;
    for (uint32_t i = 0, n = pparams->count(p); i < n; i++) {
      clap_param_info_t pi{}; if (!pparams->get_info(p, i, &pi)) continue;
      if (pi.flags & (CLAP_PARAM_IS_HIDDEN | CLAP_PARAM_IS_READONLY)) continue;
      double val = pi.default_value; pparams->get_value(p, pi.id, &val);
      v.push_back({ pi.id, pi.name, pi.min_value, pi.max_value, pi.default_value, val, (pi.flags & CLAP_PARAM_IS_STEPPED) ? (int)(pi.max_value - pi.min_value) : 0, (pi.flags & CLAP_PARAM_IS_AUTOMATABLE) != 0 });
    }
    return v;
  }
  bool getState(std::vector<uint8_t>& out) override {
    if (!pstate || !p) return false;
    out.clear(); clap_ostream_t os{ &out, [](const clap_ostream_t* s, const void* b, uint64_t n) -> int64_t { auto* v = (std::vector<uint8_t>*)s->ctx; v->insert(v->end(), (const uint8_t*)b, (const uint8_t*)b + n); return (int64_t)n; } };
    return pstate->save(p, &os);
  }
  bool setState(const std::vector<uint8_t>& in) override {
    if (!pstate || !p) return false;
    struct R { const std::vector<uint8_t>* v; size_t at; } r{ &in, 0 };
    clap_istream_t is{ &r, [](const clap_istream_t* s, void* b, uint64_t n) -> int64_t { auto* r = (R*)s->ctx; const size_t k = std::min((size_t)n, r->v->size() - r->at); memcpy(b, r->v->data() + r->at, k); r->at += k; return (int64_t)k; } };
    return pstate->load(p, &is);
  }
  bool guiCanOpen() override { return pgui && p && (pgui->is_api_supported(p, CLAP_WINDOW_API_X11, false) || pgui->is_api_supported(p, CLAP_WINDOW_API_X11, true)); }
  bool guiOpen(Win* w, int& wo, int& ho, bool& resizable, std::string& err) override {
    if (!guiCanOpen()) { err = "it has no window for X11"; return false; }
    if (guiMade) { pgui->show(p); return true; }
    if (!pgui->create(p, CLAP_WINDOW_API_X11, false)) { err = "its window wouldn't open"; return false; }
    guiMade = true;
    pgui->set_scale(p, 1.0);
    uint32_t W = 640, H = 400; pgui->get_size(p, &W, &H); wo = (int)W; ho = (int)H; resizable = pgui->can_resize(p);
    w->resize(wo, ho);
    clap_window_t cw{}; cw.api = CLAP_WINDOW_API_X11; cw.x11 = w->xid();
    if (!pgui->set_parent(p, &cw)) { pgui->destroy(p); guiMade = false; err = "its window wouldn't go in Nate Bloom's"; return false; }
    pgui->show(p); w->show();
    return true;
  }
  void guiResized(int w, int h) override {
    if (!guiMade || !pgui->can_resize(p)) return;
    uint32_t W = (uint32_t)w, H = (uint32_t)h; pgui->adjust_size(p, &W, &H); pgui->set_size(p, W, H);
  }
  void guiClose() override { if (guiMade && p) { pgui->hide(p); pgui->destroy(p); guiMade = false; } }
  void unload() override {
    if (!p) return;
    guiClose();
    for (auto& t : timers) loop->removeTimer(t.second); timers.clear();
    for (int fd : fds) loop->removeFd(fd); fds.clear();
    if (active) { p->deactivate(p); active = false; }
    p->destroy(p); p = nullptr;
    closeLib(path);
  }
  void startAudio() override { if (p && !processing) processing = p->start_processing(p); }
  void stopAudio() override { if (p && processing) { p->stop_processing(p); processing = false; } }
  void process(const float* inL, const float* inR, float* outL, float* outR, int n, int64_t frame,
               const MidiEv* me, int nme, const ParamEv* pe, int npe, double bpm, bool playing) override {
    if (!p) { memset(outL, 0, n * 4); memset(outR, 0, n * 4); return; }
    if (!processing) startAudio();
    for (auto& port : ins) for (auto& c : port.ch) std::fill(c.begin(), c.end(), 0.f);
    if (!ins.empty() && inL) { memcpy(ins[0].ch[0].data(), inL, n * 4); if (ins[0].ch.size() > 1) memcpy(ins[0].ch[1].data(), inR, n * 4); }
    ev.clear();
    for (int i = 0; i < nme; i++) {
      const MidiEv& m = me[i]; const uint32_t t = (uint32_t)std::max<int64_t>(0, std::min<int64_t>(n - 1, m.frame - frame));
      const int st = m.b[0] & 0xF0, chn = m.b[0] & 15;
      const bool on = st == 0x90 && m.b[2] > 0, off = st == 0x80 || (st == 0x90 && m.b[2] == 0);
      if ((on || off) && noteClap) {
        clap_event_note_t e{}; e.header = { sizeof(e), t, CLAP_CORE_EVENT_SPACE_ID, (uint16_t)(on ? CLAP_EVENT_NOTE_ON : CLAP_EVENT_NOTE_OFF), 0 };
        e.note_id = -1; e.port_index = 0; e.channel = (int16_t)chn; e.key = m.b[1]; e.velocity = on ? m.b[2] / 127.0 : 0.0; ev.push(e);
      } else if (noteMidi) {
        clap_event_midi_t e{}; e.header = { sizeof(e), t, CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_MIDI, 0 }; e.port_index = 0; memcpy(e.data, m.b, 3); ev.push(e);
      }
    }
    for (int i = 0; i < npe; i++) {
      clap_event_param_value_t e{}; e.header = { sizeof(e), (uint32_t)std::max<int64_t>(0, std::min<int64_t>(n - 1, pe[i].frame - frame)), CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_PARAM_VALUE, 0 };
      e.param_id = pe[i].id; e.cookie = nullptr; e.note_id = -1; e.port_index = -1; e.channel = -1; e.key = -1; e.value = pe[i].value; ev.push(e);
    }
    ev.sortByTime();
    clap_event_transport_t tr{}; tr.header = { sizeof(tr), 0, CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_TRANSPORT, 0 };
    tr.flags = CLAP_TRANSPORT_HAS_TEMPO | CLAP_TRANSPORT_HAS_TIME_SIGNATURE | CLAP_TRANSPORT_HAS_SECONDS_TIMELINE | (playing ? CLAP_TRANSPORT_IS_PLAYING : 0);
    tr.tempo = bpm > 0 ? bpm : 120; tr.tsig_num = 4; tr.tsig_denom = 4;
    const double secs = frame / sr; tr.song_pos_seconds = (clap_sectime)llround(secs * CLAP_SECTIME_FACTOR); tr.song_pos_beats = (clap_beattime)llround(secs * tr.tempo / 60.0 * CLAP_BEATTIME_FACTOR);
    clap_process_t pr{}; pr.steady_time = frame; pr.frames_count = (uint32_t)n; pr.transport = &tr;
    for (size_t i = 0; i < ins.size(); i++) inBufs[i].constant_mask = 0;
    for (size_t i = 0; i < outs.size(); i++) outBufs[i].constant_mask = 0;
    pr.audio_inputs = inBufs.empty() ? nullptr : inBufs.data(); pr.audio_inputs_count = (uint32_t)inBufs.size();
    pr.audio_outputs = outBufs.data(); pr.audio_outputs_count = (uint32_t)outBufs.size();
    pr.in_events = &ev.api; pr.out_events = &oev.api;
    p->process(p, &pr);
    memcpy(outL, outs[0].ch[0].data(), n * 4); memcpy(outR, outs[0].ch.size() > 1 ? outs[0].ch[1].data() : outs[0].ch[0].data(), n * 4);
  }
};

}  // namespace

Backend* newClap() { return new Clap(); }

bool scanClap(const std::string& path, std::vector<Found>& out, std::string& err) {
  const clap_plugin_entry_t* e = openLib(path, err); if (!e) return false;
  auto* f = (const clap_plugin_factory_t*)e->get_factory(CLAP_PLUGIN_FACTORY_ID);
  if (!f) { err = "no plugin factory"; return false; }
  for (uint32_t i = 0, n = f->get_plugin_count(f); i < n; i++) {
    auto* d = f->get_plugin_descriptor(f, i); if (!d || !d->id) continue;
    const bool inst = hasFeature(d, CLAP_PLUGIN_FEATURE_INSTRUMENT);
    if (!inst && !hasFeature(d, CLAP_PLUGIN_FEATURE_AUDIO_EFFECT) && !hasFeature(d, CLAP_PLUGIN_FEATURE_NOTE_EFFECT)) { /* analyzers and the like still count as effects */ }
    out.push_back({ "clap", path, d->id, d->name ? d->name : d->id, d->vendor ? d->vendor : "", d->version ? d->version : "", inst ? "instrument" : "effect", features(d) });
  }
  return true;
}

}  // namespace nbplug
