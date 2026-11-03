// (177) Nate Bloom's VST3 and CLAP host, for the Linux app: nbplug.node.
//
// The page loads a plugin (plug_load), then hands each instance shared memory (plug_attach): a header and two rings,
// in and out, that the page's AudioWorklet ("nb-plug-io", 820-vst-plugins.js) reads and writes. Each instance works on
// its own audio thread, 128 frames at a time: an instrument renders ahead of where the worklet reads (like the native
// engine, nb_engine.cc); an effect works on the input as it arrives and the worklet plays its output a little later.
// Notes and controller moves arrive with the frame they're for (plug_midi), so they land on time.
//
// Everything else a plugin does (starting, settings, parameters, its own window, its timers and file handles) runs on
// one "plugin main" thread here, with its own X11 connection for the windows. Scanning runs in a separate process
// (main.js starts it), so a plugin that crashes while being looked at can't take the app down.
//
// header (Float64Array): [0] the worklet's frame (an instrument: where it has read to; an effect: input written up to)
// [1] written up to (here) [2] underruns (worklet) [3] capacity [4] mode (1 instrument, 2 effect) [5] ahead (frames)
// [6] the effect's delay (frames, the worklet's) [7] late blocks (here). Rings: planar stereo, (ch * cap + frame % cap).
#define NAPI_VERSION 8
#include <node_api.h>
#include "nb_plug.h"
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/Xatom.h>
#include <poll.h>
#include <pthread.h>
#include <sched.h>
#include <sys/eventfd.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <sys/wait.h>
#include <linux/futex.h>
#include <spawn.h>
#include <signal.h>
#include <time.h>
#include <unistd.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstring>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <thread>
extern char** environ;

