// Fuzz Bass II for Bitwig (CLAP): Nate Bloom's Fuzz Bass (build 211) as a native plugin. The original's thirteen
// controls, on the newer parts: jc303's diode ladder, a 4x-oversampled two-stage fuzz, a Big Muff tone stack.
#include <clap/clap.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include "fb_dsp.h"

struct PInfo { const char *name; float min, max, def; const char *unit; float show; };
static const PInfo PI_[NPARAM] = {
  {"Glide", 0.001f, 1, 0.06f, "s", 1}, {"Detune", 0, 50, 12, "ct", 1}, {"Sub", 0, 1, 0.5f, "%", 100},
  {"Cutoff", 40, 12000, 700, "Hz", 1}, {"Resonance", 0, 1, 0.3f, "%", 100}, {"Filter Env", 0, 1, 0.5f, "%", 100},
  {"Filter Decay", 0.01f, 3, 0.35f, "s", 1}, {"Fuzz", 0, 1, 0.7f, "%", 100}, {"Octave Fuzz", 0, 1, 0.15f, "%", 100},
  {"Tone", 0, 1, 0.55f, "%", 100}, {"Attack", 0.001f, 2, 0.005f, "s", 1}, {"Release", 0.01f, 3, 0.15f, "s", 1},
  {"Volume", 0, 1, 0.7f, "%", 100} };

struct Inst { clap_plugin_t pl; const clap_host_t *host; FuzzBass dsp; float L[512], R[512]; };
static Inst *I(const clap_plugin_t *p) { return (Inst *)p->plugin_data; }

static const char *FEATS[] = { CLAP_PLUGIN_FEATURE_INSTRUMENT, CLAP_PLUGIN_FEATURE_SYNTHESIZER, CLAP_PLUGIN_FEATURE_MONO, nullptr };
static const clap_plugin_descriptor_t DESC = { CLAP_VERSION_INIT, "com.nathan.fuzz-bass-2", "Fuzz Bass II", "Nathan", "https://nathan-san1981.github.io/nate-bloom/",
  "", "", "2.1.1", "Blown-out mono bass: saw, detuned square and sub, a TB-303-style diode ladder, oversampled two-stage fuzz with octave-up, Big Muff tone stack.", FEATS };

static bool p_init(const clap_plugin_t *) { return true; }
static void p_destroy(const clap_plugin_t *p) { delete I(p); }
static bool p_activate(const clap_plugin_t *p, double sr, uint32_t, uint32_t) { Inst *x = I(p); x->dsp.init((float)sr); x->dsp.reset(); return true; }
static void p_deactivate(const clap_plugin_t *) {}
static bool p_start(const clap_plugin_t *) { return true; }
static void p_stop(const clap_plugin_t *) {}
static void p_reset(const clap_plugin_t *p) { I(p)->dsp.reset(); }
static void p_main(const clap_plugin_t *) {}

