// Nate Bloom Bridge: the shared memory between the Nate Bloom app and its bridge plugin in Bitwig (or any CLAP host),
// /dev/shm/nate-bloom-bridge. The app makes it and keeps it alive (a heartbeat); each plugin instance claims a slot.
// Time in a slot is the plugin's own frame count ("P"), from the moment it claimed the slot:
//  - MIDI goes plugin → app stamped with P (the frame in the plugin's block it belongs to);
//  - the app writes its sound into the out ring at P-indexes: the sound for an event stamped P sits at index P;
//  - the plugin reads index (P - latency) at P and reports that latency, so the host lines it up exactly;
//  - the host's audio into the plugin goes the other way, written at P.
#pragma once
#include <atomic>
#include <cstdint>

namespace nbbr {
static const uint32_t MAGIC = 0x5242424eu;   // "NBBR"
static const uint32_t VERSION = 1;
static const int NSLOT = 16;
static const int RING = 16384;               // frames per ring (a power of two)
static const int NMIDI = 1024;               // MIDI events per slot ring
static const char* const SHM_NAME = "/nate-bloom-bridge";

struct MidiEv { int64_t frame; uint8_t b[4]; uint32_t pad; };

struct Slot {
  std::atomic<uint32_t> state;      // 0 free, 1 a plugin has it
  std::atomic<uint32_t> gen;        // +1 at every claim (the app starts its side over)
  char name[64];                    // the host's track name, or "Bridge N"
  std::atomic<uint32_t> nameGen;    // +1 when the name changes
  uint32_t sr;                      // the plugin's sample rate
  uint32_t latency;                 // frames the plugin reports (and reads behind)
  uint32_t hasIn;                   // 1 when the host feeds the plugin's audio input
  std::atomic<int64_t> now;         // P at the start of the plugin's current block
  std::atomic<int64_t> readPos;     // P the plugin has read up to (out ring)
  std::atomic<int64_t> writePos;    // P the app has written up to (out ring)
  std::atomic<int64_t> inWrite;     // P the plugin has written up to (in ring)
  std::atomic<uint64_t> beat;       // +1 every block the plugin processes
  std::atomic<uint64_t> under;      // frames the plugin found missing
  double bpm, songBeats; uint32_t playing, pad0;
  std::atomic<uint32_t> mHead, mTail;   // MIDI ring: the plugin writes at head, the app reads from tail
  MidiEv mev[NMIDI];
  float out[2][RING];
  float in[2][RING];
};

struct Shm {
  uint32_t magic, version;
  std::atomic<uint64_t> appBeat;    // +1 every ~5 ms while the app is running
  uint32_t appSr, nslot;
  uint32_t appPid, pad;
  Slot slot[NSLOT];
};
}  // namespace nbbr
