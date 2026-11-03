// (182, CI) a test LV2 bundle: "NB Test LSine" (instrument: MIDI in, Gain, an X11 UI) and "NB Test LGain" (effect)
#include <lv2/core/lv2.h>
#include <lv2/atom/atom.h>
#include <lv2/atom/util.h>
#include <lv2/midi/midi.h>
#include <lv2/urid/urid.h>
#include <lv2/state/state.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
typedef struct { float* outL; float* outR; const float* inL; const float* inR; const float* gain; const LV2_Atom_Sequence* midi; int inst; double sr, ph, f, env, vel; int on; LV2_URID uMidi; long runs; float stored; } P;
static void lg(const char* m) { FILE* f = fopen("/tmp/nb-plugtest-lv2.log", "a"); if (f) { fprintf(f, "%s\n", m); fclose(f); } }
static LV2_Handle inst_(const LV2_Descriptor* d, double sr, const char* b, const LV2_Feature* const* fs) {
  P* p = calloc(1, sizeof(P)); p->sr = sr; p->inst = strstr(d->URI, "lsine") != NULL;
  for (int i = 0; fs && fs[i]; i++) if (!strcmp(fs[i]->URI, LV2_URID__map)) { LV2_URID_Map* m = fs[i]->data; p->uMidi = m->map(m->handle, LV2_MIDI__MidiEvent); }
  if (!p->uMidi && p->inst) { lg("no urid map"); free(p); return NULL; }
  lg(p->inst ? "instantiate lsine" : "instantiate lgain"); return p;
}
static void conn(LV2_Handle h, uint32_t port, void* d) { P* p = h;
  if (p->inst) { switch (port) { case 0: p->midi = d; break; case 1: p->gain = d; break; case 2: p->outL = d; break; case 3: p->outR = d; break; } }
  else { switch (port) { case 0: p->inL = d; break; case 1: p->inR = d; break; case 2: p->gain = d; break; case 3: p->outL = d; break; case 4: p->outR = d; break; } } }
static void run(LV2_Handle h, uint32_t n) { P* p = h; p->runs++;
  if (!p->inst) { for (uint32_t i = 0; i < n; i++) { p->outL[i] = p->inL[i] * *p->gain; p->outR[i] = p->inR[i] * *p->gain; } return; }
  uint32_t i = 0;
  LV2_ATOM_SEQUENCE_FOREACH(p->midi, ev) {
    for (; i < (uint32_t)ev->time.frames && i < n; i++) { p->env += ((p->on ? 1.0 : 0.0) - p->env) * 0.002; p->ph += p->f / p->sr; if (p->ph > 1) p->ph -= 1; float s = sin(2 * M_PI * p->ph) * p->env * p->vel * *p->gain; p->outL[i] = s; p->outR[i] = s; }
    if (ev->body.type == p->uMidi) { const uint8_t* m = (const uint8_t*)(ev + 1); if ((m[0] & 0xF0) == 0x90 && m[2]) { p->f = 440 * pow(2, (m[1] - 69) / 12.0); p->vel = m[2] / 127.0; p->on = 1; } else if ((m[0] & 0xF0) == 0x80 || (m[0] & 0xF0) == 0x90) p->on = 0; }
  }
  for (; i < n; i++) { p->env += ((p->on ? 1.0 : 0.0) - p->env) * 0.002; p->ph += p->f / p->sr; if (p->ph > 1) p->ph -= 1; float s = sin(2 * M_PI * p->ph) * p->env * p->vel * *p->gain; p->outL[i] = s; p->outR[i] = s; } }
static void cleanup(LV2_Handle h) { P* p = h; char b[80]; snprintf(b, sizeof b, "cleanup runs=%ld gain=%.3f", p->runs, p->gain ? *p->gain : -1); lg(b); free(h); }
static const LV2_Descriptor dS = { "urn:natebloom:test:lsine", inst_, conn, NULL, run, NULL, cleanup, NULL };
static const LV2_Descriptor dG = { "urn:natebloom:test:lgain", inst_, conn, NULL, run, NULL, cleanup, NULL };
LV2_SYMBOL_EXPORT const LV2_Descriptor* lv2_descriptor(uint32_t i) { return i == 0 ? &dS : i == 1 ? &dG : NULL; }