static void midi(Inst *x, const uint8_t *d) {
  int st = d[0] & 0xF0;
  if (st == 0x90 && d[2] > 0) x->dsp.note_on(d[1]);
  else if (st == 0x80 || st == 0x90) x->dsp.note_off(d[1]);
  else if (st == 0xB0 && (d[1] == 120 || d[1] == 123)) { x->dsp.n_held = 0; x->dsp.gate = false; x->dsp.attacking = false; }
}
static void event(Inst *x, const clap_event_header_t *h) {
  if (h->space_id != CLAP_CORE_EVENT_SPACE_ID) return;
  switch (h->type) {
  case CLAP_EVENT_NOTE_ON: { const clap_event_note_t *e = (const clap_event_note_t *)h; if (e->key >= 0 && e->key < 128) x->dsp.note_on((uint8_t)e->key); break; }
  case CLAP_EVENT_NOTE_OFF: case CLAP_EVENT_NOTE_CHOKE: { const clap_event_note_t *e = (const clap_event_note_t *)h; if (e->key >= 0 && e->key < 128) x->dsp.note_off((uint8_t)e->key); else { x->dsp.n_held = 0; x->dsp.gate = false; } break; }
  case CLAP_EVENT_MIDI: { const clap_event_midi_t *e = (const clap_event_midi_t *)h; midi(x, e->data); break; }
  case CLAP_EVENT_PARAM_VALUE: { const clap_event_param_value_t *e = (const clap_event_param_value_t *)h; if (e->param_id < NPARAM) { const PInfo &q = PI_[e->param_id]; float v = (float)e->value; x->dsp.P[e->param_id] = v < q.min ? q.min : v > q.max ? q.max : v; } break; }
  }
}
static clap_process_status p_process(const clap_plugin_t *p, const clap_process_t *pr) {
  Inst *x = I(p); const uint32_t N = pr->frames_count, ne = pr->in_events->size(pr->in_events);
  float *oL = pr->audio_outputs[0].data32[0], *oR = pr->audio_outputs[0].channel_count > 1 ? pr->audio_outputs[0].data32[1] : nullptr;
  uint32_t ei = 0, at = 0;
  while (at < N) {
    while (ei < ne) { const clap_event_header_t *h = pr->in_events->get(pr->in_events, ei); if (h->time > at) break; event(x, h); ei++; }
    uint32_t next = N; if (ei < ne) { const clap_event_header_t *h = pr->in_events->get(pr->in_events, ei); if (h->time < next) next = h->time; }
    if (next - at > 512) next = at + 512;
    const uint32_t n = next - at;
    x->dsp.process(x->L, x->R, (int)n);
    memcpy(oL + at, x->L, n * 4); if (oR) memcpy(oR + at, x->R, n * 4);
    at = next;
  }
  while (ei < ne) { event(x, pr->in_events->get(pr->in_events, ei)); ei++; }
  return CLAP_PROCESS_CONTINUE;
}
// ---- params ----
static uint32_t pa_count(const clap_plugin_t *) { return NPARAM; }
static bool pa_info(const clap_plugin_t *, uint32_t i, clap_param_info_t *o) {
  if (i >= NPARAM) return false; memset(o, 0, sizeof *o);
  o->id = i; o->flags = CLAP_PARAM_IS_AUTOMATABLE; o->min_value = PI_[i].min; o->max_value = PI_[i].max; o->default_value = PI_[i].def;
  snprintf(o->name, sizeof o->name, "%s", PI_[i].name); return true;
}
static bool pa_value(const clap_plugin_t *p, clap_id id, double *v) { if (id >= NPARAM) return false; *v = I(p)->dsp.P[id]; return true; }
static bool pa_to_text(const clap_plugin_t *, clap_id id, double v, char *out, uint32_t cap) {
  if (id >= NPARAM) return false; const PInfo &q = PI_[id];
  if (q.show == 100) snprintf(out, cap, "%.0f %%", v * 100);
  else if (!strcmp(q.unit, "s")) { if (v < 1) snprintf(out, cap, "%.0f ms", v * 1000); else snprintf(out, cap, "%.2f s", v); }
  else snprintf(out, cap, "%.0f %s", v, q.unit);
  return true;
}
static bool pa_from_text(const clap_plugin_t *, clap_id id, const char *t, double *v) {
  if (id >= NPARAM) return false; double x = atof(t); const PInfo &q = PI_[id];
  if (q.show == 100) x /= 100; else if (!strcmp(q.unit, "s") && strstr(t, "ms")) x /= 1000;
  *v = x; return true;
}
static void pa_flush(const clap_plugin_t *p, const clap_input_events_t *in, const clap_output_events_t *) { Inst *x = I(p); for (uint32_t i = 0, n = in->size(in); i < n; i++) event(x, in->get(in, i)); }
static const clap_plugin_params_t PARAMS = { pa_count, pa_info, pa_value, pa_to_text, pa_from_text, pa_flush };
// ---- state: the thirteen values ----
static bool st_save(const clap_plugin_t *p, const clap_ostream_t *s) {
  char buf[512]; int n = snprintf(buf, sizeof buf, "FB2 1"); for (int i = 0; i < NPARAM; i++) n += snprintf(buf + n, sizeof buf - n, " %.9g", I(p)->dsp.P[i]);
  int off = 0; while (off < n) { int64_t w = s->write(s, buf + off, n - off); if (w <= 0) return false; off += (int)w; } return true;
}
static bool st_load(const clap_plugin_t *p, const clap_istream_t *s) {
  char buf[1024]; int n = 0; while (n < (int)sizeof buf - 1) { int64_t r = s->read(s, buf + n, sizeof buf - 1 - n); if (r <= 0) break; n += (int)r; } buf[n] = 0;
  if (strncmp(buf, "FB2 1", 5)) return false; char *c = buf + 5;
  for (int i = 0; i < NPARAM; i++) { char *e; double v = strtod(c, &e); if (e == c) break; c = e; const PInfo &q = PI_[i]; I(p)->dsp.P[i] = (float)(v < q.min ? q.min : v > q.max ? q.max : v); }
  return true;
}
static const clap_plugin_state_t STATE = { st_save, st_load };
// ---- ports ----
static uint32_t ap_count(const clap_plugin_t *, bool in) { return in ? 0 : 1; }
static bool ap_get(const clap_plugin_t *, uint32_t i, bool in, clap_audio_port_info_t *o) {
  if (in || i) return false; memset(o, 0, sizeof *o); o->id = 0; snprintf(o->name, sizeof o->name, "Out"); o->flags = CLAP_AUDIO_PORT_IS_MAIN; o->channel_count = 2; o->port_type = CLAP_PORT_STEREO; o->in_place_pair = CLAP_INVALID_ID; return true; }
