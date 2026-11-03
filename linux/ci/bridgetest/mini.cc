// a minimal real-time CLAP host for testing the bridge: 128-frame blocks paced by the clock, notes at set frames
#include <clap/clap.h>
#include <dlfcn.h>
#include <cstdio>
#include <cstring>
#include <cmath>
#include <vector>
#include <time.h>
#include <unistd.h>
static const void* hostExt(const clap_host_t*, const char*) { return nullptr; }
static void hostReq(const clap_host_t*) {}
static clap_host_t H = { CLAP_VERSION, nullptr, "mini", "t", "", "1", hostExt, hostReq, hostReq, hostReq };
struct Evs { std::vector<clap_event_note_t> v; };
static uint32_t esize(const clap_input_events_t* l) { return (uint32_t)((Evs*)l->ctx)->v.size(); }
static const clap_event_header_t* eget(const clap_input_events_t* l, uint32_t i) { return &((Evs*)l->ctx)->v[i].header; }
static bool epush(const clap_output_events_t*, const clap_event_header_t*) { return true; }
int main(int argc, char** argv) {
  void* lib = dlopen(argv[1], RTLD_NOW); if (!lib) { printf("dlopen %s\n", dlerror()); return 1; }
  auto* entry = (const clap_plugin_entry_t*)dlsym(lib, "clap_entry"); entry->init(argv[1]);
  auto* f = (const clap_plugin_factory_t*)entry->get_factory(CLAP_PLUGIN_FACTORY_ID);
  const clap_plugin_t* p = f->create_plugin(f, &H, f->get_plugin_descriptor(f, 0)->id); p->init(p);
  const double SR = 48000; p->activate(p, SR, 128, 128); p->start_processing(p);
  auto* lat = (const clap_plugin_latency_t*)p->get_extension(p, CLAP_EXT_LATENCY); printf("latency %u\n", lat ? lat->get(p) : 0);
  const int total = (int)(SR * 9); std::vector<float> rec(total), recR(total);
  std::vector<std::pair<int, int>> notes = { {48000, 60}, {62400, -60}, {168000, 64}, {182400, -64}, {288000, 67}, {302400, -67} };
  float L[128], R[128]; float* outs[2] = { L, R }; clap_audio_buffer_t ob{}; ob.data32 = outs; ob.channel_count = 2;
  timespec t0; clock_gettime(CLOCK_MONOTONIC, &t0);
  for (int fr = 0; fr < total; fr += 128) {
    // pace: wait until this block's time
    const double due = fr / SR; for (;;) { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); double el = (t.tv_sec - t0.tv_sec) + (t.tv_nsec - t0.tv_nsec) / 1e9; if (el >= due - 0.005) break; usleep(300); }
    Evs E; for (auto& n : notes) if (std::abs(n.first) >= fr && n.first < fr + 128) { clap_event_note_t e{}; e.header.size = sizeof e; e.header.time = n.first - fr; e.header.space_id = CLAP_CORE_EVENT_SPACE_ID; e.header.type = n.second > 0 ? CLAP_EVENT_NOTE_ON : CLAP_EVENT_NOTE_OFF; e.key = std::abs(n.second); e.channel = 0; e.port_index = 0; e.note_id = -1; e.velocity = n.second > 0 ? 0.85 : 0; E.v.push_back(e); }
    clap_input_events_t in{ &E, esize, eget }; clap_output_events_t out{ nullptr, epush };
    clap_process_t pr{}; pr.steady_time = fr; pr.frames_count = 128; pr.audio_outputs = &ob; pr.audio_outputs_count = 1; pr.in_events = &in; pr.out_events = &out;
    p->process(p, &pr);
    for (int i = 0; i < 128 && fr + i < total; i++) { rec[fr + i] = L[i]; recR[fr + i] = R[i]; }
  }
  auto onset = [&](int from) { for (int i = from; i < from + 24000 && i < total; i++) if (std::fabs(rec[i]) > 0.003) return i; return -1; };
  auto rms = [&](int a, int b) { double s = 0; for (int i = a; i < b; i++) s += rec[i] * rec[i]; return std::sqrt(s / (b - a)); };
  for (auto& n : notes) if (n.second > 0) { int o = onset(n.first - 4000); printf("note at %d -> sound from %d: %+.2f ms after · rms %.4f\n", n.first, o, (o - n.first) / SR * 1000, rms(n.first, n.first + 14400)); }
  printf("before the first note: rms %.5f · between (2.5 s after an off): %.5f\n", rms(9600, 43000), rms(150000, 166000));
  p->stop_processing(p); p->deactivate(p); p->destroy(p); entry->deinit();
  FILE* fo = fopen("/tmp/nb-bridge-rec.f32", "wb"); fwrite(rec.data(), 4, total, fo); fclose(fo);
  return 0;
}
