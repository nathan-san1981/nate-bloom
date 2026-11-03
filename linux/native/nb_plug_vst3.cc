// (177) VST3 plugins in Nate Bloom (see nb_plug.h). Steinberg's VST3 interfaces (vst3_pluginterfaces, MIT), fetched at
// build time; this file is the host side of them, written for Nate Bloom (no SDK hosting classes).
#define INIT_CLASS_IID   // (this file defines the interface ids it uses; funknown.cpp is the only other part compiled)
#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivsthostapplication.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstattributes.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "pluginterfaces/vst/ivstmidicontrollers.h"
#include "pluginterfaces/vst/ivstpluginterfacesupport.h"
#include "pluginterfaces/vst/vstspeaker.h"
#include "nb_plug.h"
#include <dlfcn.h>
#include <sys/stat.h>
#include <algorithm>
#include <atomic>
#include <cstring>
#include <map>
#include <mutex>

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace nbplug {
namespace {

// ---- small helpers ----
std::string u8(const char16* s, int max = 128) {
  std::string o; for (int i = 0; i < max && s[i]; i++) { const uint32_t c = (uint16_t)s[i];
    if (c < 0x80) o += (char)c; else if (c < 0x800) { o += (char)(0xC0 | (c >> 6)); o += (char)(0x80 | (c & 63)); }
    else { o += (char)(0xE0 | (c >> 12)); o += (char)(0x80 | ((c >> 6) & 63)); o += (char)(0x80 | (c & 63)); } }
  return o;
}
void to16(const char* s, char16* d, int max) { int i = 0; for (; s[i] && i < max - 1; i++) d[i] = (char16)(unsigned char)s[i]; d[i] = 0; }
std::string hexId(const TUID id) { static const char* H = "0123456789ABCDEF"; std::string s; for (int i = 0; i < 16; i++) { s += H[(id[i] >> 4) & 15]; s += H[id[i] & 15]; } return s; }
bool fromHex(const std::string& s, TUID id) { if (s.size() != 32) return false; for (int i = 0; i < 16; i++) { id[i] = (char)std::stoi(s.substr(i * 2, 2), nullptr, 16); } return true; }
#define NB_RC(DEL) std::atomic<int32> rc_{1}; \
  uint32 PLUGIN_API addRef() override { return (uint32)++rc_; } \
  uint32 PLUGIN_API release() override { const int32 r = --rc_; if (r == 0 && DEL) delete this; return (uint32)std::max(0, r); }

// ---- what the plugin asks the host for ----
struct Attrs : IAttributeList {
  NB_RC(true)
  std::map<std::string, int64> ints; std::map<std::string, double> floats; std::map<std::string, std::vector<char16>> strs; std::map<std::string, std::vector<uint8_t>> bins;
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    QUERY_INTERFACE(iid, obj, FUnknown::iid, IAttributeList) QUERY_INTERFACE(iid, obj, IAttributeList::iid, IAttributeList) *obj = nullptr; return kNoInterface; }
  tresult PLUGIN_API setInt(AttrID id, int64 v) override { ints[id] = v; return kResultOk; }
  tresult PLUGIN_API getInt(AttrID id, int64& v) override { auto it = ints.find(id); if (it == ints.end()) return kResultFalse; v = it->second; return kResultOk; }
  tresult PLUGIN_API setFloat(AttrID id, double v) override { floats[id] = v; return kResultOk; }
  tresult PLUGIN_API getFloat(AttrID id, double& v) override { auto it = floats.find(id); if (it == floats.end()) return kResultFalse; v = it->second; return kResultOk; }
  tresult PLUGIN_API setString(AttrID id, const TChar* s) override { std::vector<char16> v; for (int i = 0; s && s[i]; i++) v.push_back(s[i]); v.push_back(0); strs[id] = v; return kResultOk; }
  tresult PLUGIN_API getString(AttrID id, TChar* s, uint32 bytes) override { auto it = strs.find(id); if (it == strs.end() || bytes < 2) return kResultFalse;
    const uint32 n = std::min<uint32>(bytes / 2, (uint32)it->second.size()); memcpy(s, it->second.data(), n * 2); s[n - 1] = 0; return kResultOk; }
  tresult PLUGIN_API setBinary(AttrID id, const void* d, uint32 n) override { bins[id].assign((const uint8_t*)d, (const uint8_t*)d + n); return kResultOk; }
  tresult PLUGIN_API getBinary(AttrID id, const void*& d, uint32& n) override { auto it = bins.find(id); if (it == bins.end()) return kResultFalse; d = it->second.data(); n = (uint32)it->second.size(); return kResultOk; }
  virtual ~Attrs() {}
};
struct Message : IMessage {
  NB_RC(true)
  std::string id; Attrs* a = new Attrs();
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    QUERY_INTERFACE(iid, obj, FUnknown::iid, IMessage) QUERY_INTERFACE(iid, obj, IMessage::iid, IMessage) *obj = nullptr; return kNoInterface; }
  FIDString PLUGIN_API getMessageID() override { return id.c_str(); }
  void PLUGIN_API setMessageID(FIDString s) override { id = s ? s : ""; }
  IAttributeList* PLUGIN_API getAttributes() override { return a; }
  virtual ~Message() { a->release(); }
};
struct Host : IHostApplication, IPlugInterfaceSupport {
  NB_RC(false)
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    QUERY_INTERFACE(iid, obj, FUnknown::iid, IHostApplication) QUERY_INTERFACE(iid, obj, IHostApplication::iid, IHostApplication)
    QUERY_INTERFACE(iid, obj, IPlugInterfaceSupport::iid, IPlugInterfaceSupport) *obj = nullptr; return kNoInterface; }
  tresult PLUGIN_API getName(String128 name) override { to16("Nate Bloom", name, 128); return kResultOk; }
  tresult PLUGIN_API createInstance(TUID cid, TUID iid, void** obj) override {
    if (FUnknownPrivate::iidEqual(cid, IMessage::iid) && FUnknownPrivate::iidEqual(iid, IMessage::iid)) { *obj = (IMessage*)new Message(); return kResultOk; }
    if (FUnknownPrivate::iidEqual(cid, IAttributeList::iid) && FUnknownPrivate::iidEqual(iid, IAttributeList::iid)) { *obj = (IAttributeList*)new Attrs(); return kResultOk; }
    *obj = nullptr; return kResultFalse;
  }
  tresult PLUGIN_API isPlugInterfaceSupported(const TUID iid) override {
    for (const FUID* f : { &IComponent::iid, &IAudioProcessor::iid, &IEditController::iid, &IConnectionPoint::iid, &IPlugView::iid, &IPlugFrame::iid, &Linux::IRunLoop::iid, &IMidiMapping::iid, &IComponentHandler::iid })
      if (FUnknownPrivate::iidEqual(iid, *f)) return kResultTrue;
    return kResultFalse;
  }
};
Host gHost;