namespace nbplug {

static std::thread::id gMainId;
static thread_local bool tlAudio = false;
bool isMainThread() { return std::this_thread::get_id() == gMainId; }
bool isAudioThread() { return tlAudio; }

static int64_t nowMs() { return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count(); }

// ---- the plugin main thread ----
struct Main : MainLoop {
  std::thread th; std::mutex mu; std::deque<std::function<void()>> jobs; int efd = -1; std::atomic<bool> run{false};
  struct Timer { int ms; int64_t next; std::function<void()> fn; bool alive; };
  std::map<int, Timer> timers; int nextTimer = 1;
  std::map<int, std::function<void(int)>> fds;
  std::function<void()> onX;   // X events (the windows)
  int xfd = -1;
  void start() {
    if (run.load()) return;
    efd = eventfd(0, EFD_NONBLOCK | EFD_CLOEXEC); run.store(true);
    std::mutex m; std::condition_variable cv; bool up = false;
    th = std::thread([&, this] { pthread_setname_np(pthread_self(), "nb-plugmain"); gMainId = std::this_thread::get_id(); { std::lock_guard<std::mutex> lk(m); up = true; } cv.notify_all(); loopFn(); });
    std::unique_lock<std::mutex> lk(m); cv.wait(lk, [&] { return up; });
  }
  void loopFn() {
    while (run.load()) {
      int64_t now = nowMs(), wait = 50;
      for (auto& t : timers) if (t.second.alive) wait = std::min<int64_t>(wait, std::max<int64_t>(0, t.second.next - now));
      std::vector<pollfd> pf; pf.push_back({ efd, POLLIN, 0 }); if (xfd >= 0) pf.push_back({ xfd, POLLIN, 0 });
      for (auto& f : fds) pf.push_back({ f.first, POLLIN, 0 });
      poll(pf.data(), pf.size(), (int)wait);
      if (pf[0].revents) { uint64_t v; (void)!read(efd, &v, 8); }
      for (;;) { std::function<void()> j; { std::lock_guard<std::mutex> lk(mu); if (jobs.empty()) break; j = std::move(jobs.front()); jobs.pop_front(); } j(); }
      for (size_t i = 1; i < pf.size(); i++) {
        if (!pf[i].revents) continue;
        if (pf[i].fd == xfd) continue;
        auto it = fds.find(pf[i].fd); if (it != fds.end()) { auto fn = it->second; fn(pf[i].fd); }
      }
      if (onX) onX();   // (also drains what plugins' calls queued on our connection)
      now = nowMs();
      std::vector<int> due; for (auto& t : timers) if (t.second.alive && t.second.next <= now) due.push_back(t.first);
      for (int id : due) { auto it = timers.find(id); if (it == timers.end() || !it->second.alive) continue; it->second.next = now + it->second.ms; auto fn = it->second.fn; fn(); }
      for (auto it = timers.begin(); it != timers.end();) { if (!it->second.alive) it = timers.erase(it); else ++it; }
    }
  }
  void post(std::function<void()> fn) override { { std::lock_guard<std::mutex> lk(mu); jobs.push_back(std::move(fn)); } uint64_t one = 1; (void)!write(efd, &one, 8); }
  bool onMain() override { return isMainThread(); }
  int addTimer(int ms, std::function<void()> fn) override { const int id = nextTimer++; timers[id] = { ms, nowMs() + ms, std::move(fn), true }; return id; }
  void removeTimer(int id) override { auto it = timers.find(id); if (it != timers.end()) it->second.alive = false; }
  int addFd(int fd, std::function<void(int)> fn) override { fds[fd] = std::move(fn); return fd; }
  void removeFd(int fd) override { fds.erase(fd); }
};
static Main* gMain = nullptr;
static Main* mainLoop() { if (!gMain) { gMain = new Main(); gMain->start(); } return gMain; }

// ---- the windows plugins show their controls in (X11) ----
static Display* gDpy = nullptr; static Atom aDel = 0, aProto = 0;
struct XWin;
static std::map<Window, XWin*> gWins;
struct XWin : Win {
  Window w = 0; int W = 640, H = 400; bool fixed = true; int lastW = 0, lastH = 0;
  std::function<void()> onClose; std::function<void(int, int)> onUserSize;
  unsigned long xid() override { return w; }
  void hints() { XSizeHints* sh = XAllocSizeHints(); sh->flags = PSize | (fixed ? (PMinSize | PMaxSize) : PMinSize); sh->width = W; sh->height = H;
    sh->min_width = fixed ? W : 120; sh->min_height = fixed ? H : 80; sh->max_width = W; sh->max_height = H; XSetWMNormalHints(gDpy, w, sh); XFree(sh); }
  void resize(int w_, int h_) override { W = std::max(40, w_); H = std::max(30, h_); lastW = W; lastH = H; if (!w) return; hints(); XResizeWindow(gDpy, w, W, H); XFlush(gDpy); }
  void show() override { if (!w) return; XMapRaised(gDpy, w); XFlush(gDpy); }
};
static bool xOpen(std::string& err) {
  if (gDpy) return true;
  gDpy = XOpenDisplay(nullptr);
  if (!gDpy) { err = "no X11 display (plugin windows need X11 or XWayland)"; return false; }
  aDel = XInternAtom(gDpy, "WM_DELETE_WINDOW", False); aProto = XInternAtom(gDpy, "WM_PROTOCOLS", False);
  Main* M = mainLoop(); M->xfd = ConnectionNumber(gDpy);
  M->onX = [] {
    while (gDpy && XPending(gDpy)) {
      XEvent e; XNextEvent(gDpy, &e);
      auto it = gWins.find(e.xany.window); if (it == gWins.end()) continue;
      XWin* x = it->second;
      if (e.type == ClientMessage && (Atom)e.xclient.data.l[0] == aDel) { if (x->onClose) x->onClose(); }
      else if (e.type == ConfigureNotify) { const int w = e.xconfigure.width, h = e.xconfigure.height;
        if ((w != x->lastW || h != x->lastH) && w > 0 && h > 0) { x->lastW = w; x->lastH = h; x->W = w; x->H = h; if (!x->fixed && x->onUserSize) x->onUserSize(w, h); } }
    }
  };
  return true;
}
static XWin* xMake(const std::string& title, unsigned long parentHint) {
  XWin* x = new XWin(); const int s = DefaultScreen(gDpy);
  XSetWindowAttributes a{}; a.background_pixel = BlackPixel(gDpy, s); a.event_mask = StructureNotifyMask;
  x->w = XCreateWindow(gDpy, RootWindow(gDpy, s), 80, 80, x->W, x->H, 0, CopyFromParent, InputOutput, CopyFromParent, CWBackPixel | CWEventMask, &a);
  XStoreName(gDpy, x->w, title.c_str());
  const Atom netName = XInternAtom(gDpy, "_NET_WM_NAME", False), utf8 = XInternAtom(gDpy, "UTF8_STRING", False);
  XChangeProperty(gDpy, x->w, netName, utf8, 8, PropModeReplace, (const unsigned char*)title.c_str(), (int)title.size());
  XClassHint ch; ch.res_name = (char*)"nate-bloom"; ch.res_class = (char*)"Nate Bloom"; XSetClassHint(gDpy, x->w, &ch);
  XSetWMProtocols(gDpy, x->w, &aDel, 1);
  const long pid = getpid(); XChangeProperty(gDpy, x->w, XInternAtom(gDpy, "_NET_WM_PID", False), XA_CARDINAL, 32, PropModeReplace, (const unsigned char*)&pid, 1);
  if (parentHint) XSetTransientForHint(gDpy, x->w, (Window)parentHint);   // (stays above Nate Bloom's window)
  gWins[x->w] = x; XFlush(gDpy);
  return x;
}
static void xDrop(XWin* x) { if (!x) return; if (gDpy && x->w) { gWins.erase(x->w); XDestroyWindow(gDpy, x->w); XFlush(gDpy); } delete x; }

// ---- an instance ----
struct Inst {
  int id = 0; std::string fmt, path, uid; Backend* be = nullptr; double sr = 48000; bool instrument = true;
  // shared memory (the page's)
  double* hdr = nullptr; float* inR = nullptr; float* outR = nullptr; int cap = 0; napi_ref refs[3] = {};
  std::thread th; std::atomic<bool> run{false};
  std::mutex qmu; std::vector<MidiEv> mq; std::vector<ParamEv> pq;
  std::atomic<int64_t> pf{0}; std::atomic<double> us{0}, maxUs{0}; std::atomic<int64_t> blocks{0}, late{0};
  XWin* win = nullptr; bool guiOpen = false; bool remote = false;
  std::atomic<bool> dead{false};
};
static std::mutex gIMu; static std::map<int, std::shared_ptr<Inst>> gInst; static int gNextId = 1;
static std::atomic<double> gBpm{120}; static std::atomic<bool> gPlaying{false};
static std::mutex gNoteMu; static std::vector<std::string> gNotices;   // for the page: "closed:3" and so on
static void notice(const std::string& s) { std::lock_guard<std::mutex> lk(gNoteMu); if (gNotices.size() < 64) gNotices.push_back(s); }
static std::shared_ptr<Inst> findInst(int id) { std::lock_guard<std::mutex> lk(gIMu); auto it = gInst.find(id); return it == gInst.end() ? nullptr : it->second; }

static void audioLoop(Inst* I) {
  { char nm[16]; snprintf(nm, sizeof nm, "nb-plug-%d", I->id); pthread_setname_np(pthread_self(), nm); }   // (179: the CPU meter finds each plugin by its thread)
  tlAudio = true;
  { sched_param sp; sp.sched_priority = 18; pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp); }
  I->be->startAudio();
  std::vector<float> zl(BLOCK, 0.f), zr(BLOCK, 0.f), il(BLOCK), ir(BLOCK), ol(BLOCK), orr(BLOCK);
  std::vector<MidiEv> mine, keep; std::vector<ParamEv> pmine, pkeep; mine.reserve(256); keep.reserve(256);
  const int cap = I->cap; double* h = I->hdr;
  {   // where to start
    double r; __atomic_load(&h[0], &r, __ATOMIC_ACQUIRE); int64_t f = (int64_t)r; f -= f % BLOCK; I->pf.store(f);
  }
  while (I->run.load()) {
    double rd, ad; __atomic_load(&h[0], &rd, __ATOMIC_ACQUIRE); ad = h[5];
    const int64_t r = (int64_t)rd, ahead = (int64_t)std::max(128.0, std::min(4096.0, ad));
    const int64_t target = I->instrument ? r + ahead : r;   // an effect works only on input that's arrived
    int64_t pf = I->pf.load();
    if (I->instrument ? (pf < r) : (pf < r - cap / 2)) { I->late.fetch_add(1); double l = (double)I->late.load(); h[7] = l; pf = I->instrument ? r - (r % BLOCK) : r - (r % BLOCK) - BLOCK; }   // fell behind: catch up
    int guard = 0;
    while (pf + BLOCK <= target && guard++ < 64) {
      // this block's notes and parameter changes (later ones wait)
      { std::lock_guard<std::mutex> lk(I->qmu);
        if (!I->mq.empty()) { keep.clear(); for (auto& m : I->mq) (m.frame < pf + BLOCK ? mine : keep).push_back(m); I->mq.swap(keep); }
        if (!I->pq.empty()) { pkeep.clear(); for (auto& p : I->pq) (p.frame < pf + BLOCK ? pmine : pkeep).push_back(p); I->pq.swap(pkeep); } }
      std::stable_sort(mine.begin(), mine.end(), [](const MidiEv& a, const MidiEv& b) { return a.frame < b.frame; });
      const float* inL = nullptr; const float* inRp = nullptr;
      if (!I->instrument) { for (int i = 0; i < BLOCK; i++) { const int k = (int)((pf + i) % cap); il[i] = I->inR[k]; ir[i] = I->inR[cap + k]; } inL = il.data(); inRp = ir.data(); }
      else { inL = zl.data(); inRp = zr.data(); }
      timespec a, b; clock_gettime(CLOCK_MONOTONIC, &a);
      I->be->process(inL, inRp, ol.data(), orr.data(), BLOCK, pf, mine.data(), (int)mine.size(), pmine.data(), (int)pmine.size(), gBpm.load(), gPlaying.load());
      clock_gettime(CLOCK_MONOTONIC, &b);
      const double u = (b.tv_sec - a.tv_sec) * 1e6 + (b.tv_nsec - a.tv_nsec) / 1e3;
      I->us.store(I->us.load() * 0.98 + u * 0.02); if (u > I->maxUs.load()) I->maxUs.store(u);
      mine.clear(); pmine.clear();
      for (int i = 0; i < BLOCK; i++) { const float L = ol[i], R = orr[i]; const int k = (int)((pf + i) % cap);
        I->outR[k] = std::isfinite(L) ? std::max(-4.f, std::min(4.f, L)) : 0.f; I->outR[cap + k] = std::isfinite(R) ? std::max(-4.f, std::min(4.f, R)) : 0.f; }   // (a plugin's NaN or blast stops here)
      pf += BLOCK; I->pf.store(pf); I->blocks.fetch_add(1);
      double w = (double)pf; __atomic_store(&h[1], &w, __ATOMIC_RELEASE);
    }
    // (181) sleep as long as the room ahead allows (half of what's beyond two blocks: the browser takes at most one
    // burst meanwhile), not a fixed 0.4 ms: an idle plugin cost 3-4% of a core in wake-ups alone
    { const double room = I->instrument ? ad : h[6]; const long us = (long)std::max(400.0, std::min(2000.0, (room - 256) / I->sr * 0.5e6));
      timespec ts{ 0, us * 1000 }; nanosleep(&ts, nullptr); }
  }
  I->be->stopAudio();
}

