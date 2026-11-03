// (177) Nate Bloom's VST3 and CLAP host: what the two formats share (nb_plug.cc holds the rest).
//
// Threads: every call into a plugin other than processing happens on one "plugin main" thread (nb_plug.cc runs it:
// loading, settings, parameters, its window, its timers and file handles). Each plugin instance processes on its own
// audio thread, a block of 128 frames at a time, from and into shared memory the page's AudioWorklet reads and writes.
#pragma once
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace nbplug {

static const int BLOCK = 128;

struct MidiEv { int64_t frame; uint8_t b[3]; };
struct ParamEv { int64_t frame; uint32_t id; double value; };   // CLAP: the plain value; VST3: 0..1

struct ParamInfo { uint32_t id; std::string name; double min, max, def, value; int steps; bool automatable; };

struct Found { std::string fmt, path, uid, name, vendor, version, kind, features; };   // kind: "instrument" or "effect"

// the plugin main thread's services (nb_plug.cc), for the formats' run-loop and timer needs
struct MainLoop {
  virtual ~MainLoop() {}
  virtual int addTimer(int ms, std::function<void()> fn) = 0;   // returns an id
  virtual void removeTimer(int id) = 0;
  virtual int addFd(int fd, std::function<void(int)> fn) = 0;    // fn(fd) when readable
  virtual void removeFd(int fd) = 0;
  virtual void post(std::function<void()> fn) = 0;               // later, on the main thread
  virtual bool onMain() = 0;
};

// a plugin window's host side: the X11 window it's put in
struct Win {
  virtual ~Win() {}
  virtual unsigned long xid() = 0;
  virtual void resize(int w, int h) = 0;
  virtual void show() = 0;
};

struct Backend {
  virtual ~Backend() {}
  // main thread
  virtual bool load(const std::string& path, const std::string& uid, double sr, std::string& err) = 0;
  virtual std::string name() = 0;
  virtual std::string vendor() = 0;
  virtual bool isInstrument() = 0;
  virtual int latency() = 0;
  virtual std::vector<ParamInfo> params() = 0;
  virtual bool getState(std::vector<uint8_t>& out) = 0;
  virtual bool setState(const std::vector<uint8_t>& in) = 0;
  virtual std::string paramsJsonRemote() { return ""; }   // (184) a plugin in its own process answers this instead of params()
  virtual void setParamMain(uint32_t id, double v) {}   // tell the editor side (VST3) after a change from Nate Bloom
  virtual bool guiCanOpen() = 0;
  virtual bool guiOpen(Win* w, int& wOut, int& hOut, bool& resizable, std::string& err) = 0;   // into w
  virtual void guiResized(int w, int h) {}   // the user resized our window
  virtual void guiClose() = 0;
  virtual void unload() = 0;
  // audio thread
  virtual void startAudio() = 0;
  virtual void process(const float* inL, const float* inR, float* outL, float* outR, int n, int64_t frame,
                       const MidiEv* ev, int nev, const ParamEv* pe, int npe, double bpm, bool playing) = 0;
  virtual void stopAudio() = 0;
  // the instance's hooks back (set by nb_plug.cc before load)
  MainLoop* loop = nullptr;
  std::function<void(uint32_t, double)> onParamFromGui;   // a change made in the plugin's own window (to the audio side)
  std::function<void(int, int)> onGuiResize;              // the plugin asks for a new size
  std::function<void()> onGuiClosed;                      // the plugin closed its own window
  std::function<void()> onRestart;                        // the plugin asks to be restarted (deactivate, activate)
};

Backend* newClap();
Backend* newVst3();
Backend* newLv2();   // (182)
bool scanClap(const std::string& path, std::vector<Found>& out, std::string& err);
bool scanVst3(const std::string& path, std::vector<Found>& out, std::string& err);
bool scanLv2(const std::string& path, std::vector<Found>& out, std::string& err);

}  // namespace nbplug
