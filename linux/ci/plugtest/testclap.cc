// (177, CI) a test CLAP module: "NB Test Sine" (instrument) and "NB Test Gain" (effect), with an X11 window and a timer
#include <clap/clap.h>
#include <X11/Xlib.h>
#include <cmath>
#include <cstring>
#include <cstdio>
#include <atomic>
#include <string>

struct P {
  clap_plugin_t pl; const clap_host_t* host; bool inst; double sr = 48000; double gain; double ph = 0, f = 0, env = 0, vel = 0; bool on = false;
  Display* d = nullptr; Window w = 0; clap_id timer = 0; std::atomic<int> ticks{0}; int procs = 0; bool mainOk = true, audioOk = true;
  const clap_host_timer_support_t* hts = nullptr; const clap_host_thread_check_t* htc = nullptr;
};
static P* me(const clap_plugin_t* p) { return (P*)p->plugin_data; }
static void log(const char* m) { FILE* f = fopen("/tmp/nb-plugtest-clap.log", "a"); if (f) { fprintf(f, "%s\n", m); fclose(f); } }

static const char* fInst[] = { CLAP_PLUGIN_FEATURE_INSTRUMENT, CLAP_PLUGIN_FEATURE_SYNTHESIZER, nullptr };
static const char* fFx[] = { CLAP_PLUGIN_FEATURE_AUDIO_EFFECT, nullptr };
static const clap_plugin_descriptor_t dInst = { CLAP_VERSION, "nb.test.sine", "NB Test Sine", "NB Tests", "", "", "", "1.0", "", fInst };
static const clap_plugin_descriptor_t dFx = { CLAP_VERSION, "nb.test.gain", "NB Test Gain", "NB Tests", "", "", "", "1.0", "", fFx };

static uint32_t apCount(const clap_plugin_t* p, bool in) { return in ? (me(p)->inst ? 0 : 1) : 1; }
static bool apGet(const clap_plugin_t* p, uint32_t i, bool in, clap_audio_port_info_t* o) { if (i) return false; o->id = in ? 1 : 2; strcpy(o->name, "main"); o->flags = CLAP_AUDIO_PORT_IS_MAIN; o->channel_count = 2; o->port_type = CLAP_PORT_STEREO; o->in_place_pair = CLAP_INVALID_ID; return true; }
static const clap_plugin_audio_ports_t AP = { apCount, apGet };
static uint32_t npCount(const clap_plugin_t* p, bool in) { return in && me(p)->inst ? 1 : 0; }
static bool npGet(const clap_plugin_t*, uint32_t i, bool, clap_note_port_info_t* o) { if (i) return false; o->id = 1; o->supported_dialects = CLAP_NOTE_DIALECT_CLAP | CLAP_NOTE_DIALECT_MIDI; o->preferred_dialect = CLAP_NOTE_DIALECT_CLAP; strcpy(o->name, "notes"); return true; }
static const clap_plugin_note_ports_t NP = { npCount, npGet };
static uint32_t prCount(const clap_plugin_t*) { return 1; }
static bool prInfo(const clap_plugin_t* p, uint32_t i, clap_param_info_t* o) { if (i) return false; memset(o, 0, sizeof *o); o->id = 1; o->flags = CLAP_PARAM_IS_AUTOMATABLE; strcpy(o->name, "Gain"); o->min_value = 0; o->max_value = me(p)->inst ? 1 : 2; o->default_value = me(p)->inst ? 0.5 : 1; return true; }
static bool prVal(const clap_plugin_t* p, clap_id id, double* v) { if (id != 1) return false; *v = me(p)->gain; return true; }
static bool prV2T(const clap_plugin_t*, clap_id, double v, char* o, uint32_t n) { snprintf(o, n, "%.2f", v); return true; }
static bool prT2V(const clap_plugin_t*, clap_id, const char* t, double* v) { *v = atof(t); return true; }
static void prFlush(const clap_plugin_t*, const clap_input_events_t*, const clap_output_events_t*) {}
static const clap_plugin_params_t PR = { prCount, prInfo, prVal, prV2T, prT2V, prFlush };
static bool stSave(const clap_plugin_t* p, const clap_ostream_t* s) { double g = me(p)->gain; return s->write(s, &g, 8) == 8; }
static bool stLoad(const clap_plugin_t* p, const clap_istream_t* s) { double g; if (s->read(s, &g, 8) != 8) return false; me(p)->gain = g; return true; }
static const clap_plugin_state_t ST = { stSave, stLoad };
static bool guiApi(const clap_plugin_t*, const char* api, bool fl) { return !strcmp(api, CLAP_WINDOW_API_X11) && !fl; }
static bool guiPref(const clap_plugin_t*, const char** api, bool* fl) { *api = CLAP_WINDOW_API_X11; *fl = false; return true; }
static bool guiCreate(const clap_plugin_t* p, const char*, bool) { P* m = me(p); m->d = XOpenDisplay(nullptr); log(m->d ? "gui create" : "gui create: no display");
  if (m->hts) m->hts->register_timer(m->host, 30, &m->timer); if (m->htc && !m->htc->is_main_thread(m->host)) m->mainOk = false; return m->d != nullptr; }