// ---- N-API ----
static napi_value str(napi_env env, const std::string& s) { napi_value r; napi_create_string_utf8(env, s.c_str(), s.size(), &r); return r; }
static napi_value num(napi_env env, double d) { napi_value r; napi_create_double(env, d, &r); return r; }
static napi_value boolv(napi_env env, bool b) { napi_value r; napi_get_boolean(env, b, &r); return r; }
static double argd(napi_env env, napi_value v, double d = 0) { double x = d; if (napi_get_value_double(env, v, &x) != napi_ok) return d; return x; }
static std::string args(napi_env env, napi_value v) { size_t n = 0; if (napi_get_value_string_utf8(env, v, nullptr, 0, &n) != napi_ok) return ""; std::string s(n, 0); napi_get_value_string_utf8(env, v, &s[0], n + 1, &n); return s; }
static size_t getargs(napi_env env, napi_callback_info info, napi_value* argv, size_t n) { size_t argc = n; napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr); return argc; }
static void* typedData(napi_env env, napi_value v, size_t* len) {
  bool is = false; napi_is_typedarray(env, v, &is); if (!is) return nullptr;
  napi_typedarray_type t; size_t n; void* data = nullptr; napi_value ab; size_t off;
  if (napi_get_typedarray_info(env, v, &t, &n, &data, &ab, &off) != napi_ok) return nullptr;
  if (len) *len = n; return data;
}
static std::string jesc(const std::string& s) {
  std::string o = "\""; for (unsigned char c : s) { if (c == '"' || c == '\\') { o += '\\'; o += (char)c; } else if (c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); o += b; } else o += (char)c; } return o + "\"";
}
static std::string jnum(double d) { if (!std::isfinite(d)) return "0"; char b[40]; snprintf(b, sizeof b, "%.10g", d); return b; }
static const char* B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static std::string b64e(const std::vector<uint8_t>& d) {
  std::string o; o.reserve((d.size() + 2) / 3 * 4);
  for (size_t i = 0; i < d.size(); i += 3) { uint32_t v = d[i] << 16 | (i + 1 < d.size() ? d[i + 1] << 8 : 0) | (i + 2 < d.size() ? d[i + 2] : 0);
    o += B64[(v >> 18) & 63]; o += B64[(v >> 12) & 63]; o += i + 1 < d.size() ? B64[(v >> 6) & 63] : '='; o += i + 2 < d.size() ? B64[v & 63] : '='; }
  return o;
}
static std::vector<uint8_t> b64d(const std::string& s) {
  int T[256]; for (int i = 0; i < 256; i++) T[i] = -1; for (int i = 0; i < 64; i++) T[(unsigned char)B64[i]] = i;
  std::vector<uint8_t> o; uint32_t v = 0; int bits = 0;
  for (unsigned char c : s) { if (T[c] < 0) continue; v = (v << 6) | T[c]; bits += 6; if (bits >= 8) { bits -= 8; o.push_back((uint8_t)((v >> bits) & 255)); } }
  return o;
}
static std::string paramsJson(Backend* be) {
  { const std::string r = be->paramsJsonRemote(); if (!r.empty()) return r; }
  std::string j = "["; bool first = true;
  for (auto& p : be->params()) { if (!first) j += ","; first = false;
    j += "{\"id\":" + jnum(p.id) + ",\"name\":" + jesc(p.name) + ",\"min\":" + jnum(p.min) + ",\"max\":" + jnum(p.max) + ",\"def\":" + jnum(p.def) + ",\"value\":" + jnum(p.value) + ",\"steps\":" + jnum(p.steps) + ",\"auto\":" + (p.automatable ? "true" : "false") + "}"; }
  return j + "]";
}

// promises: a job runs on the plugin main thread, its answer (JSON) goes back to the page's thread
struct Pending { napi_deferred d; bool ok; std::string json; };
static napi_threadsafe_function gTs = nullptr; static int gTsBusy = 0;   // (held while a call is out, so a plain Node process waits for it)
static void tsCall(napi_env env, napi_value, void*, void* data) {
  Pending* p = (Pending*)data; if (!env) { delete p; return; }
  if (--gTsBusy == 0) napi_unref_threadsafe_function(env, gTs);
  napi_value v = str(env, p->json);
  if (p->ok) napi_resolve_deferred(env, p->d, v); else napi_reject_deferred(env, p->d, v);
  delete p;
}
static napi_value async(napi_env env, std::function<bool(std::string&)> job) {
  napi_value promise; napi_deferred d; napi_create_promise(env, &d, &promise);
  if (!gTs) { napi_value name = str(env, "nbplug"); napi_create_threadsafe_function(env, nullptr, nullptr, name, 0, 1, nullptr, nullptr, nullptr, tsCall, &gTs); napi_unref_threadsafe_function(env, gTs); }
  if (gTsBusy++ == 0) napi_ref_threadsafe_function(env, gTs);
  mainLoop()->post([d, job] { Pending* p = new Pending{ d, false, "" }; try { p->ok = job(p->json); } catch (...) { p->ok = false; p->json = "a plugin call failed"; } napi_call_threadsafe_function(gTs, p, napi_tsfn_blocking); });
  return promise;
}

