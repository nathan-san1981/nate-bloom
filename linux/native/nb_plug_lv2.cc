// (182) LV2 plugins in Nate Bloom (see nb_plug.h). lilv (the LV2 host library, ISC) is opened when it's first needed
// (dlopen liblilv-0.so.0, which Linux Mint has), so the app starts and the other formats work without it. Headers:
// lv2/lv2 and lv2/lilv (ISC), fetched at build time.
//
// What's given to a plugin: URID map and unmap, options (sample rate, block lengths), the worker (its jobs run on the
// plugin main thread, their answers come back at the start of the next block), bounded and fixed block lengths, and
// a log. Ports: the first two audio ins and outs carry Nate Bloom's stereo (a mono plugin gets the left), control
// inputs are the parameters, MIDI arrives on the first atom input that takes it; anything else gets a buffer of its
// own. Its window: an X11 UI (LV2 ui:X11UI) opened straight in our window, with its idle interface run ~30 times a
// second; UIs made for other toolkits aren't opened (their controls are still under MIDI learn and automation).
#include "nb_plug.h"
#include <lilv/lilv.h>
#include <lv2/atom/atom.h>
#include <lv2/atom/util.h>
#include <lv2/buf-size/buf-size.h>
#include <lv2/core/lv2.h>
#include <lv2/log/log.h>
#include <lv2/midi/midi.h>
#include <lv2/options/options.h>
#include <lv2/parameters/parameters.h>
#include <lv2/state/state.h>
#include <lv2/ui/ui.h>
#include <lv2/urid/urid.h>
#include <lv2/worker/worker.h>
#include <dlfcn.h>
#include <unistd.h>
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdarg>
#include <cstring>
#include <map>
#include <mutex>
#include <string>
#include <vector>