struct Stream : IBStream {
  NB_RC(false)
  std::vector<uint8_t> d; int64 pos = 0;
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    QUERY_INTERFACE(iid, obj, FUnknown::iid, IBStream) QUERY_INTERFACE(iid, obj, IBStream::iid, IBStream) *obj = nullptr; return kNoInterface; }
  tresult PLUGIN_API read(void* b, int32 n, int32* got) override { const int64 k = std::max<int64>(0, std::min<int64>(n, (int64)d.size() - pos)); if (k) memcpy(b, d.data() + pos, (size_t)k); pos += k; if (got) *got = (int32)k; return kResultOk; }
  tresult PLUGIN_API write(void* b, int32 n, int32* put) override { if (n < 0) return kInvalidArgument; if ((int64)d.size() < pos + n) d.resize((size_t)(pos + n)); memcpy(d.data() + pos, b, (size_t)n); pos += n; if (put) *put = n; return kResultOk; }
  tresult PLUGIN_API seek(int64 p, int32 mode, int64* r) override { int64 np = mode == kIBSeekSet ? p : mode == kIBSeekCur ? pos + p : (int64)d.size() + p; if (np < 0) return kInvalidArgument; pos = np; if (r) *r = pos; return kResultOk; }
  tresult PLUGIN_API tell(int64* p) override { if (p) *p = pos; return kResultOk; }
};