static std::string gHostScript, gExe;   // (184)
static Backend* newRemote(const std::string& fmt, int id);
// plug_scan(fmt, path) -> JSON [{fmt,path,uid,name,vendor,version,kind,features}] or {"error":...}  (the scanner process)
static napi_value Scan(napi_env env, napi_callback_info info) {
  napi_value a[2]; if (getargs(env, info, a, 2) < 2) return str(env, "{\"error\":\"args\"}");
  const std::string fmt = args(env, a[0]), path = args(env, a[1]);
  std::vector<Found> out; std::string err; const bool ok = fmt == "clap" ? scanClap(path, out, err) : fmt == "lv2" ? scanLv2(path, out, err) : scanVst3(path, out, err);
  if (!ok) return str(env, "{\"error\":" + jesc(err) + "}");
  std::string j = "["; for (size_t i = 0; i < out.size(); i++) { const Found& f = out[i]; if (i) j += ",";
    j += "{\"fmt\":" + jesc(f.fmt) + ",\"path\":" + jesc(f.path) + ",\"uid\":" + jesc(f.uid) + ",\"name\":" + jesc(f.name) + ",\"vendor\":" + jesc(f.vendor) + ",\"version\":" + jesc(f.version) + ",\"kind\":" + jesc(f.kind) + ",\"features\":" + jesc(f.features) + "}"; }
  return str(env, j + "]");
}
// plug_load(fmt, path, uid, sampleRate) -> Promise<JSON {id,name,vendor,instrument,latency,gui,params}>
static napi_value Load(napi_env env, napi_callback_info info) {
  napi_value a[4]; if (getargs(env, info, a, 4) < 4) return nullptr;
  auto I = std::make_shared<Inst>(); I->fmt = args(env, a[0]); I->path = args(env, a[1]); I->uid = args(env, a[2]); I->sr = argd(env, a[3], 48000);
  { std::lock_guard<std::mutex> lk(gIMu); I->id = gNextId++; gInst[I->id] = I; }
  return async(env, [I](std::string& out) {
    Backend* be = nullptr;
    if (!gHostScript.empty() && !getenv("NB_PLUG_INPROC")) { be = newRemote(I->fmt, I->id); I->remote = true; }   // (184) in its own process
    else be = I->fmt == "clap" ? newClap() : I->fmt == "lv2" ? newLv2() : newVst3();
    be->loop = mainLoop();
    Inst* raw = I.get();
    be->onParamFromGui = [raw](uint32_t id, double v) { std::lock_guard<std::mutex> lk(raw->qmu); raw->pq.push_back({ raw->pf.load(), id, v }); notice("param:" + std::to_string(raw->id) + ":" + std::to_string(id) + ":" + jnum(v)); };
    be->onGuiResize = [raw](int w, int h) { if (raw->win) raw->win->resize(w, h); };
    be->onGuiClosed = [raw] { if (raw->be) raw->be->guiClose(); xDrop(raw->win); raw->win = nullptr; raw->guiOpen = false; notice("closed:" + std::to_string(raw->id)); };
    std::string err;
    if (!be->load(I->path, I->uid, I->sr, err)) { delete be; std::lock_guard<std::mutex> lk(gIMu); gInst.erase(I->id); out = err.empty() ? "it wouldn't load" : err; return false; }
    I->be = be; I->instrument = be->isInstrument();
    out = "{\"id\":" + jnum(I->id) + ",\"name\":" + jesc(be->name()) + ",\"vendor\":" + jesc(be->vendor()) + ",\"instrument\":" + (I->instrument ? "true" : "false") +
      ",\"latency\":" + jnum(be->latency()) + ",\"gui\":" + (be->guiCanOpen() ? "true" : "false") + ",\"params\":" + paramsJson(be) + "}";
    return true;
  });
}
// plug_attach(id, hdr Float64Array(8+), in Float32Array(2*cap), out Float32Array(2*cap), cap) -> true when its audio runs
static napi_value Attach(napi_env env, napi_callback_info info) {
  napi_value a[5]; if (getargs(env, info, a, 5) < 5) return boolv(env, false);
  auto I = findInst((int)argd(env, a[0])); if (!I || !I->be || I->run.load()) return boolv(env, false);
  size_t hl = 0, il = 0, ol = 0; double* hdr = (double*)typedData(env, a[1], &hl); float* in = (float*)typedData(env, a[2], &il); float* out = (float*)typedData(env, a[3], &ol);
  const int cap = (int)argd(env, a[4], 8192);
  if (!hdr || !in || !out || hl < 8 || cap < 1024 || il < (size_t)cap * 2 || ol < (size_t)cap * 2) return boolv(env, false);
  I->hdr = hdr; I->inR = in; I->outR = out; I->cap = cap;
  for (int i = 0; i < 3; i++) napi_create_reference(env, a[i + 1], 1, &I->refs[i]);
  hdr[4] = I->instrument ? 1 : 2;
  I->run.store(true); Inst* raw = I.get(); I->th = std::thread([raw] { audioLoop(raw); });
  return boolv(env, true);
}
// plug_midi(id, frame, b0, b1, b2)
static napi_value Midi(napi_env env, napi_callback_info info) {
  napi_value a[5]; if (getargs(env, info, a, 5) < 5) return boolv(env, false);
  auto I = findInst((int)argd(env, a[0])); if (!I || !I->be) return boolv(env, false);
  MidiEv m; m.frame = (int64_t)argd(env, a[1]); m.b[0] = (uint8_t)argd(env, a[2]); m.b[1] = (uint8_t)argd(env, a[3]) & 127; m.b[2] = (uint8_t)argd(env, a[4]) & 127;
  { std::lock_guard<std::mutex> lk(I->qmu); if (I->mq.size() < 4096) I->mq.push_back(m); }
  return boolv(env, true);
}
// plug_flush(id): every queued note and change dropped (Stop)
static napi_value Flush(napi_env env, napi_callback_info info) {
  napi_value a[1]; if (getargs(env, info, a, 1) < 1) return boolv(env, false);
  auto I = findInst((int)argd(env, a[0])); if (!I) return boolv(env, false);
  { std::lock_guard<std::mutex> lk(I->qmu); I->mq.clear(); }
  return boolv(env, true);
}
// plug_param(id, paramId, value, frame): CLAP takes the plain value, VST3 0..1
static napi_value Param(napi_env env, napi_callback_info info) {
  napi_value a[4]; const size_t n = getargs(env, info, a, 4); if (n < 3) return boolv(env, false);
  auto I = findInst((int)argd(env, a[0])); if (!I || !I->be) return boolv(env, false);
  const uint32_t pid = (uint32_t)argd(env, a[1]); const double v = argd(env, a[2]); const int64_t fr = n > 3 ? (int64_t)argd(env, a[3]) : I->pf.load();
  { std::lock_guard<std::mutex> lk(I->qmu); if (I->pq.size() < 4096) I->pq.push_back({ fr, pid, v }); }
  std::weak_ptr<Inst> w = I; mainLoop()->post([w, pid, v] { if (auto x = w.lock()) if (x->be) x->be->setParamMain(pid, v); });
  return boolv(env, true);
}
static napi_value Params(napi_env env, napi_callback_info info) {
  napi_value a[1]; if (getargs(env, info, a, 1) < 1) return nullptr;
  auto I = findInst((int)argd(env, a[0]));
  return async(env, [I](std::string& out) { if (!I || !I->be) { out = "not loaded"; return false; } out = paramsJson(I->be); return true; });
}
static napi_value GetState(napi_env env, napi_callback_info info) {
  napi_value a[1]; if (getargs(env, info, a, 1) < 1) return nullptr;
  auto I = findInst((int)argd(env, a[0]));
  return async(env, [I](std::string& out) { if (!I || !I->be) { out = "not loaded"; return false; } std::vector<uint8_t> d; if (!I->be->getState(d)) { out = ""; return true; } out = b64e(d); return true; });
}
static napi_value SetState(napi_env env, napi_callback_info info) {
  napi_value a[2]; if (getargs(env, info, a, 2) < 2) return nullptr;
  auto I = findInst((int)argd(env, a[0])); const std::string s = args(env, a[1]);
  return async(env, [I, s](std::string& out) { if (!I || !I->be) { out = "not loaded"; return false; } const bool ok = I->be->setState(b64d(s)); out = ok ? "true" : "false"; return true; });
}
// plug_gui(id, open, title, appXid) -> Promise<JSON {open, why}>
static napi_value Gui(napi_env env, napi_callback_info info) {
  napi_value a[4]; const size_t n = getargs(env, info, a, 4); if (n < 2) return nullptr;
  auto I = findInst((int)argd(env, a[0])); bool open = false; napi_get_value_bool(env, a[1], &open);
  const std::string title = n > 2 ? args(env, a[2]) : "Plugin"; const unsigned long parent = n > 3 ? (unsigned long)argd(env, a[3]) : 0;
  return async(env, [I, open, title, parent](std::string& out) {
    if (!I || !I->be) { out = "{\"open\":false,\"why\":\"not loaded\"}"; return true; }
    if (!open) { if (I->guiOpen) { I->be->guiClose(); xDrop(I->win); I->win = nullptr; I->guiOpen = false; } out = "{\"open\":false}"; return true; }
    if (I->guiOpen && I->win) { I->win->show(); out = "{\"open\":true}"; return true; }
    std::string err; if (!xOpen(err)) { out = "{\"open\":false,\"why\":" + jesc(err) + "}"; return true; }
    XWin* w = xMake(title, parent); Inst* raw = I.get();
    w->onClose = [raw] { if (raw->be) raw->be->guiClose(); xDrop(raw->win); raw->win = nullptr; raw->guiOpen = false; notice("closed:" + std::to_string(raw->id)); };
    w->onUserSize = [raw](int ww, int hh) { if (raw->be) raw->be->guiResized(ww, hh); };
    int W = 0, H = 0; bool rs = false;
    if (!I->be->guiOpen(w, W, H, rs, err)) { xDrop(w); out = "{\"open\":false,\"why\":" + jesc(err) + "}"; return true; }
    w->fixed = !rs; w->resize(W, H); w->show(); I->win = w; I->guiOpen = true;
    out = "{\"open\":true,\"w\":" + jnum(W) + ",\"h\":" + jnum(H) + "}"; return true;
  });
}
static napi_value Unload(napi_env env, napi_callback_info info) {
  napi_value a[1]; if (getargs(env, info, a, 1) < 1) return nullptr;
  auto I = findInst((int)argd(env, a[0]));
  if (I) {
    I->dead.store(true);
    if (I->run.load()) { I->run.store(false); if (I->th.joinable()) I->th.join(); }
    for (auto& r : I->refs) if (r) { napi_delete_reference(env, r); r = nullptr; }
    I->hdr = nullptr; I->inR = I->outR = nullptr;
    std::lock_guard<std::mutex> lk(gIMu); gInst.erase(I->id);
  }
  return async(env, [I](std::string& out) {
    if (I && I->be) { if (I->guiOpen) { I->be->guiClose(); xDrop(I->win); I->win = nullptr; } I->be->unload(); delete I->be; I->be = nullptr; }
    out = "true"; return true;
  });
}
static napi_value Transport(napi_env env, napi_callback_info info) {
  napi_value a[2]; const size_t n = getargs(env, info, a, 2); if (n < 1) return boolv(env, false);
  const double b = argd(env, a[0], 120); if (b >= 20 && b <= 400) gBpm.store(b);
  if (n > 1) { bool p = false; napi_get_value_bool(env, a[1], &p); gPlaying.store(p); }
  return boolv(env, true);
}
static napi_value Stats(napi_env env, napi_callback_info info) {
  napi_value a[1]; napi_value o; napi_create_object(env, &o);
  auto set = [&](const char* k, double v) { napi_set_named_property(env, o, k, num(env, v)); };
  if (getargs(env, info, a, 1) < 1) { std::lock_guard<std::mutex> lk(gIMu); set("instances", (double)gInst.size()); return o; }
  auto I = findInst((int)argd(env, a[0])); if (!I) { set("running", 0); return o; }
  set("running", I->run.load() ? 1 : 0); set("blockUs", I->us.load()); set("blockMaxUs", I->maxUs.load()); set("blocks", (double)I->blocks.load()); set("late", (double)I->late.load());
  set("budgetUs", BLOCK / I->sr * 1e6); set("frame", (double)I->pf.load()); I->maxUs.store(0);
  return o;
}
static napi_value Notices(napi_env env, napi_callback_info) {
  std::vector<std::string> v; { std::lock_guard<std::mutex> lk(gNoteMu); v.swap(gNotices); }
  napi_value arr; napi_create_array_with_length(env, v.size(), &arr);
  for (size_t i = 0; i < v.size(); i++) napi_set_element(env, arr, (uint32_t)i, str(env, v[i]));
  return arr;
}

