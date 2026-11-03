// the LSine's X11 window: a coloured child of the host's window, with the idle interface
#include <lv2/ui/ui.h>
#include <X11/Xlib.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
typedef struct { Display* d; Window w; int idles; LV2UI_Write_Function write; LV2UI_Controller c; } U;
static void lg(const char* m) { FILE* f = fopen("/tmp/nb-plugtest-lv2.log", "a"); if (f) { fprintf(f, "%s\n", m); fclose(f); } }
static LV2UI_Handle ins(const LV2UI_Descriptor* d, const char* uri, const char* b, LV2UI_Write_Function wf, LV2UI_Controller c, LV2UI_Widget* wd, const LV2_Feature* const* fs) {
  Window parent = 0; for (int i = 0; fs[i]; i++) if (!strcmp(fs[i]->URI, LV2_UI__parent)) parent = (Window)(uintptr_t)fs[i]->data;
  if (!parent) return NULL; U* u = calloc(1, sizeof(U)); u->d = XOpenDisplay(NULL); if (!u->d) { free(u); return NULL; }
  u->w = XCreateSimpleWindow(u->d, parent, 0, 0, 280, 160, 0, 0, 0x33aa66); XMapWindow(u->d, u->w); XFlush(u->d); *wd = (LV2UI_Widget)(uintptr_t)u->w; u->write = wf; u->c = c;
  char m[80]; snprintf(m, sizeof m, "ui parent %lu", (unsigned long)parent); lg(m); return u; }
static void cln(LV2UI_Handle h) { U* u = h; char m[60]; snprintf(m, sizeof m, "ui cleanup idles=%d", u->idles); lg(m); XDestroyWindow(u->d, u->w); XCloseDisplay(u->d); free(u); }
static void pev(LV2UI_Handle h, uint32_t p, uint32_t s, uint32_t f, const void* b) {}
static int idle(LV2UI_Handle h) { ((U*)h)->idles++; return 0; }
static const LV2UI_Idle_Interface II = { idle };
static const void* ext(const char* uri) { return !strcmp(uri, LV2_UI__idleInterface) ? &II : NULL; }
static const LV2UI_Descriptor D = { "urn:natebloom:test:lsine#ui", ins, cln, pev, ext };
LV2_SYMBOL_EXPORT const LV2UI_Descriptor* lv2ui_descriptor(uint32_t i) { return i == 0 ? &D : NULL; }
