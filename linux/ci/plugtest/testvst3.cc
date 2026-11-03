// (177, CI) a test VST3 module: "NB Test VSine" (instrument, one component with its controller) and "NB Test VGain" (effect,
// a separate controller, connected through IConnectionPoint, as most plugins are), each with an X11 view that uses
// the host's IRunLoop timer
#define INIT_CLASS_IID
#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivsthostapplication.h"
#include "pluginterfaces/vst/vstspeaker.h"
#include <X11/Xlib.h>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
using namespace Steinberg; using namespace Steinberg::Vst;
static void log(const char* m) { FILE* f = fopen("/tmp/nb-plugtest-vst3.log", "a"); if (f) { fprintf(f, "%s\n", m); fclose(f); } }
static const TUID SineCID = INLINE_UID(0x11111111, 0x22222222, 0x33333333, 0x44444444);
static const TUID GainCID = INLINE_UID(0x55555555, 0x66666666, 0x77777777, 0x88888888);
static const TUID GainCtlCID = INLINE_UID(0x99999999, 0xAAAAAAAA, 0xBBBBBBBB, 0xCCCCCCCC);
#define RC std::atomic<int32> rc{1}; uint32 PLUGIN_API addRef() override { return ++rc; } uint32 PLUGIN_API release() override { int32 r = --rc; if (!r) delete this; return r; }
static void cp16(const char* s, char16* d) { int i = 0; for (; s[i]; i++) d[i] = s[i]; d[i] = 0; }

struct View : IPlugView {
  RC
  IPlugFrame* frame = nullptr; Display* d = nullptr; Window w = 0; Linux::IRunLoop* rl = nullptr; int ticks = 0;
  struct T : Linux::ITimerHandler { View* v; uint32 PLUGIN_API addRef() override { return 1; } uint32 PLUGIN_API release() override { return 1; }
    tresult PLUGIN_API queryInterface(const TUID, void** o) override { *o = nullptr; return kNoInterface; } void PLUGIN_API onTimer() override { v->ticks++; } } t;
  View() { t.v = this; }
  tresult PLUGIN_API queryInterface(const TUID iid, void** o) override { QUERY_INTERFACE(iid, o, FUnknown::iid, IPlugView) QUERY_INTERFACE(iid, o, IPlugView::iid, IPlugView) *o = nullptr; return kNoInterface; }
  tresult PLUGIN_API isPlatformTypeSupported(FIDString t) override { return strcmp(t, kPlatformTypeX11EmbedWindowID) == 0 ? kResultTrue : kResultFalse; }
  tresult PLUGIN_API attached(void* parent, FIDString) override {
    d = XOpenDisplay(nullptr); if (!d) return kResultFalse;
    w = XCreateSimpleWindow(d, (Window)(uintptr_t)parent, 0, 0, 300, 180, 0, 0, 0xcc6633); XMapWindow(d, w); XFlush(d);
    if (frame && frame->queryInterface(Linux::IRunLoop::iid, (void**)&rl) == kResultOk && rl) rl->registerTimer(&t, 30);
    char b[80]; snprintf(b, sizeof b, "view attached parent %lu runloop %d", (unsigned long)(uintptr_t)parent, rl != nullptr); log(b); return kResultOk; }
  tresult PLUGIN_API removed() override { if (rl) { rl->unregisterTimer(&t); rl->release(); rl = nullptr; } if (d) { XDestroyWindow(d, w); XCloseDisplay(d); d = nullptr; } char b[60]; snprintf(b, sizeof b, "view removed ticks %d", ticks); log(b); return kResultOk; }
  tresult PLUGIN_API onWheel(float) override { return kResultFalse; }
  tresult PLUGIN_API onKeyDown(char16, int16, int16) override { return kResultFalse; }
  tresult PLUGIN_API onKeyUp(char16, int16, int16) override { return kResultFalse; }
  tresult PLUGIN_API getSize(ViewRect* r) override { *r = ViewRect(0, 0, 300, 180); return kResultOk; }
  tresult PLUGIN_API onSize(ViewRect*) override { return kResultOk; }
  tresult PLUGIN_API onFocus(TBool) override { return kResultOk; }
  tresult PLUGIN_API setFrame(IPlugFrame* f) override { frame = f; return kResultOk; }
  tresult PLUGIN_API canResize() override { return kResultFalse; }
  tresult PLUGIN_API checkSizeConstraint(ViewRect*) override { return kResultOk; }
};