// ---- (184) plugins in a process of their own ----
// Each instance can run in a host process (Electron as plain Node running plughost.js, which calls plug_serve here):
// if the plugin crashes, only that process goes and the page carries on with the plugin silent. Requests (load,
// settings, parameters, its window) go over a socket pair; each 128-frame block goes through shared memory (a memfd),
// handed over and back with futexes, so the round trip costs microseconds, not a frame. The plugin's window is put
// straight into Nate Bloom's X11 window from the host (X11 lets one client put windows in another's).
struct ShmBlock {
  std::atomic<uint32_t> req, done; int32_t n, nme, npe, playing; int64_t frame; double bpm;
  MidiEv me[512]; ParamEv pe[512]; float in[2][BLOCK]; float out[2][BLOCK];
};
static long futexWait(std::atomic<uint32_t>* a, uint32_t v, long ns) { timespec ts{ ns / 1000000000, ns % 1000000000 }; return syscall(SYS_futex, (uint32_t*)a, FUTEX_WAIT, v, &ts, nullptr, 0); }
static void futexWake(std::atomic<uint32_t>* a) { syscall(SYS_futex, (uint32_t*)a, FUTEX_WAKE, 1, nullptr, nullptr, 0); }
// messages: [u32 id][u8 op][payload]; answers [u32 id][u8 ok][payload]; notices from the host have id 0
static bool sendMsg(int fd, uint32_t id, uint8_t op, const std::string& pl) { std::string m(5, '\0'); memcpy(&m[0], &id, 4); m[4] = (char)op; m += pl; return send(fd, m.data(), m.size(), MSG_NOSIGNAL) == (ssize_t)m.size(); }
static bool recvMsg(int fd, uint32_t& id, uint8_t& op, std::string& pl, int timeoutMs) {
  pollfd p{ fd, POLLIN, 0 }; if (poll(&p, 1, timeoutMs) <= 0) return false;
  std::string b(4 << 20, '\0'); const ssize_t n = recv(fd, &b[0], b.size(), 0); if (n < 5) return false;
  memcpy(&id, b.data(), 4); op = (uint8_t)b[4]; pl.assign(b.data() + 5, (size_t)n - 5); return true;
}
enum { OP_LOAD = 1, OP_PARAMS, OP_GETSTATE, OP_SETSTATE, OP_GUIOPEN, OP_GUICLOSE, OP_GUISIZE, OP_PARAMMAIN, OP_UNLOAD };