static void guiDestroy(const clap_plugin_t* p) { P* m = me(p); if (m->hts && m->timer) m->hts->unregister_timer(m->host, m->timer); m->timer = 0; if (m->d) { if (m->w) XDestroyWindow(m->d, m->w); XCloseDisplay(m->d); } m->d = nullptr; m->w = 0; log("gui destroy"); }
static bool guiScale(const clap_plugin_t*, double) { return true; }
static bool guiSize(const clap_plugin_t*, uint32_t* w, uint32_t* h) { *w = 320; *h = 200; return true; }
static bool guiCanResize(const clap_plugin_t*) { return false; }
static bool guiHints(const clap_plugin_t*, clap_gui_resize_hints_t*) { return false; }
static bool guiAdjust(const clap_plugin_t*, uint32_t*, uint32_t*) { return false; }
static bool guiSetSize(const clap_plugin_t*, uint32_t, uint32_t) { return false; }
static bool guiParent(const clap_plugin_t* p, const clap_window_t* w) { P* m = me(p); if (!m->d) return false;
  m->w = XCreateSimpleWindow(m->d, (Window)w->x11, 0, 0, 320, 200, 0, 0, 0x3366cc); XMapWindow(m->d, m->w); XFlush(m->d); char b[80]; snprintf(b, sizeof b, "gui parent %lu child %lu", (unsigned long)w->x11, m->w); log(b); return true; }
static bool guiTrans(const clap_plugin_t*, const clap_window_t*) { return false; }
static void guiTitle(const clap_plugin_t*, const char*) {}
static bool guiShow(const clap_plugin_t*) { return true; }
static bool guiHide(const clap_plugin_t*) { return true; }
static const clap_plugin_gui_t GUI = { guiApi, guiPref, guiCreate, guiDestroy, guiScale, guiSize, guiCanResize, guiHints, guiAdjust, guiSetSize, guiParent, guiTrans, guiTitle, guiShow, guiHide };
static void onTimer(const clap_plugin_t* p, clap_id) { me(p)->ticks++; if (me(p)->htc && !me(p)->htc->is_main_thread(me(p)->host)) me(p)->mainOk = false; }
static const clap_plugin_timer_support_t TS = { onTimer };