struct Queue : IParamValueQueue {
  NB_RC(false)
  ParamID id = 0; std::vector<std::pair<int32, ParamValue>> pts;
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    QUERY_INTERFACE(iid, obj, FUnknown::iid, IParamValueQueue) QUERY_INTERFACE(iid, obj, IParamValueQueue::iid, IParamValueQueue) *obj = nullptr; return kNoInterface; }
  ParamID PLUGIN_API getParameterId() override { return id; }
  int32 PLUGIN_API getPointCount() override { return (int32)pts.size(); }
  tresult PLUGIN_API getPoint(int32 i, int32& off, ParamValue& v) override { if (i < 0 || i >= (int32)pts.size()) return kResultFalse; off = pts[i].first; v = pts[i].second; return kResultOk; }
  tresult PLUGIN_API addPoint(int32 off, ParamValue v, int32& i) override { i = (int32)pts.size(); pts.push_back({ off, v }); return kResultOk; }
};
struct Changes : IParameterChanges {
  NB_RC(false)
  static const int MAXQ = 256; Queue qs[MAXQ]; int n = 0;
  Changes() { for (auto& q : qs) q.pts.reserve(16); }
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    QUERY_INTERFACE(iid, obj, FUnknown::iid, IParameterChanges) QUERY_INTERFACE(iid, obj, IParameterChanges::iid, IParameterChanges) *obj = nullptr; return kNoInterface; }
  void clear() { for (int i = 0; i < n; i++) qs[i].pts.clear(); n = 0; }
  int32 PLUGIN_API getParameterCount() override { return n; }
  IParamValueQueue* PLUGIN_API getParameterData(int32 i) override { return i >= 0 && i < n ? &qs[i] : nullptr; }
  IParamValueQueue* PLUGIN_API addParameterData(const ParamID& id, int32& i) override {
    for (int k = 0; k < n; k++) if (qs[k].id == id) { i = k; return &qs[k]; }
    if (n >= MAXQ) return nullptr;
    i = n; qs[n].id = id; qs[n].pts.clear(); return &qs[n++];
  }
};
struct Events : IEventList {
  NB_RC(false)
  std::vector<Event> ev;
  Events() { ev.reserve(256); }
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    QUERY_INTERFACE(iid, obj, FUnknown::iid, IEventList) QUERY_INTERFACE(iid, obj, IEventList::iid, IEventList) *obj = nullptr; return kNoInterface; }
  int32 PLUGIN_API getEventCount() override { return (int32)ev.size(); }
  tresult PLUGIN_API getEvent(int32 i, Event& e) override { if (i < 0 || i >= (int32)ev.size()) return kResultFalse; e = ev[i]; return kResultOk; }
  tresult PLUGIN_API addEvent(Event& e) override { ev.push_back(e); return kResultOk; }
};

struct V3;
struct Handler : IComponentHandler {
  NB_RC(false)
  V3* o = nullptr;
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    QUERY_INTERFACE(iid, obj, FUnknown::iid, IComponentHandler) QUERY_INTERFACE(iid, obj, IComponentHandler::iid, IComponentHandler) *obj = nullptr; return kNoInterface; }
  tresult PLUGIN_API beginEdit(ParamID) override { return kResultOk; }
  tresult PLUGIN_API performEdit(ParamID id, ParamValue v) override;
  tresult PLUGIN_API endEdit(ParamID) override { return kResultOk; }
  tresult PLUGIN_API restartComponent(int32 flags) override;
};
struct Frame : IPlugFrame, Linux::IRunLoop {
  NB_RC(false)
  V3* o = nullptr;
  std::map<Linux::IEventHandler*, std::vector<int>> fds; std::map<Linux::ITimerHandler*, std::vector<int>> timers;
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    QUERY_INTERFACE(iid, obj, FUnknown::iid, IPlugFrame) QUERY_INTERFACE(iid, obj, IPlugFrame::iid, IPlugFrame)
    QUERY_INTERFACE(iid, obj, Linux::IRunLoop::iid, Linux::IRunLoop) *obj = nullptr; return kNoInterface; }
  tresult PLUGIN_API resizeView(IPlugView* view, ViewRect* r) override;
  tresult PLUGIN_API registerEventHandler(Linux::IEventHandler* h, Linux::FileDescriptor fd) override;
  tresult PLUGIN_API unregisterEventHandler(Linux::IEventHandler* h) override;
  tresult PLUGIN_API registerTimer(Linux::ITimerHandler* h, Linux::TimerInterval ms) override;
  tresult PLUGIN_API unregisterTimer(Linux::ITimerHandler* h) override;
};