// the controller part (both plugins): one parameter, Gain (id 7)
struct Ctl : IEditController, IConnectionPoint {
  RC
  double g = 0.5; IComponentHandler* h = nullptr; IConnectionPoint* peer = nullptr; bool gotMsg = false;
  tresult PLUGIN_API queryInterface(const TUID iid, void** o) override { QUERY_INTERFACE(iid, o, FUnknown::iid, IEditController) QUERY_INTERFACE(iid, o, IPluginBase::iid, IEditController)
    QUERY_INTERFACE(iid, o, IEditController::iid, IEditController) QUERY_INTERFACE(iid, o, IConnectionPoint::iid, IConnectionPoint) *o = nullptr; return kNoInterface; }
  tresult PLUGIN_API initialize(FUnknown*) override { return kResultOk; }
  tresult PLUGIN_API terminate() override { char b[60]; snprintf(b, sizeof b, "ctl terminate g=%.3f msg=%d", g, gotMsg); log(b); return kResultOk; }
  tresult PLUGIN_API setComponentState(IBStream* s) override { double x; int32 n = 0; if (s->read(&x, 8, &n) == kResultOk && n == 8) g = x; return kResultOk; }
  tresult PLUGIN_API setState(IBStream*) override { return kResultOk; }
  tresult PLUGIN_API getState(IBStream*) override { return kResultOk; }
  int32 PLUGIN_API getParameterCount() override { return 1; }
  tresult PLUGIN_API getParameterInfo(int32 i, ParameterInfo& p) override { if (i) return kResultFalse; memset(&p, 0, sizeof p); p.id = 7; cp16("Gain", p.title); cp16("Gain", p.shortTitle); p.defaultNormalizedValue = 0.5; p.flags = ParameterInfo::kCanAutomate; return kResultOk; }
  tresult PLUGIN_API getParamStringByValue(ParamID, ParamValue, String128 s) override { cp16("?", s); return kResultOk; }
  tresult PLUGIN_API getParamValueByString(ParamID, TChar*, ParamValue& v) override { v = 0; return kResultOk; }
  ParamValue PLUGIN_API normalizedParamToPlain(ParamID, ParamValue v) override { return v; }
  ParamValue PLUGIN_API plainParamToNormalized(ParamID, ParamValue v) override { return v; }
  ParamValue PLUGIN_API getParamNormalized(ParamID id) override { return id == 7 ? g : 0; }
  tresult PLUGIN_API setParamNormalized(ParamID id, ParamValue v) override { if (id == 7) g = v; return kResultOk; }
  tresult PLUGIN_API setComponentHandler(IComponentHandler* x) override { h = x; return kResultOk; }
  IPlugView* PLUGIN_API createView(FIDString n) override { return strcmp(n, ViewType::kEditor) == 0 ? new View() : nullptr; }
  tresult PLUGIN_API connect(IConnectionPoint* o) override { peer = o; return kResultOk; }
  tresult PLUGIN_API disconnect(IConnectionPoint*) override { peer = nullptr; return kResultOk; }
  tresult PLUGIN_API notify(IMessage* m) override { if (m && !strcmp(m->getMessageID(), "hello")) gotMsg = true; return kResultOk; }
};