static const clap_plugin_audio_ports_t APORTS = { ap_count, ap_get };
static uint32_t np_count(const clap_plugin_t *, bool in) { return in ? 1 : 0; }
static bool np_get(const clap_plugin_t *, uint32_t i, bool in, clap_note_port_info_t *o) {
  if (!in || i) return false; memset(o, 0, sizeof *o); o->id = 0; o->supported_dialects = CLAP_NOTE_DIALECT_CLAP | CLAP_NOTE_DIALECT_MIDI; o->preferred_dialect = CLAP_NOTE_DIALECT_CLAP; snprintf(o->name, sizeof o->name, "Notes"); return true; }
static const clap_plugin_note_ports_t NPORTS = { np_count, np_get };
static const void *p_ext(const clap_plugin_t *, const char *id) {
  if (!strcmp(id, CLAP_EXT_PARAMS)) return &PARAMS;
  if (!strcmp(id, CLAP_EXT_STATE)) return &STATE;
  if (!strcmp(id, CLAP_EXT_AUDIO_PORTS)) return &APORTS;
  if (!strcmp(id, CLAP_EXT_NOTE_PORTS)) return &NPORTS;
  return nullptr;
}
// ---- factory ----
static uint32_t f_count(const clap_plugin_factory_t *) { return 1; }
static const clap_plugin_descriptor_t *f_desc(const clap_plugin_factory_t *, uint32_t i) { return i ? nullptr : &DESC; }
static const clap_plugin_t *f_create(const clap_plugin_factory_t *, const clap_host_t *host, const char *id) {
  if (strcmp(id, DESC.id)) return nullptr;
  Inst *x = new Inst(); x->host = host;
  x->pl = { &DESC, x, p_init, p_destroy, p_activate, p_deactivate, p_start, p_stop, p_reset, p_process, p_ext, p_main };
  return &x->pl;
}
static const clap_plugin_factory_t FACTORY = { f_count, f_desc, f_create };
static bool e_init(const char *) { return true; }
static void e_deinit() {}
static const void *e_factory(const char *id) { return !strcmp(id, CLAP_PLUGIN_FACTORY_ID) ? &FACTORY : nullptr; }
extern "C" __attribute__((visibility("default"))) const clap_plugin_entry_t clap_entry = { CLAP_VERSION_INIT, e_init, e_deinit, e_factory };