// ---- a module (.vst3), opened once ----
struct Mod { void* h = nullptr; IPluginFactory* f = nullptr; };
std::mutex modMu; std::map<std::string, Mod> mods;
std::string soOf(const std::string& path) {
  struct stat st{}; if (stat(path.c_str(), &st) != 0) return path;
  if (!S_ISDIR(st.st_mode)) return path;
  std::string base = path; while (!base.empty() && base.back() == '/') base.pop_back();
  std::string stem = base.substr(base.find_last_of('/') + 1); if (stem.size() > 5 && stem.compare(stem.size() - 5, 5, ".vst3") == 0) stem.resize(stem.size() - 5);
  return base + "/Contents/x86_64-linux/" + stem + ".so";
}
IPluginFactory* openMod(const std::string& path, std::string& err) {
  std::lock_guard<std::mutex> lk(modMu);
  Mod& M = mods[path]; if (M.f) return M.f;
  const std::string so = soOf(path);
  M.h = dlopen(so.c_str(), RTLD_NOW | RTLD_LOCAL);
  if (!M.h) { err = std::string("couldn't open it: ") + (dlerror() ? dlerror() : "?"); mods.erase(path); return nullptr; }
  typedef bool (*Entry)(void*); typedef IPluginFactory* (*GetF)();
  if (Entry e = (Entry)dlsym(M.h, "ModuleEntry")) { if (!e(M.h)) { err = "it wouldn't start (ModuleEntry)"; mods.erase(path); return nullptr; } }
  GetF g = (GetF)dlsym(M.h, "GetPluginFactory");
  if (!g || !(M.f = g())) { err = "not a VST3 plugin"; mods.erase(path); return nullptr; }
  IPluginFactory3* f3 = nullptr; if (M.f->queryInterface(IPluginFactory3::iid, (void**)&f3) == kResultOk && f3) { f3->setHostContext((FUnknown*)(IHostApplication*)&gHost); f3->release(); }
  return M.f;
}

struct V3 : Backend {
  std::string path, uid, nm, vend;
  IPluginFactory* f = nullptr; IComponent* comp = nullptr; IAudioProcessor* proc = nullptr; IEditController* ctrl = nullptr;
  IConnectionPoint *cpC = nullptr, *cpE = nullptr; IMidiMapping* midiMap = nullptr; IPlugView* view = nullptr;
  bool single = false, inst = false, active = false, processing = false;
  double sr = 48000; int lat = 0;
  Handler handler; Frame frame;
  int nIn = 0, nOut = 0;
  struct Bus { std::vector<std::vector<float>> ch; std::vector<float*> ptr; };
  std::vector<Bus> ib, ob; std::vector<AudioBusBuffers> ibb, obb;
  Events evs; Changes chIn, chOut;
  ParamID ccMap[130]; bool ccHas[130] = {};
  Win* win = nullptr;