struct Remote : Backend {
  int sock = -1, shmFd = -1; pid_t pid = -1; ShmBlock* shm = nullptr; std::atomic<bool> dead{false};
  std::string nm, vend; bool inst = true, gui = false; int lat = 0; std::string paramsJ = "[]";
  std::thread reader; std::mutex mu; std::condition_variable cv; std::map<uint32_t, std::pair<bool, std::string>> answers; uint32_t nextId = 1;
  Win* win = nullptr; int instId = 0;
  bool start(std::string& err) {
    int sv[2]; if (socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, sv) != 0) { err = "no socket"; return false; }
    shmFd = memfd_create("nb-plug", MFD_CLOEXEC); if (shmFd < 0 || ftruncate(shmFd, sizeof(ShmBlock)) != 0) { err = "no shared memory"; return false; }
    shm = (ShmBlock*)mmap(nullptr, sizeof(ShmBlock), PROT_READ | PROT_WRITE, MAP_SHARED, shmFd, 0); if (shm == MAP_FAILED) { shm = nullptr; err = "no shared memory"; return false; }
    new (shm) ShmBlock(); shm->req.store(0); shm->done.store(0);
    posix_spawn_file_actions_t fa; posix_spawn_file_actions_init(&fa);
    posix_spawn_file_actions_adddup2(&fa, sv[1], 3); posix_spawn_file_actions_adddup2(&fa, shmFd, 4);
    std::vector<std::string> envs; for (char** e = environ; *e; e++) if (strncmp(*e, "ELECTRON_RUN_AS_NODE=", 21)) envs.push_back(*e);
    envs.push_back("ELECTRON_RUN_AS_NODE=1"); envs.push_back("NB_PLUG_ID=" + std::to_string(instId)); std::vector<char*> ev; for (auto& e : envs) ev.push_back(&e[0]); ev.push_back(nullptr);
    std::string a0 = gExe, a1 = gHostScript; char* argv[] = { &a0[0], &a1[0], nullptr };
    const int r = posix_spawn(&pid, gExe.c_str(), &fa, nullptr, argv, ev.data()); posix_spawn_file_actions_destroy(&fa);
    close(sv[1]); sock = sv[0];
    if (r != 0) { err = "the plugin's process wouldn't start"; return false; }
    reader = std::thread([this] { readLoop(); });
    return true;
  }
  void readLoop() {
    for (;;) {
      uint32_t id; uint8_t op; std::string pl;
      pollfd p{ sock, POLLIN, 0 }; const int pr = poll(&p, 1, 500);
      if (pr < 0) break; if (pr == 0) { if (dead.load()) break; continue; }
      if (!recvMsg(sock, id, op, pl, 0)) { gone(); break; }
      if (id == 0) { onNotice(pl); continue; }
      { std::lock_guard<std::mutex> lk(mu); answers[id] = { op != 0, pl }; } cv.notify_all();
    }
  }
  void gone() {
    if (dead.exchange(true)) return;
    cv.notify_all(); if (shm) futexWake(&shm->done); notice("crashed:" + std::to_string(instId));
    if (loop) loop->post([this] { if (onGuiClosed && win) onGuiClosed(); });
  }
  void onNotice(const std::string& s) {
    if (s.rfind("param ", 0) == 0) { uint32_t id = 0; double v = 0; if (sscanf(s.c_str() + 6, "%u %lf", &id, &v) == 2) notice("param:" + std::to_string(instId) + ":" + std::to_string(id) + ":" + jnum(v)); }
    else if (s.rfind("resize ", 0) == 0) { int w = 0, h = 0; if (sscanf(s.c_str() + 7, "%d %d", &w, &h) == 2 && loop) loop->post([this, w, h] { if (onGuiResize) onGuiResize(w, h); }); }
    else if (s == "closed" && loop) loop->post([this] { if (onGuiClosed) onGuiClosed(); });
  }
  bool call(uint8_t op, const std::string& pl, std::string& out, int timeoutMs) {
    if (dead.load() || sock < 0) { out = "its process has stopped"; return false; }
    uint32_t id; { std::lock_guard<std::mutex> lk(mu); id = nextId++; }
    if (!sendMsg(sock, id, op, pl)) { gone(); out = "its process has stopped"; return false; }
    std::unique_lock<std::mutex> lk(mu);
    if (!cv.wait_for(lk, std::chrono::milliseconds(timeoutMs), [&] { return answers.count(id) || dead.load(); })) { out = "it stopped answering"; return false; }
    if (!answers.count(id)) { out = "its process has stopped"; return false; }
    auto a = answers[id]; answers.erase(id); out = a.second; return a.first;
  }
  static std::string field(const std::string& j, const char* k) {   // (a flat value out of our own small JSON)
    const std::string key = std::string("\"") + k + "\":"; size_t i = j.find(key); if (i == std::string::npos) return ""; i += key.size();
    if (j[i] == '"') { std::string o; for (size_t q = i + 1; q < j.size() && j[q] != '"'; q++) { if (j[q] == '\\' && q + 1 < j.size()) q++; o += j[q]; } return o; }
    if (j[i] == '[') { int d = 0; size_t q = i; for (; q < j.size(); q++) { if (j[q] == '[') d++; else if (j[q] == ']' && --d == 0) break; } return j.substr(i, q - i + 1); }
    size_t q = i; while (q < j.size() && j[q] != ',' && j[q] != '}') q++; return j.substr(i, q - i);
  }
  bool load(const std::string& path, const std::string& uid, double sr, std::string& err) override {
    if (!start(err)) return false;
    std::string out; if (!call(OP_LOAD, fmt + '\0' + path + '\0' + uid + '\0' + jnum(sr), out, 30000)) { err = out; return false; }
    nm = field(out, "name"); vend = field(out, "vendor"); inst = field(out, "instrument") == "true"; gui = field(out, "gui") == "true"; lat = atoi(field(out, "latency").c_str()); paramsJ = field(out, "params");
    return true;
  }
  std::string fmt;
  std::string name() override { return nm; }
  std::string vendor() override { return vend; }
  bool isInstrument() override { return inst; }
  int latency() override { return lat; }
  std::vector<ParamInfo> params() override { return {}; }   // (paramsJson asks remoteParams instead)
  std::string paramsJsonRemote() override { std::string out; if (call(OP_PARAMS, "", out, 5000)) paramsJ = out; return paramsJ.empty() ? "[]" : paramsJ; }
  bool getState(std::vector<uint8_t>& o) override { std::string out; if (!call(OP_GETSTATE, "", out, 10000)) return false; o.assign(out.begin(), out.end()); return !o.empty(); }
  bool setState(const std::vector<uint8_t>& in) override { std::string out; return call(OP_SETSTATE, std::string(in.begin(), in.end()), out, 10000) && out == "true"; }
  void setParamMain(uint32_t id, double v) override { std::string out; call(OP_PARAMMAIN, std::to_string(id) + " " + jnum(v), out, 2000); }
  bool guiCanOpen() override { return gui; }
  bool guiOpen(Win* w, int& wo, int& ho, bool& rs, std::string& err) override {
    win = w; std::string out;
    if (!call(OP_GUIOPEN, std::to_string(w->xid()), out, 15000)) { err = out; return false; }
    wo = atoi(field(out, "w").c_str()); ho = atoi(field(out, "h").c_str()); rs = field(out, "resizable") == "true"; return true;
  }
  void guiResized(int w, int h) override { std::string out; call(OP_GUISIZE, std::to_string(w) + " " + std::to_string(h), out, 2000); }
  void guiClose() override { std::string out; call(OP_GUICLOSE, "", out, 5000); win = nullptr; }
  void unload() override {
    std::string out; call(OP_UNLOAD, "", out, 5000);
    dead.store(true); if (sock >= 0) { shutdown(sock, SHUT_RDWR); }
    if (reader.joinable()) reader.join();
    if (sock >= 0) close(sock); sock = -1;
    if (pid > 0) { int st; for (int i = 0; i < 20 && waitpid(pid, &st, WNOHANG) == 0; i++) usleep(50000); if (waitpid(pid, &st, WNOHANG) == 0) { kill(pid, SIGKILL); waitpid(pid, &st, 0); } pid = -1; }
    if (shm) { munmap(shm, sizeof(ShmBlock)); shm = nullptr; } if (shmFd >= 0) close(shmFd); shmFd = -1;
  }
  void startAudio() override {}
  void stopAudio() override {}
  int lateBlocks = 0;
  void process(const float* inL, const float* inR, float* outL, float* outR, int n, int64_t frame, const MidiEv* me, int nme, const ParamEv* pe, int npe, double bpm, bool playing) override {
    if (dead.load() || !shm) { memset(outL, 0, n * 4); memset(outR, 0, n * 4); return; }
    const uint32_t want = shm->done.load(std::memory_order_acquire) + 1;
    shm->n = n; shm->frame = frame; shm->bpm = bpm; shm->playing = playing ? 1 : 0;
    shm->nme = std::min(nme, 512); memcpy(shm->me, me, sizeof(MidiEv) * shm->nme); shm->npe = std::min(npe, 512); memcpy(shm->pe, pe, sizeof(ParamEv) * shm->npe);
    memcpy(shm->in[0], inL, n * 4); memcpy(shm->in[1], inR, n * 4);
    shm->req.store(want, std::memory_order_release); futexWake(&shm->req);
    // wait for it: this thread works ahead of where the page reads (the room ahead), so a slow answer is caught up
    // on; one that takes more than 40 ms gives silence for that block (and if the process has gone, so does the rest)
    timespec t0; clock_gettime(CLOCK_MONOTONIC, &t0);
    for (;;) {
      const uint32_t d = shm->done.load(std::memory_order_acquire); if (d == want) break;
      if (dead.load()) { memset(outL, 0, n * 4); memset(outR, 0, n * 4); return; }
      timespec t1; clock_gettime(CLOCK_MONOTONIC, &t1); const long el = (t1.tv_sec - t0.tv_sec) * 1000000000L + (t1.tv_nsec - t0.tv_nsec);
      if (el > 40000000L) { lateBlocks++; memset(outL, 0, n * 4); memset(outR, 0, n * 4); if (pid > 0) { int st; if (waitpid(pid, &st, WNOHANG) == pid) { pid = -1; gone(); } } return; }
      futexWait(&shm->done, d, 40000000L - el);
    }
    memcpy(outL, shm->out[0], n * 4); memcpy(outR, shm->out[1], n * 4);
  }
};

