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
  XWin* win = nullptr; bool guiOpen = false;
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
    timespec ts{ 0, 400000 }; nanosleep(&ts, nullptr);
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

// plug_scan(fmt, path) -> JSON [{fmt,path,uid,name,vendor,version,kind,features}] or {"error":...}  (the scanner process)
static napi_value Scan(napi_env env, napi_callback_info info) {
  napi_value a[2]; if (getargs(env, info, a, 2) < 2) return str(env, "{\"error\":\"args\"}");
  const std::string fmt = args(env, a[0]), path = args(env, a[1]);
  std::vector<Found> out; std::string err; const bool ok = fmt == "clap" ? scanClap(path, out, err) : scanVst3(path, out, err);
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
    Backend* be = I->fmt == "clap" ? newClap() : newVst3();
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
  };
  napi_define_properties(env, exports, sizeof(d) / sizeof(d[0]), d);
  napi_add_env_cleanup_hook(env, cleanupAll, nullptr);
  return exports;
}

}  // namespace nbplug

NAPI_MODULE(NODE_GYP_MODULE_NAME, nbplug::Init)