static bool pInit(const clap_plugin_t* p) { P* m = me(p); m->hts = (const clap_host_timer_support_t*)m->host->get_extension(m->host, CLAP_EXT_TIMER_SUPPORT); m->htc = (const clap_host_thread_check_t*)m->host->get_extension(m->host, CLAP_EXT_THREAD_CHECK); return true; }
static void pDestroy(const clap_plugin_t* p) { char b[120]; snprintf(b, sizeof b, "destroy procs=%d ticks=%d mainOk=%d audioOk=%d gain=%.3f", me(p)->procs, me(p)->ticks.load(), me(p)->mainOk, me(p)->audioOk, me(p)->gain); log(b); delete me(p); }
static bool pAct(const clap_plugin_t* p, double sr, uint32_t, uint32_t) { me(p)->sr = sr; return true; }
static void pDeact(const clap_plugin_t*) {}
static bool pStart(const clap_plugin_t* p) { if (me(p)->htc && !me(p)->htc->is_audio_thread(me(p)->host)) me(p)->audioOk = false; return true; }
static void pStop(const clap_plugin_t*) {}
static void pReset(const clap_plugin_t*) {}
static clap_process_status pProc(const clap_plugin_t* p, const clap_process_t* pr) {
  P* m = me(p); m->procs++;
  if (m->htc && !m->htc->is_audio_thread(m->host)) m->audioOk = false;
  const uint32_t n = pr->frames_count, ne = pr->in_events->size(pr->in_events); uint32_t ei = 0;
  float* L = pr->audio_outputs[0].data32[0]; float* R = pr->audio_outputs[0].data32[1];
  for (uint32_t i = 0; i < n; i++) {
    while (ei < ne) { const clap_event_header_t* h = pr->in_events->get(pr->in_events, ei); if (h->time > i) break; ei++;
      if (h->type == CLAP_EVENT_NOTE_ON) { auto* e = (const clap_event_note_t*)h; m->f = 440 * pow(2, (e->key - 69) / 12.0); m->vel = e->velocity; m->on = true; }
      else if (h->type == CLAP_EVENT_NOTE_OFF) m->on = false;
      else if (h->type == CLAP_EVENT_PARAM_VALUE) { auto* e = (const clap_event_param_value_t*)h; if (e->param_id == 1) m->gain = e->value; } }
    if (m->inst) { m->env += ((m->on ? 1.0 : 0.0) - m->env) * 0.002; m->ph += m->f / m->sr; if (m->ph > 1) m->ph -= 1; const float s = (float)(sin(2 * M_PI * m->ph) * m->env * m->vel * m->gain); L[i] = s; R[i] = s; }
    else { L[i] = pr->audio_inputs[0].data32[0][i] * (float)m->gain; R[i] = pr->audio_inputs[0].data32[1][i] * (float)m->gain; }
  }
  return CLAP_PROCESS_CONTINUE;
}
static const void* pExt(const clap_plugin_t* p, const char* id) {
  if (!strcmp(id, CLAP_EXT_AUDIO_PORTS)) return &AP; if (!strcmp(id, CLAP_EXT_NOTE_PORTS)) return &NP; if (!strcmp(id, CLAP_EXT_PARAMS)) return &PR;
  if (!strcmp(id, CLAP_EXT_STATE)) return &ST; if (!strcmp(id, CLAP_EXT_GUI)) return &GUI; if (!strcmp(id, CLAP_EXT_TIMER_SUPPORT)) return &TS; return nullptr; }
static void pMain(const clap_plugin_t*) {}

static uint32_t fCount(const clap_plugin_factory_t*) { return 2; }
static const clap_plugin_descriptor_t* fDesc(const clap_plugin_factory_t*, uint32_t i) { return i == 0 ? &dInst : i == 1 ? &dFx : nullptr; }
static const clap_plugin_t* fCreate(const clap_plugin_factory_t*, const clap_host_t* h, const char* id) {
  const bool inst = !strcmp(id, dInst.id); if (!inst && strcmp(id, dFx.id)) return nullptr;
  P* m = new P(); m->host = h; m->inst = inst; m->gain = inst ? 0.5 : 1;
  m->pl = { inst ? &dInst : &dFx, m, pInit, pDestroy, pAct, pDeact, pStart, pStop, pReset, pProc, pExt, pMain };
  log(inst ? "create sine" : "create gain"); return &m->pl;
}
static const clap_plugin_factory_t F = { fCount, fDesc, fCreate };
static bool eInit(const char*) { return true; }
static void eDeinit() {}
static const void* eFactory(const char* id) { return !strcmp(id, CLAP_PLUGIN_FACTORY_ID) ? &F : nullptr; }
extern "C" CLAP_EXPORT const clap_plugin_entry_t clap_entry = { CLAP_VERSION, eInit, eDeinit, eFactory };