static Backend* newRemote(const std::string& fmt, int id) { Remote* r = new Remote(); r->fmt = fmt; r->instId = id; return r; }
// the host process: plug_serve(socketFd, shmFd) runs until Nate Bloom closes the socket
struct HostWin : Win { unsigned long id = 0; int sock = -1; unsigned long xid() override { return id; } void resize(int w, int h) override { sendMsg(sock, 0, 1, "resize " + std::to_string(w) + " " + std::to_string(h)); } void show() override {} };
static napi_value Serve(napi_env env, napi_callback_info info) {
  napi_value a[2]; if (getargs(env, info, a, 2) < 2) return boolv(env, false);
  const int sock = (int)argd(env, a[0], 3), shmFd = (int)argd(env, a[1], 4);
  ShmBlock* shm = (ShmBlock*)mmap(nullptr, sizeof(ShmBlock), PROT_READ | PROT_WRITE, MAP_SHARED, shmFd, 0); if (shm == MAP_FAILED) return boolv(env, false);
  Main* M = mainLoop(); Backend* be = nullptr; std::atomic<bool> run{true}; std::thread audio; HostWin hw; hw.sock = sock;
  std::mutex pmu; std::vector<ParamEv> fromGui;
  auto audioFn = [&] {
    { char nm[16]; snprintf(nm, sizeof nm, "nb-ph-%s", getenv("NB_PLUG_ID") ? getenv("NB_PLUG_ID") : "0"); pthread_setname_np(pthread_self(), nm); } tlAudio = true;   // (the CPU meter's name for it)
    { sched_param sp; sp.sched_priority = 18; pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp); }
    be->startAudio(); uint32_t seen = shm->done.load(); std::vector<ParamEv> pe;
    while (run.load()) {
      const uint32_t r = shm->req.load(std::memory_order_acquire);
      if (r == seen) { futexWait(&shm->req, r, 200000000L); continue; }
      pe.assign(shm->pe, shm->pe + shm->npe); { std::lock_guard<std::mutex> lk(pmu); for (auto& p : fromGui) pe.push_back({ shm->frame, p.id, p.value }); fromGui.clear(); }
      be->process(shm->in[0], shm->in[1], shm->out[0], shm->out[1], shm->n, shm->frame, shm->me, shm->nme, pe.data(), (int)pe.size(), shm->bpm, shm->playing != 0);
      seen = r; shm->done.store(r, std::memory_order_release); futexWake(&shm->done);
    }
    be->stopAudio();
  };
  for (;;) {
    uint32_t id; uint8_t op; std::string pl;
    if (!recvMsg(sock, id, op, pl, -1)) break;
    std::string out; bool ok = false;
    std::mutex m; std::condition_variable cv; bool done = false;
    M->post([&] {
      if (op == OP_LOAD) {
        std::vector<std::string> f; size_t st = 0; for (int k = 0; k < 4; k++) { size_t e = pl.find('\0', st); f.push_back(pl.substr(st, e == std::string::npos ? std::string::npos : e - st)); st = e == std::string::npos ? pl.size() : e + 1; }
        be = f[0] == "clap" ? newClap() : f[0] == "lv2" ? newLv2() : newVst3(); be->loop = M;
        be->onParamFromGui = [&](uint32_t pid, double v) { { std::lock_guard<std::mutex> lk(pmu); fromGui.push_back({ 0, pid, v }); } sendMsg(sock, 0, 1, "param " + std::to_string(pid) + " " + jnum(v)); };
        be->onGuiResize = [&](int w, int h) { hw.resize(w, h); };
        be->onGuiClosed = [&] { sendMsg(sock, 0, 1, "closed"); };
        std::string err;
        if (!be->load(f[1], f[2], atof(f[3].c_str()), err)) { out = err; delete be; be = nullptr; }
        else { ok = true; out = "{\"name\":" + jesc(be->name()) + ",\"vendor\":" + jesc(be->vendor()) + ",\"instrument\":" + (be->isInstrument() ? "true" : "false") + ",\"latency\":" + jnum(be->latency()) + ",\"gui\":" + (be->guiCanOpen() ? "true" : "false") + ",\"params\":" + paramsJson(be) + "}";
          audio = std::thread(audioFn); }
      } else if (!be) { out = "not loaded"; }
      else if (op == OP_PARAMS) { ok = true; out = paramsJson(be); }
      else if (op == OP_GETSTATE) { std::vector<uint8_t> d; ok = be->getState(d); out.assign(d.begin(), d.end()); ok = true; }
      else if (op == OP_SETSTATE) { ok = true; out = be->setState(std::vector<uint8_t>(pl.begin(), pl.end())) ? "true" : "false"; }
      else if (op == OP_PARAMMAIN) { uint32_t pid = 0; double v = 0; if (sscanf(pl.c_str(), "%u %lf", &pid, &v) == 2) be->setParamMain(pid, v); ok = true; }
      else if (op == OP_GUIOPEN) { hw.id = strtoul(pl.c_str(), nullptr, 10); int W = 0, H = 0; bool rs = false; std::string err;
        if (be->guiOpen(&hw, W, H, rs, err)) { ok = true; out = "{\"w\":" + jnum(W) + ",\"h\":" + jnum(H) + ",\"resizable\":" + (rs ? "true" : "false") + "}"; } else out = err; }
      else if (op == OP_GUISIZE) { int w = 0, h = 0; if (sscanf(pl.c_str(), "%d %d", &w, &h) == 2) be->guiResized(w, h); ok = true; }
      else if (op == OP_GUICLOSE) { be->guiClose(); ok = true; }
      else if (op == OP_UNLOAD) { run.store(false); futexWake(&shm->req); if (audio.joinable()) audio.join(); be->unload(); delete be; be = nullptr; ok = true; }
      std::lock_guard<std::mutex> lk(m); done = true; cv.notify_all();
    });
    { std::unique_lock<std::mutex> lk(m); cv.wait(lk, [&] { return done; }); }
    sendMsg(sock, id, ok ? 1 : 0, out);
    if (op == OP_UNLOAD) break;
  }
  run.store(false); futexWake(&shm->req); if (audio.joinable()) audio.join();
  _exit(0);   // (the plugin's own threads and atexit handlers don't get a say)
  return boolv(env, true);
}
// plug_config({ hostScript }): where plughost.js is; plugins then load in a process of their own
static napi_value Config(napi_env env, napi_callback_info info) {
  napi_value a[1]; if (getargs(env, info, a, 1) < 1) return boolv(env, false);
  gHostScript = args(env, a[0]);
  char buf[4096]; const ssize_t n = readlink("/proc/self/exe", buf, sizeof buf - 1); if (n > 0) { buf[n] = 0; gExe = buf; }
  return boolv(env, !gHostScript.empty() && !gExe.empty() && access(gHostScript.c_str(), R_OK) == 0);
}