struct Proc : IComponent, IAudioProcessor, IConnectionPoint {
  RC
  bool inst; Ctl* ctl = nullptr; FUnknown* host = nullptr; IConnectionPoint* peer = nullptr;
  double sr = 48000, ph = 0, f = 0, env = 0, vel = 0, g = 0.5; bool on = false; int procs = 0;
  Proc(bool i) : inst(i) { if (inst) ctl = new Ctl(); if (!inst) g = 0.5; }
  tresult PLUGIN_API queryInterface(const TUID iid, void** o) override {
    QUERY_INTERFACE(iid, o, FUnknown::iid, IComponent) QUERY_INTERFACE(iid, o, IPluginBase::iid, IComponent) QUERY_INTERFACE(iid, o, IComponent::iid, IComponent)
    QUERY_INTERFACE(iid, o, IAudioProcessor::iid, IAudioProcessor)
    if (inst && FUnknownPrivate::iidEqual(iid, IEditController::iid)) { ctl->addRef(); *o = (IEditController*)ctl; return kResultOk; }
    if (!inst) { QUERY_INTERFACE(iid, o, IConnectionPoint::iid, IConnectionPoint) }
    *o = nullptr; return kNoInterface; }
  tresult PLUGIN_API initialize(FUnknown* c) override { host = c; return kResultOk; }
  tresult PLUGIN_API terminate() override { char b[80]; snprintf(b, sizeof b, "proc terminate procs=%d g=%.3f", procs, g); log(b); return kResultOk; }
  tresult PLUGIN_API getControllerClassId(TUID cid) override { if (inst) return kResultFalse; memcpy(cid, GainCtlCID, 16); return kResultOk; }
  tresult PLUGIN_API setIoMode(IoMode) override { return kResultOk; }
  int32 PLUGIN_API getBusCount(MediaType t, BusDirection d) override { if (t == kAudio) return d == kOutput ? 1 : (inst ? 0 : 1); return (t == kEvent && d == kInput && inst) ? 1 : 0; }
  tresult PLUGIN_API getBusInfo(MediaType t, BusDirection d, int32 i, BusInfo& b) override { if (i) return kResultFalse; b.mediaType = t; b.direction = d; b.channelCount = t == kAudio ? 2 : 16; cp16("main", b.name); b.busType = kMain; b.flags = BusInfo::kDefaultActive; return kResultOk; }
  tresult PLUGIN_API getRoutingInfo(RoutingInfo&, RoutingInfo&) override { return kResultFalse; }
  tresult PLUGIN_API activateBus(MediaType, BusDirection, int32, TBool) override { return kResultOk; }
  tresult PLUGIN_API setActive(TBool s) override { char b[40]; snprintf(b, sizeof b, "setActive %d", (int)s); log(b);
    if (s && !inst && peer && host) { IHostApplication* ha = nullptr; if (host->queryInterface(IHostApplication::iid, (void**)&ha) == kResultOk) { IMessage* m = nullptr; TUID mi; memcpy(mi, IMessage::iid, 16);
      if (ha->createInstance(mi, mi, (void**)&m) == kResultOk && m) { m->setMessageID("hello"); m->getAttributes()->setInt("x", 1); peer->notify(m); m->release(); log("sent hello"); } else log("no IMessage from host"); ha->release(); } }
    return kResultOk; }
  tresult PLUGIN_API setState(IBStream* s) override { double x; int32 n = 0; if (s->read(&x, 8, &n) == kResultOk && n == 8) g = x; return kResultOk; }
  tresult PLUGIN_API getState(IBStream* s) override { int32 n; return s->write(&g, 8, &n); }
  tresult PLUGIN_API setBusArrangements(SpeakerArrangement*, int32, SpeakerArrangement*, int32) override { return kResultOk; }
  tresult PLUGIN_API getBusArrangement(BusDirection, int32, SpeakerArrangement& a) override { a = SpeakerArr::kStereo; return kResultOk; }
  tresult PLUGIN_API canProcessSampleSize(int32 s) override { return s == kSample32 ? kResultOk : kResultFalse; }
  uint32 PLUGIN_API getLatencySamples() override { return 0; }
  tresult PLUGIN_API setupProcessing(ProcessSetup& s) override { sr = s.sampleRate; return kResultOk; }
  tresult PLUGIN_API setProcessing(TBool) override { return kResultOk; }
  uint32 PLUGIN_API getTailSamples() override { return 0; }
  tresult PLUGIN_API process(ProcessData& d) override {
    procs++;
    if (d.inputParameterChanges) for (int32 i = 0; i < d.inputParameterChanges->getParameterCount(); i++) { auto* q = d.inputParameterChanges->getParameterData(i); int32 off; ParamValue v;
      if (q && q->getParameterId() == 7 && q->getPointCount() > 0 && q->getPoint(q->getPointCount() - 1, off, v) == kResultOk) g = v; }
    const int n = d.numSamples; float* L = d.outputs[0].channelBuffers32[0]; float* R = d.outputs[0].channelBuffers32[1];
    int ei = 0, ne = d.inputEvents ? d.inputEvents->getEventCount() : 0;
    for (int i = 0; i < n; i++) {
      Event e; while (ei < ne && d.inputEvents->getEvent(ei, e) == kResultOk && e.sampleOffset <= i) { ei++;
        if (e.type == Event::kNoteOnEvent) { f = 440 * pow(2, (e.noteOn.pitch - 69) / 12.0); vel = e.noteOn.velocity; on = true; } else if (e.type == Event::kNoteOffEvent) on = false; }
      if (inst) { env += ((on ? 1.0 : 0.0) - env) * 0.002; ph += f / sr; if (ph > 1) ph -= 1; const float s = (float)(sin(2 * M_PI * ph) * env * vel * g); L[i] = s; R[i] = s; }
      else { L[i] = d.inputs[0].channelBuffers32[0][i] * (float)(g * 2); R[i] = d.inputs[0].channelBuffers32[1][i] * (float)(g * 2); }
    }
    return kResultOk;
  }
  tresult PLUGIN_API connect(IConnectionPoint* o) override { peer = o; log("proc connected"); return kResultOk; }
  tresult PLUGIN_API disconnect(IConnectionPoint*) override { peer = nullptr; return kResultOk; }
  tresult PLUGIN_API notify(IMessage*) override { return kResultOk; }
  virtual ~Proc() { if (ctl) ctl->release(); }
};