  bool load(const std::string& path_, const std::string& uid_, double sr_, std::string& err) override {
    path = path_; uid = uid_; sr = sr_; handler.o = this; frame.o = this;
    f = openMod(path, err); if (!f) return false;
    TUID cid{}; bool got = false;
    IPluginFactory2* f2 = nullptr; f->queryInterface(IPluginFactory2::iid, (void**)&f2);
    PFactoryInfo fi{}; f->getFactoryInfo(&fi); vend = fi.vendor;
    for (int32 i = 0, n = f->countClasses(); i < n; i++) {
      PClassInfo ci{}; if (f->getClassInfo(i, &ci) != kResultOk || strcmp(ci.category, kVstAudioEffectClass) != 0) continue;
      if (!uid.empty() && hexId(ci.cid) != uid) continue;
      memcpy(cid, ci.cid, 16); nm = ci.name; got = true;
      if (f2) { PClassInfo2 c2{}; if (f2->getClassInfo2(i, &c2) == kResultOk) { inst = strstr(c2.subCategories, "Instrument") != nullptr; if (c2.vendor[0]) vend = c2.vendor; } }
      break;
    }
    if (f2) f2->release();
    if (!got) { err = "that plugin isn't in this file any more"; return false; }
    uid = hexId(cid);
    if (f->createInstance(cid, IComponent::iid, (void**)&comp) != kResultOk || !comp) { err = "it wouldn't start"; comp = nullptr; return false; }
    if (comp->initialize((FUnknown*)(IHostApplication*)&gHost) != kResultOk) { err = "it wouldn't start (initialize)"; comp->release(); comp = nullptr; return false; }
    if (comp->queryInterface(IAudioProcessor::iid, (void**)&proc) != kResultOk || !proc) { err = "it can't process audio"; unload(); return false; }
    if (comp->queryInterface(IEditController::iid, (void**)&ctrl) == kResultOk && ctrl) single = true;
    else {
      ctrl = nullptr; TUID ccid{};
      if (comp->getControllerClassId(ccid) == kResultOk && f->createInstance(ccid, IEditController::iid, (void**)&ctrl) == kResultOk && ctrl) {
        if (ctrl->initialize((FUnknown*)(IHostApplication*)&gHost) != kResultOk) { ctrl->release(); ctrl = nullptr; }
      } else ctrl = nullptr;
    }
    if (ctrl && !single) {
      comp->queryInterface(IConnectionPoint::iid, (void**)&cpC); ctrl->queryInterface(IConnectionPoint::iid, (void**)&cpE);
      if (cpC && cpE) { cpC->connect(cpE); cpE->connect(cpC); }
    }
    if (ctrl) {
      ctrl->setComponentHandler(&handler);
      Stream s; if (comp->getState(&s) == kResultOk) { s.pos = 0; ctrl->setComponentState(&s); }
      if (ctrl->queryInterface(IMidiMapping::iid, (void**)&midiMap) == kResultOk && midiMap) {
        for (int c = 0; c < 130; c++) { ParamID id = 0; if (midiMap->getMidiControllerAssignment(0, 0, (CtrlNumber)c, id) == kResultOk) { ccMap[c] = id; ccHas[c] = true; } }
      } else midiMap = nullptr;
    }
    // the buses: stereo in and out on the main ones, every bus given buffers
    nIn = comp->getBusCount(kAudio, kInput); nOut = comp->getBusCount(kAudio, kOutput);
    if (nOut < 1) { err = "it has no audio out"; unload(); return false; }
    std::vector<SpeakerArrangement> ia(nIn), oa(nOut);
    for (int i = 0; i < nIn; i++) { if (proc->getBusArrangement(kInput, i, ia[i]) != kResultOk) ia[i] = SpeakerArr::kStereo; }
    for (int i = 0; i < nOut; i++) { if (proc->getBusArrangement(kOutput, i, oa[i]) != kResultOk) oa[i] = SpeakerArr::kStereo; }
    if (nIn) ia[0] = SpeakerArr::kStereo; oa[0] = SpeakerArr::kStereo;
    proc->setBusArrangements(nIn ? ia.data() : nullptr, nIn, oa.data(), nOut);
    auto mk = [&](BusDirection dir, int n, std::vector<Bus>& B, std::vector<AudioBusBuffers>& BB) {
      B.resize(n); BB.resize(n);
      for (int i = 0; i < n; i++) { SpeakerArrangement a = 0; proc->getBusArrangement(dir, i, a); int ch = SpeakerArr::getChannelCount(a); if (ch <= 0) { BusInfo bi{}; comp->getBusInfo(kAudio, dir, i, bi); ch = std::max(1, (int)bi.channelCount); }
        ch = std::min(ch, 32); B[i].ch.assign(ch, std::vector<float>(BLOCK, 0.f)); B[i].ptr.resize(ch); for (int c = 0; c < ch; c++) B[i].ptr[c] = B[i].ch[c].data();
        BB[i].numChannels = ch; BB[i].silenceFlags = 0; BB[i].channelBuffers32 = B[i].ptr.data(); }
    };
    mk(kInput, nIn, ib, ibb); mk(kOutput, nOut, ob, obb);
    comp->activateBus(kAudio, kOutput, 0, true); if (nIn) comp->activateBus(kAudio, kInput, 0, true);
    if (comp->getBusCount(kEvent, kInput) > 0) { comp->activateBus(kEvent, kInput, 0, true); if (!nIn) inst = true; }
    ProcessSetup ps{ kRealtime, kSample32, BLOCK, sr };
    if (proc->setupProcessing(ps) != kResultOk) { err = "it wouldn't start at this sample rate"; unload(); return false; }
    if (comp->setActive(true) != kResultOk) { err = "it wouldn't switch on"; unload(); return false; }
    active = true; lat = (int)proc->getLatencySamples();
    return true;
  }
  std::string name() override { return nm; }
  std::string vendor() override { return vend; }
  bool isInstrument() override { return inst; }
  int latency() override { return lat; }
  std::vector<ParamInfo> params() override {
    std::vector<ParamInfo> v; if (!ctrl) return v;
    for (int32 i = 0, n = ctrl->getParameterCount(); i < n; i++) {
      ParameterInfo pi{}; if (ctrl->getParameterInfo(i, pi) != kResultOk) continue;
      if (pi.flags & (ParameterInfo::kIsHidden | ParameterInfo::kIsReadOnly)) continue;
      v.push_back({ pi.id, u8(pi.title), 0, 1, pi.defaultNormalizedValue, ctrl->getParamNormalized(pi.id), (int)pi.stepCount, (pi.flags & ParameterInfo::kCanAutomate) != 0 });
    }
    return v;
  }
  void setParamMain(uint32_t id, double v) override { if (ctrl) ctrl->setParamNormalized(id, v); }
  bool getState(std::vector<uint8_t>& out) override {
    if (!comp) return false;
    Stream a, b; if (comp->getState(&a) != kResultOk) return false; if (ctrl) ctrl->getState(&b);
    out.assign({ 'N', 'B', 'V', '3' });
    auto put = [&](const std::vector<uint8_t>& d) { const uint32_t n = (uint32_t)d.size(); for (int i = 0; i < 4; i++) out.push_back((uint8_t)(n >> (i * 8))); out.insert(out.end(), d.begin(), d.end()); };
    put(a.d); put(b.d); return true;
  }
  bool setState(const std::vector<uint8_t>& in) override {
    if (!comp || in.size() < 12 || memcmp(in.data(), "NBV3", 4) != 0) return false;
    size_t at = 4; auto get = [&](Stream& s) { if (at + 4 > in.size()) return false; uint32_t n = 0; for (int i = 0; i < 4; i++) n |= (uint32_t)in[at + i] << (i * 8); at += 4; if (at + n > in.size()) return false; s.d.assign(in.begin() + at, in.begin() + at + n); at += n; return true; };
    Stream a, b; if (!get(a) || !get(b)) return false;
    if (comp->setState(&a) != kResultOk) return false;
    if (ctrl) { a.pos = 0; ctrl->setComponentState(&a); if (!b.d.empty()) ctrl->setState(&b); }
    return true;
  }
  bool guiCanOpen() override { return ctrl != nullptr; }
  bool guiOpen(Win* w, int& wo, int& ho, bool& resizable, std::string& err) override {
    if (!ctrl) { err = "it has no window"; return false; }
    if (view) { w->show(); return true; }
    view = ctrl->createView(ViewType::kEditor);
    if (!view) { err = "it has no window"; return false; }
    if (view->isPlatformTypeSupported(kPlatformTypeX11EmbedWindowID) != kResultTrue) { view->release(); view = nullptr; err = "its window isn't made for X11"; return false; }
    win = w; view->setFrame(&frame);
    ViewRect r{}; if (view->getSize(&r) != kResultOk || r.getWidth() <= 0) r = ViewRect(0, 0, 640, 400);
    wo = r.getWidth(); ho = r.getHeight(); resizable = view->canResize() == kResultTrue;
    w->resize(wo, ho);
    if (view->attached((void*)(uintptr_t)w->xid(), kPlatformTypeX11EmbedWindowID) != kResultOk) { view->setFrame(nullptr); view->release(); view = nullptr; win = nullptr; err = "its window wouldn't go in Nate Bloom's"; return false; }
    w->show();
    return true;
  }
  void guiResized(int w, int h) override {
    if (!view || view->canResize() != kResultTrue) return;
    ViewRect r(0, 0, w, h); view->checkSizeConstraint(&r); view->onSize(&r);
  }
  void guiClose() override { if (view) { view->removed(); view->setFrame(nullptr); view->release(); view = nullptr; } win = nullptr;
    for (auto& x : frame.fds) for (int fd : x.second) loop->removeFd(fd); frame.fds.clear();
    for (auto& x : frame.timers) for (int t : x.second) loop->removeTimer(t); frame.timers.clear(); }
  void unload() override {
    guiClose();
    if (comp && active) { comp->setActive(false); active = false; }
    if (cpC && cpE) { cpC->disconnect(cpE); cpE->disconnect(cpC); }
    if (cpC) { cpC->release(); cpC = nullptr; } if (cpE) { cpE->release(); cpE = nullptr; }
    if (midiMap) { midiMap->release(); midiMap = nullptr; }
    if (ctrl) { ctrl->setComponentHandler(nullptr); if (!single) ctrl->terminate(); ctrl->release(); ctrl = nullptr; }
    if (proc) { proc->release(); proc = nullptr; }
    if (comp) { comp->terminate(); comp->release(); comp = nullptr; }
  }
  void startAudio() override { if (proc && !processing) { proc->setProcessing(true); processing = true; } }
  void stopAudio() override { if (proc && processing) { proc->setProcessing(false); processing = false; } }
  void process(const float* inL, const float* inR, float* outL, float* outR, int n, int64_t fr,
               const MidiEv* me, int nme, const ParamEv* pe, int npe, double bpm, bool playing) override {
    if (!proc) { memset(outL, 0, n * 4); memset(outR, 0, n * 4); return; }
    if (!processing) startAudio();
    for (auto& b : ib) for (auto& c : b.ch) std::fill(c.begin(), c.end(), 0.f);
    for (auto& b : ob) for (auto& c : b.ch) std::fill(c.begin(), c.end(), 0.f);
    if (nIn && inL) { memcpy(ib[0].ch[0].data(), inL, n * 4); if (ib[0].ch.size() > 1) memcpy(ib[0].ch[1].data(), inR, n * 4); }
    evs.ev.clear(); chIn.clear(); chOut.clear();
    for (int i = 0; i < nme; i++) {
      const MidiEv& m = me[i]; const int32 off = (int32)std::max<int64_t>(0, std::min<int64_t>(n - 1, m.frame - fr));
      const int st = m.b[0] & 0xF0, chn = m.b[0] & 15;
      if (st == 0x90 && m.b[2] > 0) { Event e{}; e.busIndex = 0; e.sampleOffset = off; e.flags = Event::kIsLive; e.type = Event::kNoteOnEvent; e.noteOn = { (int16)chn, (int16)m.b[1], 0.f, m.b[2] / 127.f, 0, -1 }; evs.ev.push_back(e); }
      else if (st == 0x80 || st == 0x90) { Event e{}; e.busIndex = 0; e.sampleOffset = off; e.flags = Event::kIsLive; e.type = Event::kNoteOffEvent; e.noteOff = { (int16)chn, (int16)m.b[1], 0.f, -1, 0.f }; evs.ev.push_back(e); }
      else if (st == 0xB0 && m.b[1] < 128 && ccHas[m.b[1]]) { int32 qi; if (auto* q = chIn.addParameterData(ccMap[m.b[1]], qi)) { int32 pi; q->addPoint(off, m.b[2] / 127.0, pi); } }
      else if (st == 0xE0 && ccHas[kPitchBend]) { int32 qi; if (auto* q = chIn.addParameterData(ccMap[kPitchBend], qi)) { int32 pi; q->addPoint(off, ((m.b[2] << 7) | m.b[1]) / 16383.0, pi); } }
    }
    for (int i = 0; i < npe; i++) { int32 qi; if (auto* q = chIn.addParameterData(pe[i].id, qi)) { int32 pi; q->addPoint((int32)std::max<int64_t>(0, std::min<int64_t>(n - 1, pe[i].frame - fr)), pe[i].value, pi); } }
    ProcessContext pc{}; pc.state = ProcessContext::kTempoValid | ProcessContext::kTimeSigValid | ProcessContext::kProjectTimeMusicValid | (playing ? ProcessContext::kPlaying : 0);
    pc.sampleRate = sr; pc.projectTimeSamples = fr; pc.tempo = bpm > 0 ? bpm : 120; pc.timeSigNumerator = 4; pc.timeSigDenominator = 4; pc.projectTimeMusic = fr / sr * pc.tempo / 60.0;
    ProcessData d; d.processMode = kRealtime; d.symbolicSampleSize = kSample32; d.numSamples = n;
    d.numInputs = nIn; d.numOutputs = nOut; d.inputs = nIn ? ibb.data() : nullptr; d.outputs = obb.data();
    for (auto& b : ibb) b.silenceFlags = 0; for (auto& b : obb) b.silenceFlags = 0;
    d.inputParameterChanges = &chIn; d.outputParameterChanges = &chOut; d.inputEvents = &evs; d.outputEvents = nullptr; d.processContext = &pc;
    proc->process(d);
    memcpy(outL, ob[0].ch[0].data(), n * 4); memcpy(outR, ob[0].ch.size() > 1 ? ob[0].ch[1].data() : ob[0].ch[0].data(), n * 4);
    // what the plugin changed itself, back to its window
    if (chOut.n && ctrl && loop) for (int i = 0; i < chOut.n; i++) { auto& q = chOut.qs[i]; if (q.pts.empty()) continue; const ParamID id = q.id; const double v = q.pts.back().second; IEditController* c = ctrl; loop->post([this, c, id, v] { if (ctrl == c) c->setParamNormalized(id, v); }); }
  }
};