// the page going away (a reload, closing): every instance stops (its shared memory goes with the page) and is unloaded
static void cleanupAll(void*) {
  std::vector<std::shared_ptr<Inst>> all; { std::lock_guard<std::mutex> lk(gIMu); for (auto& x : gInst) all.push_back(x.second); gInst.clear(); }
  for (auto& I : all) { I->dead.store(true); if (I->run.load()) { I->run.store(false); if (I->th.joinable()) I->th.join(); } I->hdr = nullptr; I->inR = I->outR = nullptr; for (auto& r : I->refs) r = nullptr; }
  if (gMain) {
    std::mutex m; std::condition_variable cv; bool done = false;
    gMain->post([&] { for (auto& I : all) if (I->be) { if (I->guiOpen) { I->be->guiClose(); xDrop(I->win); I->win = nullptr; I->guiOpen = false; } I->be->unload(); delete I->be; I->be = nullptr; }
      std::lock_guard<std::mutex> lk(m); done = true; cv.notify_all(); });
    std::unique_lock<std::mutex> lk(m); cv.wait_for(lk, std::chrono::seconds(5), [&] { return done; });
  }
  gTs = nullptr; gTsBusy = 0;
}

static napi_value Init(napi_env env, napi_value exports) {
  const napi_property_descriptor d[] = {
    { "plug_scan", nullptr, Scan, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_load", nullptr, Load, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_attach", nullptr, Attach, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_midi", nullptr, Midi, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_flush", nullptr, Flush, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_param", nullptr, Param, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_params", nullptr, Params, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_get_state", nullptr, GetState, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_set_state", nullptr, SetState, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_gui", nullptr, Gui, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_unload", nullptr, Unload, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_transport", nullptr, Transport, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_stats", nullptr, Stats, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_notices", nullptr, Notices, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_serve", nullptr, Serve, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "plug_config", nullptr, Config, nullptr, nullptr, nullptr, napi_default, nullptr },
  };
  napi_define_properties(env, exports, sizeof(d) / sizeof(d[0]), d);
  napi_add_env_cleanup_hook(env, cleanupAll, nullptr);
  return exports;
}

}  // namespace nbplug

NAPI_MODULE(NODE_GYP_MODULE_NAME, nbplug::Init)