struct Factory : IPluginFactory2 {
  uint32 PLUGIN_API addRef() override { return 1; } uint32 PLUGIN_API release() override { return 1; }
  tresult PLUGIN_API queryInterface(const TUID iid, void** o) override { QUERY_INTERFACE(iid, o, FUnknown::iid, IPluginFactory) QUERY_INTERFACE(iid, o, IPluginFactory::iid, IPluginFactory) QUERY_INTERFACE(iid, o, IPluginFactory2::iid, IPluginFactory2) *o = nullptr; return kNoInterface; }
  tresult PLUGIN_API getFactoryInfo(PFactoryInfo* i) override { memset(i, 0, sizeof *i); strcpy(i->vendor, "NB Tests"); return kResultOk; }
  int32 PLUGIN_API countClasses() override { return 3; }
  tresult PLUGIN_API getClassInfo(int32 i, PClassInfo* c) override { memset(c, 0, sizeof *c); c->cardinality = PClassInfo::kManyInstances;
    if (i == 0) { memcpy(c->cid, SineCID, 16); strcpy(c->category, kVstAudioEffectClass); strcpy(c->name, "NB Test VSine"); }
    else if (i == 1) { memcpy(c->cid, GainCID, 16); strcpy(c->category, kVstAudioEffectClass); strcpy(c->name, "NB Test VGain"); }
    else if (i == 2) { memcpy(c->cid, GainCtlCID, 16); strcpy(c->category, kVstComponentControllerClass); strcpy(c->name, "NB Test VGain Controller"); }
    else return kResultFalse; return kResultOk; }
  tresult PLUGIN_API getClassInfo2(int32 i, PClassInfo2* c) override { PClassInfo a; if (getClassInfo(i, &a) != kResultOk) return kResultFalse; memset(c, 0, sizeof *c); memcpy(c->cid, a.cid, 16); strcpy(c->category, a.category); strcpy(c->name, a.name);
    strcpy(c->subCategories, i == 0 ? "Instrument|Synth" : "Fx"); strcpy(c->vendor, "NB Tests"); strcpy(c->version, "1.0"); strcpy(c->sdkVersion, "VST 3.8"); return kResultOk; }
  tresult PLUGIN_API createInstance(FIDString cid, FIDString iid, void** o) override {
    *o = nullptr;
    if (FUnknownPrivate::iidEqual(cid, SineCID) || FUnknownPrivate::iidEqual(cid, GainCID)) { Proc* p = new Proc(FUnknownPrivate::iidEqual(cid, SineCID)); tresult r = p->queryInterface(iid, o); p->release(); return r; }
    if (FUnknownPrivate::iidEqual(cid, GainCtlCID)) { Ctl* c = new Ctl(); tresult r = c->queryInterface(iid, o); c->release(); return r; }
    return kResultFalse; }
};
static Factory gF;
extern "C" __attribute__((visibility("default"))) bool ModuleEntry(void*) { log("ModuleEntry"); return true; }
extern "C" __attribute__((visibility("default"))) bool ModuleExit() { return true; }
extern "C" __attribute__((visibility("default"))) IPluginFactory* GetPluginFactory() { return &gF; }