tresult PLUGIN_API Handler::performEdit(ParamID id, ParamValue v) { if (o && o->onParamFromGui) o->onParamFromGui(id, v); return kResultOk; }
tresult PLUGIN_API Handler::restartComponent(int32 flags) {
  if (o && (flags & kReloadComponent) && o->onRestart) o->loop->post([x = o] { x->onRestart(); });
  if (o && (flags & kLatencyChanged) && o->proc) o->lat = (int)o->proc->getLatencySamples();
  return kResultOk;
}
tresult PLUGIN_API Frame::resizeView(IPlugView* view, ViewRect* r) {
  if (!o || !r) return kInvalidArgument;
  if (o->onGuiResize) o->onGuiResize(r->getWidth(), r->getHeight());
  if (view) view->onSize(r);
  return kResultOk;
}
tresult PLUGIN_API Frame::registerEventHandler(Linux::IEventHandler* h, Linux::FileDescriptor fd) {
  if (!o || !o->loop || !h) return kInvalidArgument;
  fds[h].push_back(fd); o->loop->addFd(fd, [h](int f) { h->onFDIsSet(f); }); return kResultOk;
}
tresult PLUGIN_API Frame::unregisterEventHandler(Linux::IEventHandler* h) {
  auto it = fds.find(h); if (it == fds.end()) return kResultFalse;
  for (int fd : it->second) o->loop->removeFd(fd); fds.erase(it); return kResultOk;
}
tresult PLUGIN_API Frame::registerTimer(Linux::ITimerHandler* h, Linux::TimerInterval ms) {
  if (!o || !o->loop || !h) return kInvalidArgument;
  timers[h].push_back(o->loop->addTimer((int)std::max<uint64>(10, ms), [h] { h->onTimer(); })); return kResultOk;
}
tresult PLUGIN_API Frame::unregisterTimer(Linux::ITimerHandler* h) {
  auto it = timers.find(h); if (it == timers.end()) return kResultFalse;
  for (int t : it->second) o->loop->removeTimer(t); timers.erase(it); return kResultOk;
}

}  // namespace

Backend* newVst3() { return new V3(); }

bool scanVst3(const std::string& path, std::vector<Found>& out, std::string& err) {
  IPluginFactory* f = openMod(path, err); if (!f) return false;
  IPluginFactory2* f2 = nullptr; f->queryInterface(IPluginFactory2::iid, (void**)&f2);
  PFactoryInfo fi{}; f->getFactoryInfo(&fi);
  for (int32 i = 0, n = f->countClasses(); i < n; i++) {
    PClassInfo ci{}; if (f->getClassInfo(i, &ci) != kResultOk || strcmp(ci.category, kVstAudioEffectClass) != 0) continue;
    std::string vend = fi.vendor, ver, sub; bool inst = false;
    if (f2) { PClassInfo2 c2{}; if (f2->getClassInfo2(i, &c2) == kResultOk) { sub = c2.subCategories; inst = sub.find("Instrument") != std::string::npos; if (c2.vendor[0]) vend = c2.vendor; ver = c2.version; } }
    out.push_back({ "vst3", path, hexId(ci.cid), ci.name, vend, ver, inst ? "instrument" : "effect", sub });
  }
  if (f2) f2->release();
  return true;
}

}  // namespace nbplug