namespace nbplug {

bool isMainThread();

namespace {

// ---- lilv, opened at run time ----
struct Lilv {
  bool ok = false; std::string why;
#define F(n) decltype(&::n) n = nullptr;
  F(lilv_world_new) F(lilv_world_load_all) F(lilv_world_load_bundle) F(lilv_world_get_all_plugins) F(lilv_new_uri) F(lilv_new_file_uri) F(lilv_node_free)
  F(lilv_node_as_uri) F(lilv_node_as_string) F(lilv_node_as_float) F(lilv_plugins_begin) F(lilv_plugins_next) F(lilv_plugins_is_end) F(lilv_plugins_get)
  F(lilv_plugins_get_by_uri) F(lilv_plugin_get_uri) F(lilv_plugin_get_name) F(lilv_plugin_get_class) F(lilv_plugin_class_get_uri) F(lilv_plugin_get_bundle_uri)
  F(lilv_plugin_get_num_ports) F(lilv_plugin_get_port_by_index) F(lilv_plugin_get_port_ranges_float) F(lilv_plugin_get_author_name) F(lilv_plugin_instantiate)
  F(lilv_instance_free) F(lilv_port_is_a) F(lilv_port_supports_event) F(lilv_port_get_symbol) F(lilv_port_get_name) F(lilv_port_has_property)
  F(lilv_plugin_get_uis) F(lilv_uis_begin) F(lilv_uis_next) F(lilv_uis_is_end) F(lilv_uis_get) F(lilv_uis_free) F(lilv_ui_is_a) F(lilv_ui_get_uri)
  F(lilv_ui_get_binary_uri) F(lilv_ui_get_bundle_uri) F(lilv_file_uri_parse) F(lilv_free) F(lilv_state_new_from_instance) F(lilv_state_restore)
  F(lilv_state_to_string) F(lilv_state_new_from_string) F(lilv_state_free) F(lilv_plugin_get_value) F(lilv_nodes_free) F(lilv_nodes_get_first) F(lilv_world_free)
#undef F
  void* h = nullptr;
  bool open() {
    if (ok) return true; if (h) return false;
    h = dlopen("liblilv-0.so.0", RTLD_NOW | RTLD_LOCAL); if (!h) h = dlopen("liblilv-0.so", RTLD_NOW | RTLD_LOCAL);
    if (!h) { why = "LV2 needs the lilv library (sudo apt install liblilv-0-0)"; return false; }
    bool all = true;
#define L(n) n = (decltype(n))dlsym(h, #n); if (!n) all = false;
    L(lilv_world_new) L(lilv_world_load_all) L(lilv_world_load_bundle) L(lilv_world_get_all_plugins) L(lilv_new_uri) L(lilv_new_file_uri) L(lilv_node_free)
    L(lilv_node_as_uri) L(lilv_node_as_string) L(lilv_node_as_float) L(lilv_plugins_begin) L(lilv_plugins_next) L(lilv_plugins_is_end) L(lilv_plugins_get)
    L(lilv_plugins_get_by_uri) L(lilv_plugin_get_uri) L(lilv_plugin_get_name) L(lilv_plugin_get_class) L(lilv_plugin_class_get_uri) L(lilv_plugin_get_bundle_uri)
    L(lilv_plugin_get_num_ports) L(lilv_plugin_get_port_by_index) L(lilv_plugin_get_port_ranges_float) L(lilv_plugin_get_author_name) L(lilv_plugin_instantiate)
    L(lilv_instance_free) L(lilv_port_is_a) L(lilv_port_supports_event) L(lilv_port_get_symbol) L(lilv_port_get_name) L(lilv_port_has_property)
    L(lilv_plugin_get_uis) L(lilv_uis_begin) L(lilv_uis_next) L(lilv_uis_is_end) L(lilv_uis_get) L(lilv_uis_free) L(lilv_ui_is_a) L(lilv_ui_get_uri)
    L(lilv_ui_get_binary_uri) L(lilv_ui_get_bundle_uri) L(lilv_file_uri_parse) L(lilv_free) L(lilv_state_new_from_instance) L(lilv_state_restore)
    L(lilv_state_to_string) L(lilv_state_new_from_string) L(lilv_state_free) L(lilv_plugin_get_value) L(lilv_nodes_free) L(lilv_nodes_get_first) L(lilv_world_free)
#undef L
    if (!all) { why = "the lilv library here is too old for LV2 hosting"; return false; }
    ok = true; return true;
  }
};
Lilv LV;
std::mutex lvMu;

// URIDs: one table for every plugin
std::mutex uridMu; std::map<std::string, LV2_URID> uridOf; std::vector<std::string> uriOf{ "" };
LV2_URID mapUri(LV2_URID_Map_Handle, const char* uri) { std::lock_guard<std::mutex> lk(uridMu); auto it = uridOf.find(uri); if (it != uridOf.end()) return it->second; uriOf.push_back(uri); return uridOf[uri] = (LV2_URID)(uriOf.size() - 1); }
const char* unmapUri(LV2_URID_Unmap_Handle, LV2_URID u) { std::lock_guard<std::mutex> lk(uridMu); return u < uriOf.size() ? uriOf[u].c_str() : nullptr; }
LV2_URID_Map gMap{ nullptr, mapUri }; LV2_URID_Unmap gUnmap{ nullptr, unmapUri };
int logPrintf(LV2_Log_Handle, LV2_URID, const char* fmt, ...) { if (!getenv("NB_DEBUG")) return 0; va_list a; va_start(a, fmt); int n = vfprintf(stderr, fmt, a); va_end(a); return n; }
int logVPrintf(LV2_Log_Handle, LV2_URID, const char* fmt, va_list a) { return getenv("NB_DEBUG") ? vfprintf(stderr, fmt, a) : 0; }
LV2_Log_Log gLog{ nullptr, logPrintf, logVPrintf };

LilvWorld* gWorld = nullptr;
LilvWorld* world(std::string& err) {   // (main thread or the scanner)
  if (gWorld) return gWorld;
  if (!LV.open()) { err = LV.why; return nullptr; }
  gWorld = LV.lilv_world_new(); LV.lilv_world_load_all(gWorld);
  return gWorld;
}
const LilvPlugin* findPlugin(const std::string& bundle, const std::string& uri, std::string& err) {
  LilvWorld* w = world(err); if (!w) return nullptr;
  std::string b = bundle; if (!b.empty() && b.back() != '/') b += '/';
  static std::vector<std::string> loaded;   // (once each: lilv warns on a second load)
  if (std::find(loaded.begin(), loaded.end(), b) == loaded.end()) { loaded.push_back(b); LilvNode* bn = LV.lilv_new_file_uri(w, nullptr, b.c_str()); LV.lilv_world_load_bundle(w, bn); LV.lilv_node_free(bn); }
  LilvNode* un = LV.lilv_new_uri(w, uri.c_str()); const LilvPlugin* p = LV.lilv_plugins_get_by_uri(LV.lilv_world_get_all_plugins(w), un); LV.lilv_node_free(un);
  if (!p) err = "that plugin isn't in this bundle any more";
  return p;
}
const char* LV2_INSTR = "http://lv2plug.in/ns/lv2core#InstrumentPlugin";
// an instrument: so classed (lilv gives one class, which may be the plain lv2:Plugin), or MIDI in and no audio in
bool isInstr(LilvWorld* w, const LilvPlugin* p) {
  const char* cls = LV.lilv_node_as_uri(LV.lilv_plugin_class_get_uri(LV.lilv_plugin_get_class(p)));
  if (cls && !strcmp(cls, LV2_INSTR)) return true;
  LilvNode *cAudio = LV.lilv_new_uri(w, LV2_CORE__AudioPort), *cAtom = LV.lilv_new_uri(w, LV2_ATOM__AtomPort), *cIn = LV.lilv_new_uri(w, LV2_CORE__InputPort), *nMidi = LV.lilv_new_uri(w, LV2_MIDI__MidiEvent);
  bool midi = false, audioIn = false;
  for (uint32_t i = 0, n = LV.lilv_plugin_get_num_ports(p); i < n; i++) { const LilvPort* pt = LV.lilv_plugin_get_port_by_index(p, i); if (!LV.lilv_port_is_a(p, pt, cIn)) continue;
    if (LV.lilv_port_is_a(p, pt, cAudio)) audioIn = true; else if (LV.lilv_port_is_a(p, pt, cAtom) && LV.lilv_port_supports_event(p, pt, nMidi)) midi = true; }
  for (LilvNode* x : { cAudio, cAtom, cIn, nMidi }) LV.lilv_node_free(x);
  return midi && !audioIn;
}

struct Lv2 : Backend {
  const LilvPlugin* p = nullptr; LilvInstance* inst = nullptr; std::string uri, bundle, nm, vend; bool instr = false, active = false;
  double sr = 48000; int32_t blk = BLOCK, minBlk = 1, seqSize = 8192; float srF = 48000;
  struct Port { int idx; int kind; bool in; std::string sym, name; float min = 0, max = 1, def = 0, val = 0; bool toggled = false, integer = false; std::vector<float> buf; std::vector<uint8_t> atom; };   // kind 0 audio 1 control 2 atom 3 cv 4 other
  std::vector<Port> ports; int ain[2] = { -1, -1 }, aout[2] = { -1, -1 }, midiIn = -1;
  LV2_URID uMidi = 0, uSeq = 0, uChunk = 0, uFloat = 0, uInt = 0, uSR = 0, uMin = 0, uMax = 0, uNom = 0, uSeqSize = 0;
  // features
  LV2_Options_Option opts[6]; LV2_Feature fMap, fUnmap, fOpts, fLog, fBounded, fFixed, fPow2, fWorker, fState; LV2_Worker_Schedule sched{}; std::vector<const LV2_Feature*> feats;
  const LV2_Worker_Interface* work = nullptr;
  std::mutex wmu; std::vector<std::vector<uint8_t>> wJobs, wDone;
  std::mutex pmu; std::vector<std::pair<int, float>> fromMain;   // control changes from the main thread (the plugin's window)
  // its window (ui:X11UI)
  void* uiLib = nullptr; const LV2UI_Descriptor* uiD = nullptr; LV2UI_Handle uiH = nullptr; LV2UI_Widget uiW = nullptr; const LV2UI_Idle_Interface* uiIdle = nullptr; int uiTimer = 0;
  std::string uiUri, uiBundle, uiBinary;

  static LV2_Worker_Status schedule(LV2_Worker_Schedule_Handle h, uint32_t size, const void* data) {
    Lv2* s = (Lv2*)h; { std::lock_guard<std::mutex> lk(s->wmu); s->wJobs.emplace_back((const uint8_t*)data, (const uint8_t*)data + size); }
    if (s->loop) s->loop->post([s] { s->runJobs(); }); return LV2_WORKER_SUCCESS;
  }
  static LV2_Worker_Status respond(LV2_Worker_Respond_Handle h, uint32_t size, const void* data) {
    Lv2* s = (Lv2*)h; std::lock_guard<std::mutex> lk(s->wmu); s->wDone.emplace_back((const uint8_t*)data, (const uint8_t*)data + size); return LV2_WORKER_SUCCESS;
  }
  void runJobs() {
    std::vector<std::vector<uint8_t>> j; { std::lock_guard<std::mutex> lk(wmu); j.swap(wJobs); }
    if (!work || !inst) return;
    for (auto& d : j) work->work(LV2_HANDLE_INSTANCE(inst), respond, this, (uint32_t)d.size(), d.data());
  }

  bool load(const std::string& path, const std::string& uid, double sr_, std::string& err) override {
    std::lock_guard<std::mutex> lk(lvMu);
    bundle = path; uri = uid; sr = sr_; srF = (float)sr;
    p = findPlugin(bundle, uri, err); if (!p) return false;
    { LilvNode* n = LV.lilv_plugin_get_name(p); nm = n ? LV.lilv_node_as_string(n) : uri; if (n) LV.lilv_node_free(n); }
    { LilvNode* n = LV.lilv_plugin_get_author_name(p); vend = n ? LV.lilv_node_as_string(n) : "LV2"; if (n) LV.lilv_node_free(n); }
    instr = isInstr(gWorld, p);
    uMidi = mapUri(nullptr, LV2_MIDI__MidiEvent); uSeq = mapUri(nullptr, LV2_ATOM__Sequence); uChunk = mapUri(nullptr, LV2_ATOM__Chunk);
    uFloat = mapUri(nullptr, LV2_ATOM__Float); uInt = mapUri(nullptr, LV2_ATOM__Int); uSR = mapUri(nullptr, LV2_PARAMETERS__sampleRate);
    uMin = mapUri(nullptr, LV2_BUF_SIZE__minBlockLength); uMax = mapUri(nullptr, LV2_BUF_SIZE__maxBlockLength); uNom = mapUri(nullptr, LV2_BUF_SIZE__nominalBlockLength); uSeqSize = mapUri(nullptr, LV2_BUF_SIZE__sequenceSize);
    opts[0] = { LV2_OPTIONS_INSTANCE, 0, uSR, sizeof(float), uFloat, &srF };
    opts[1] = { LV2_OPTIONS_INSTANCE, 0, uMin, sizeof(int32_t), uInt, &minBlk };
    opts[2] = { LV2_OPTIONS_INSTANCE, 0, uMax, sizeof(int32_t), uInt, &blk };
    opts[3] = { LV2_OPTIONS_INSTANCE, 0, uNom, sizeof(int32_t), uInt, &blk };
    opts[4] = { LV2_OPTIONS_INSTANCE, 0, uSeqSize, sizeof(int32_t), uInt, &seqSize };
    opts[5] = { LV2_OPTIONS_INSTANCE, 0, 0, 0, 0, nullptr };
    sched.handle = this; sched.schedule_work = schedule;
    fMap = { LV2_URID__map, &gMap }; fUnmap = { LV2_URID__unmap, &gUnmap }; fOpts = { LV2_OPTIONS__options, opts }; fLog = { LV2_LOG__log, &gLog };
    fBounded = { LV2_BUF_SIZE__boundedBlockLength, nullptr }; fFixed = { LV2_BUF_SIZE__fixedBlockLength, nullptr }; fPow2 = { LV2_BUF_SIZE__powerOf2BlockLength, nullptr };
    fWorker = { LV2_WORKER__schedule, &sched }; fState = { LV2_STATE__loadDefaultState, nullptr };
    feats = { &fMap, &fUnmap, &fOpts, &fLog, &fBounded, &fFixed, &fPow2, &fWorker, &fState, nullptr };
    // ports
    LilvWorld* w = gWorld;
    LilvNode *cAudio = LV.lilv_new_uri(w, LV2_CORE__AudioPort), *cControl = LV.lilv_new_uri(w, LV2_CORE__ControlPort), *cAtom = LV.lilv_new_uri(w, LV2_ATOM__AtomPort),
             *cCV = LV.lilv_new_uri(w, LV2_CORE__CVPort), *cIn = LV.lilv_new_uri(w, LV2_CORE__InputPort), *nMidi = LV.lilv_new_uri(w, LV2_MIDI__MidiEvent),
             *pTog = LV.lilv_new_uri(w, LV2_CORE__toggled), *pInt = LV.lilv_new_uri(w, LV2_CORE__integer), *pNot = LV.lilv_new_uri(w, "http://lv2plug.in/ns/ext/port-props#notOnGUI");
    const uint32_t np = LV.lilv_plugin_get_num_ports(p);
    std::vector<float> mins(np), maxs(np), defs(np); LV.lilv_plugin_get_port_ranges_float(p, mins.data(), maxs.data(), defs.data());
    ports.resize(np); int nai = 0, nao = 0;
    for (uint32_t i = 0; i < np; i++) {
      const LilvPort* pt = LV.lilv_plugin_get_port_by_index(p, i); Port& P = ports[i]; P.idx = (int)i; P.in = LV.lilv_port_is_a(p, pt, cIn);
      P.sym = LV.lilv_node_as_string(LV.lilv_port_get_symbol(p, pt)); { LilvNode* n = LV.lilv_port_get_name(p, pt); P.name = n ? LV.lilv_node_as_string(n) : P.sym; if (n) LV.lilv_node_free(n); }
      if (LV.lilv_port_is_a(p, pt, cAudio)) { P.kind = 0; P.buf.assign(BLOCK, 0.f); if (P.in && nai < 2) ain[nai++] = (int)i; else if (!P.in && nao < 2) aout[nao++] = (int)i; }
      else if (LV.lilv_port_is_a(p, pt, cControl)) { P.kind = 1; P.min = std::isfinite(mins[i]) ? mins[i] : 0; P.max = std::isfinite(maxs[i]) ? maxs[i] : 1; P.def = std::isfinite(defs[i]) ? defs[i] : P.min; P.val = P.def; P.buf.assign(1, P.val);
        P.toggled = LV.lilv_port_has_property(p, pt, pTog); P.integer = LV.lilv_port_has_property(p, pt, pInt); if (LV.lilv_port_has_property(p, pt, pNot)) P.integer = P.integer; }
      else if (LV.lilv_port_is_a(p, pt, cAtom)) { P.kind = 2; P.atom.assign(seqSize, 0); if (P.in && midiIn < 0 && LV.lilv_port_supports_event(p, pt, nMidi)) midiIn = (int)i; }
      else if (LV.lilv_port_is_a(p, pt, cCV)) { P.kind = 3; P.buf.assign(BLOCK, 0.f); }
      else { P.kind = 4; P.buf.assign(BLOCK, 0.f); }
    }
    for (LilvNode* n : { cAudio, cControl, cAtom, cCV, cIn, nMidi, pTog, pInt, pNot }) LV.lilv_node_free(n);
    if (aout[0] < 0) { err = "it has no audio out"; return false; }
    if (!instr && midiIn >= 0 && ain[0] < 0) instr = true;
    inst = LV.lilv_plugin_instantiate(p, sr, feats.data());
    if (!inst) { err = "it wouldn't start (it may need a feature Nate Bloom doesn't offer)"; return false; }
    for (auto& P : ports) {
      void* b = P.kind == 2 ? (void*)P.atom.data() : (void*)P.buf.data();
      lilv_instance_connect_port(inst, (uint32_t)P.idx, b);
    }
    work = (const LV2_Worker_Interface*)lilv_instance_get_extension_data(inst, LV2_WORKER__interface);
    lilv_instance_activate(inst); active = true;
    // its window: the first X11 UI it has
    if (LilvUIs* uis = LV.lilv_plugin_get_uis(p)) {
      LilvNode* x11 = LV.lilv_new_uri(w, LV2_UI__X11UI);
      for (LilvIter* it = LV.lilv_uis_begin(uis); !LV.lilv_uis_is_end(uis, it); it = LV.lilv_uis_next(uis, it)) {
        const LilvUI* ui = LV.lilv_uis_get(uis, it);
        if (!LV.lilv_ui_is_a(ui, x11)) continue;
        uiUri = LV.lilv_node_as_uri(LV.lilv_ui_get_uri(ui));
        char* bp = LV.lilv_file_uri_parse(LV.lilv_node_as_uri(LV.lilv_ui_get_bundle_uri(ui)), nullptr); if (bp) { uiBundle = bp; LV.lilv_free(bp); }
        char* bn = LV.lilv_file_uri_parse(LV.lilv_node_as_uri(LV.lilv_ui_get_binary_uri(ui)), nullptr); if (bn) { uiBinary = bn; LV.lilv_free(bn); }
        break;
      }
      LV.lilv_node_free(x11); LV.lilv_uis_free(uis);
    }
    return true;
  }
  std::string name() override { return nm; }
  std::string vendor() override { return vend; }
  bool isInstrument() override { return instr; }
  int latency() override { return 0; }
  std::vector<ParamInfo> params() override {
    std::vector<ParamInfo> v;
    for (auto& P : ports) if (P.kind == 1 && P.in) v.push_back({ (uint32_t)P.idx, P.name, P.min, P.max, P.def, P.val, P.toggled ? 1 : P.integer ? (int)std::max(1.f, P.max - P.min) : 0, true });
    return v;
  }
  void setParamMain(uint32_t id, double v) override { if (id < ports.size()) { ports[id].val = (float)v; if (uiD && uiD->port_event && uiH) { float f = (float)v; uiD->port_event(uiH, id, sizeof(float), 0, &f); } } }
  // state: lilv's own (the plugin's state interface and its control ports), as Turtle text
  static const void* getPort(const char* sym, void* ud, uint32_t* size, uint32_t* type) {
    Lv2* s = (Lv2*)ud; for (auto& P : s->ports) if (P.kind == 1 && P.in && P.sym == sym) { *size = sizeof(float); *type = s->uFloat; return &P.val; } *size = 0; *type = 0; return nullptr;
  }
  static void setPort(const char* sym, void* ud, const void* value, uint32_t size, uint32_t type) {
    Lv2* s = (Lv2*)ud; if (size != sizeof(float) || type != s->uFloat) return;
    for (auto& P : s->ports) if (P.kind == 1 && P.in && P.sym == sym) { P.val = *(const float*)value; std::lock_guard<std::mutex> lk(s->pmu); s->fromMain.push_back({ P.idx, P.val }); }
  }
  bool getState(std::vector<uint8_t>& out) override {
    if (!inst) return false; std::lock_guard<std::mutex> lk(lvMu);
    LilvState* st = LV.lilv_state_new_from_instance(p, inst, &gMap, nullptr, nullptr, nullptr, nullptr, getPort, this, LV2_STATE_IS_POD | LV2_STATE_IS_PORTABLE, feats.data());
    if (!st) return false;
    char* txt = LV.lilv_state_to_string(gWorld, &gMap, &gUnmap, st, "urn:nate-bloom:state", nullptr);
    LV.lilv_state_free(st); if (!txt) return false;
    out.assign({ 'N', 'B', 'L', '2' }); out.insert(out.end(), txt, txt + strlen(txt)); LV.lilv_free(txt); return true;
  }
  bool setState(const std::vector<uint8_t>& in) override {
    if (!inst || in.size() < 5 || memcmp(in.data(), "NBL2", 4) != 0) return false; std::lock_guard<std::mutex> lk(lvMu);
    std::string txt(in.begin() + 4, in.end());
    LilvState* st = LV.lilv_state_new_from_string(gWorld, &gMap, txt.c_str()); if (!st) return false;
    LV.lilv_state_restore(st, inst, setPort, this, 0, feats.data()); LV.lilv_state_free(st); return true;
  }
  // its window
  static void uiWrite(LV2UI_Controller c, uint32_t port, uint32_t size, uint32_t proto, const void* buf) {
    Lv2* s = (Lv2*)c; if (proto != 0 || size != sizeof(float) || port >= s->ports.size() || s->ports[port].kind != 1) return;
    const float v = *(const float*)buf; s->ports[port].val = v; { std::lock_guard<std::mutex> lk(s->pmu); s->fromMain.push_back({ (int)port, v }); }
    if (s->onParamFromGui) s->onParamFromGui(port, v);
  }
  static uint32_t uiIndex(LV2UI_Feature_Handle h, const char* sym) { Lv2* s = (Lv2*)h; for (auto& P : s->ports) if (P.sym == sym) return (uint32_t)P.idx; return LV2UI_INVALID_PORT_INDEX; }
  static int uiResize(LV2UI_Feature_Handle h, int w, int hh) { Lv2* s = (Lv2*)h; if (s->onGuiResize) s->onGuiResize(w, hh); return 0; }
  bool guiCanOpen() override { return !uiBinary.empty(); }
  bool guiOpen(Win* w, int& wo, int& ho, bool& resizable, std::string& err) override {
    if (uiBinary.empty()) { err = "its controls are made for another toolkit (only X11 windows open here)"; return false; }
    if (uiH) { w->show(); return true; }
    uiLib = dlopen(uiBinary.c_str(), RTLD_NOW | RTLD_LOCAL); if (!uiLib) { err = std::string("its window wouldn't load: ") + (dlerror() ? dlerror() : "?"); return false; }
    auto df = (LV2UI_DescriptorFunction)dlsym(uiLib, "lv2ui_descriptor"); if (!df) { err = "its window has no descriptor"; return false; }
    for (uint32_t i = 0; (uiD = df(i)); i++) if (uiUri == uiD->URI) break;
    if (!uiD) { err = "its window isn't in its library"; return false; }
    static LV2UI_Port_Map pm; pm.handle = this; pm.port_index = uiIndex;
    static LV2UI_Resize rz; rz.handle = this; rz.ui_resize = uiResize;
    const LV2_Feature fParent{ LV2_UI__parent, (void*)(uintptr_t)w->xid() }, fPm{ LV2_UI__portMap, &pm }, fRz{ LV2_UI__resize, &rz }, fIdle{ LV2_UI__idleInterface, nullptr },
      fInst{ "http://lv2plug.in/ns/ext/instance-access", lilv_instance_get_handle(inst) };
    const LV2_Feature* uf[] = { &fMap, &fUnmap, &fParent, &fPm, &fRz, &fIdle, &fInst, &fOpts, &fLog, nullptr };
    w->resize(640, 400);
    uiH = uiD->instantiate(uiD, uri.c_str(), uiBundle.c_str(), uiWrite, this, &uiW, uf);
    if (!uiH) { err = "its window wouldn't open"; return false; }
    for (auto& P : ports) if (P.kind == 1) { float v = P.val; if (uiD->port_event) uiD->port_event(uiH, (uint32_t)P.idx, sizeof(float), 0, &v); }
    uiIdle = uiD->extension_data ? (const LV2UI_Idle_Interface*)uiD->extension_data(LV2_UI__idleInterface) : nullptr;
    if (uiIdle && loop) uiTimer = loop->addTimer(33, [this] { if (uiH && uiIdle && uiIdle->idle(uiH)) { if (onGuiClosed) onGuiClosed(); } });
    wo = 640; ho = 400; resizable = true; w->show();
    return true;
  }
  void guiClose() override {
    if (uiTimer && loop) { loop->removeTimer(uiTimer); uiTimer = 0; }
    if (uiH && uiD && uiD->cleanup) uiD->cleanup(uiH);
    uiH = nullptr; uiW = nullptr; uiIdle = nullptr; uiD = nullptr;   // (the library stays open: some don't survive being closed)
  }
  void unload() override {
    guiClose();
    if (inst) { if (active) lilv_instance_deactivate(inst); active = false; std::lock_guard<std::mutex> lk(lvMu); LV.lilv_instance_free(inst); inst = nullptr; }
  }
  void startAudio() override {}
  void stopAudio() override {}
  void process(const float* inL, const float* inR, float* outL, float* outR, int n, int64_t frame,
               const MidiEv* me, int nme, const ParamEv* pe, int npe, double, bool) override {
    if (!inst) { memset(outL, 0, n * 4); memset(outR, 0, n * 4); return; }
    { std::lock_guard<std::mutex> lk(pmu); for (auto& c : fromMain) ports[c.first].buf[0] = c.second; fromMain.clear(); }
    for (int i = 0; i < npe; i++) if (pe[i].id < ports.size() && ports[pe[i].id].kind == 1) { ports[pe[i].id].buf[0] = (float)pe[i].value; ports[pe[i].id].val = (float)pe[i].value; }
    if (ain[0] >= 0) memcpy(ports[ain[0]].buf.data(), inL, n * 4);
    if (ain[1] >= 0) memcpy(ports[ain[1]].buf.data(), inR, n * 4);
    for (auto& P : ports) if (P.kind == 2) {   // atom ports: inputs get an empty sequence (MIDI in the first that takes it), outputs room to write
      auto* seq = (LV2_Atom_Sequence*)P.atom.data();
      if (P.in) { seq->atom.type = uSeq; seq->atom.size = sizeof(LV2_Atom_Sequence_Body); seq->body.unit = 0; seq->body.pad = 0; }
      else { seq->atom.type = uChunk; seq->atom.size = (uint32_t)(P.atom.size() - sizeof(LV2_Atom)); }
    }
    if (midiIn >= 0) {
      auto* seq = (LV2_Atom_Sequence*)ports[midiIn].atom.data(); const uint32_t cap = (uint32_t)ports[midiIn].atom.size();
      for (int i = 0; i < nme; i++) {
        struct { LV2_Atom_Event ev; uint8_t msg[4]; } e{};
        e.ev.time.frames = std::max<int64_t>(0, std::min<int64_t>(n - 1, me[i].frame - frame)); e.ev.body.type = uMidi; e.ev.body.size = 3; memcpy(e.msg, me[i].b, 3);
        if (sizeof(LV2_Atom) + seq->atom.size + lv2_atom_pad_size(sizeof(LV2_Atom_Event) + 3) > cap) break;
        lv2_atom_sequence_append_event(seq, cap, &e.ev);
      }
    }
    lilv_instance_run(inst, (uint32_t)n);
    if (work) {   // the worker's answers, then its end of the block
      std::vector<std::vector<uint8_t>> d; { std::lock_guard<std::mutex> lk(wmu); d.swap(wDone); }
      for (auto& x : d) work->work_response(LV2_HANDLE_INSTANCE(inst), (uint32_t)x.size(), x.data());
      if (work->end_run) work->end_run(LV2_HANDLE_INSTANCE(inst));
    }
    memcpy(outL, ports[aout[0]].buf.data(), n * 4);
    memcpy(outR, ports[aout[1] >= 0 ? aout[1] : aout[0]].buf.data(), n * 4);
  }
  static LV2_Handle LV2_HANDLE_INSTANCE(LilvInstance* i) { return lilv_instance_get_handle(i); }
};

}  // namespace

Backend* newLv2() { return new Lv2(); }

// one bundle (a folder ending .lv2): its plugins, from its Turtle files only (nothing of the plugin is run)
bool scanLv2(const std::string& path, std::vector<Found>& out, std::string& err) {
  std::lock_guard<std::mutex> lk(lvMu);
  if (!LV.open()) { err = LV.why; return false; }
  LilvWorld* w = LV.lilv_world_new();
  std::string b = path; if (!b.empty() && b.back() != '/') b += '/';
  LilvNode* bn = LV.lilv_new_file_uri(w, nullptr, b.c_str()); LV.lilv_world_load_bundle(w, bn);
  const LilvPlugins* all = LV.lilv_world_get_all_plugins(w);
  for (LilvIter* it = LV.lilv_plugins_begin(all); !LV.lilv_plugins_is_end(all, it); it = LV.lilv_plugins_next(all, it)) {
    const LilvPlugin* p = LV.lilv_plugins_get(all, it);
    if (strcmp(LV.lilv_node_as_uri(LV.lilv_plugin_get_bundle_uri(p)), LV.lilv_node_as_uri(bn)) != 0) continue;
    LilvNode* n = LV.lilv_plugin_get_name(p); LilvNode* a = LV.lilv_plugin_get_author_name(p);
    const char* cls = LV.lilv_node_as_uri(LV.lilv_plugin_class_get_uri(LV.lilv_plugin_get_class(p)));
    const bool inst = isInstr(w, p);
    std::string c = cls ? cls : ""; const size_t h = c.find('#'); if (h != std::string::npos) c = c.substr(h + 1);
    out.push_back({ "lv2", path, LV.lilv_node_as_uri(LV.lilv_plugin_get_uri(p)), n ? LV.lilv_node_as_string(n) : "LV2 plugin", a ? LV.lilv_node_as_string(a) : "", "", inst ? "instrument" : "effect", c });
    if (n) LV.lilv_node_free(n); if (a) LV.lilv_node_free(a);
  }
  LV.lilv_node_free(bn); LV.lilv_world_free(w);
  return true;
}

}  // namespace nbplug
