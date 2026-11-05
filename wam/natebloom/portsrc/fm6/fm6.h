// fm6.h (build 229): a 6-operator FM voice for Nate Bloom's own instruments (Nebula 80's bells and tine piano,
// Hypnagogia's glassy FM), on Dexed's DX7 engine (Pascal Gauthier, GPL-3) and Google's msfa core (Apache-2.0), with
// four of Pop 89's patches in the DX7's own voice format. One Fm6 per voice: init on a note, keyup on release, next()
// gives one sample (the core renders 64 at a time).
#pragma once
#include <stdint.h>
#include <math.h>
#include <stdlib.h>
#include "synth.h"
#include "dx7note.h"
#include "lfo.h"
#include "exp2.h"
#include "sin.h"
#include "freqlut.h"
#include "env.h"
#include "pitchenv.h"
#include "controllers.h"
#include "EngineMkI.h"
namespace fm6 {
struct Op { uint8_t r[4], l[4], bp, ld, rd, lc, rc, rs, ams, kvs, ol, mode, fc, ff, det; };
struct Patch { const char *name; Op op[6]; uint8_t pr[4], pl[4], alg, fb, oks, lfs, lfd, lpmd, lamd, lfks, lfw, lpms; };
#define ENV(a,b,c,d) {a,b,c,d}
enum { TINE = 0, EPIANO = 1, GLASS = 2, TUBULAR = 3 };
static const Patch FM6_PATCHES[] = {
  { "Tine Piano", {
    { ENV(97,30,24,62), ENV(99,78,0,0),  44,0,24,0,0, 3, 0, 2, 99, 0, 1, 0, 9 },
    { ENV(97,55,38,75), ENV(99,70,0,0),  44,0,0,0,0, 4, 0, 7, 71, 0, 14, 0, 7 },
    { ENV(96,22,22,50), ENV(99,92,0,0),  44,0,0,0,0, 3, 0, 2, 99, 0, 1, 0, 5 },
    { ENV(96,32,22,50), ENV(99,90,0,0),  44,0,0,0,0, 3, 0, 6, 88, 0, 1, 0, 7 },
    { ENV(96,22,22,50), ENV(99,92,0,0),  44,0,0,0,0, 3, 0, 1, 90, 0, 1, 0, 2 },
    { ENV(96,34,22,50), ENV(99,90,0,0),  44,0,0,0,0, 3, 0, 6, 80, 0, 3, 0, 12 } },
    {99,99,99,99}, {50,50,50,50}, 5, 6, 1, 34, 33, 0, 0, 0, 4, 3 },
  { "E. Piano", {
    { ENV(96,25,25,67), ENV(99,75,0,0),  41,0,19,0,0, 3, 0, 2, 99, 0, 1, 0, 10 },
    { ENV(95,50,35,78), ENV(99,75,0,0),  41,0,0,0,0, 3, 0, 7, 58, 0, 14, 0, 7 },     // the tine: ratio 14
    { ENV(95,20,20,50), ENV(99,95,0,0),  41,0,0,0,0, 3, 0, 2, 99, 0, 1, 0, 4 },
    { ENV(95,29,20,50), ENV(99,95,0,0),  41,0,0,0,0, 3, 0, 6, 86, 0, 1, 0, 7 },
    { ENV(95,20,20,50), ENV(99,95,0,0),  41,0,0,0,0, 3, 0, 0, 92, 0, 1, 0, 3 },
    { ENV(95,29,20,50), ENV(99,95,0,0),  41,0,0,0,0, 3, 0, 6, 76, 0, 1, 0, 11 } },
    {99,99,99,99}, {50,50,50,50}, 5, 6, 1, 34, 33, 0, 0, 0, 4, 3 },
  { "Glass Bells", {
    { ENV(99,24,18,30), ENV(99,70,0,0),  39,0,0,0,0, 2, 0, 2, 99, 0, 1, 0, 7 },
    { ENV(99,32,20,30), ENV(99,60,0,0),  39,0,0,0,0, 2, 0, 5, 80, 0, 3, 50, 7 },  // 3.5
    { ENV(99,22,16,30), ENV(99,70,0,0),  39,0,0,0,0, 2, 0, 2, 92, 0, 2, 0, 9 },
    { ENV(99,30,20,30), ENV(99,60,0,0),  39,0,0,0,0, 2, 0, 5, 76, 0, 7, 0, 7 },
    { ENV(99,20,15,30), ENV(99,72,0,0),  39,0,0,0,0, 2, 0, 1, 86, 0, 1, 0, 4 },
    { ENV(99,40,25,30), ENV(99,50,0,0),  39,0,0,0,0, 2, 0, 6, 70, 0, 4, 20, 7 } },
    {99,99,99,99}, {50,50,50,50}, 5, 3, 1, 30, 0, 0, 0, 0, 4, 2 },
  { "Tubular Bells", {
    { ENV(99,18,14,26), ENV(99,60,0,0),  39,0,0,0,0, 1, 0, 2, 99, 0, 1, 0, 7 },
    { ENV(99,22,16,26), ENV(99,56,0,0),  39,0,0,0,0, 1, 0, 4, 78, 0, 3, 50, 7 },
    { ENV(99,16,12,26), ENV(99,62,0,0),  39,0,0,0,0, 1, 0, 2, 90, 0, 2, 0, 8 },
    { ENV(99,24,16,26), ENV(99,50,0,0),  39,0,0,0,0, 1, 0, 4, 74, 0, 5, 40, 7 },
    { ENV(99,15,12,26), ENV(99,66,0,0),  39,0,0,0,0, 1, 0, 1, 88, 0, 0, 0, 6 },
    { ENV(99,30,20,26), ENV(99,45,0,0),  39,0,0,0,0, 1, 0, 5, 70, 0, 1, 41, 7 } },
    {99,99,99,99}, {50,50,50,50}, 5, 2, 1, 30, 0, 0, 0, 0, 4, 2 },
};
#undef ENV
static void fm6Data(int pi, float bright, float decay, float velsens, uint8_t *v) {
  const Patch &p = FM6_PATCHES[pi];
  int alg = p.alg - 1;
  int dB = (int)lroundf((bright - 0.6f) * 30.0f);                   // modulators: −18…+12 output level
  int dR = (int)lroundf(-14.0f * log2f(decay > 0.05f ? decay : 0.05f));   // ×2 decay ≈ 14 rate steps slower
  for (int i = 0; i < 6; i++) {
    const Op &o = p.op[i]; uint8_t *d = v + (5 - i) * 21;     // the DX7 stores OP6 first
    bool car = FmCore::isCarrier(alg, 5 - i);
    for (int k = 0; k < 4; k++) d[k] = o.r[k];
    if (car) for (int k = 1; k < 3; k++) { int r = o.r[k] + dR; d[k] = (uint8_t)(r < 1 ? 1 : r > 99 ? 99 : r); }
    if (car) { int r = o.r[3] + dR / 2; d[3] = (uint8_t)(r < 1 ? 1 : r > 99 ? 99 : r); }
    for (int k = 0; k < 4; k++) d[4 + k] = o.l[k];
    d[8] = o.bp; d[9] = o.ld; d[10] = o.rd; d[11] = o.lc; d[12] = o.rc; d[13] = o.rs; d[14] = o.ams;
    d[15] = (uint8_t)lroundf(o.kvs * velsens / 0.7f > 7 ? 7 : o.kvs * velsens / 0.7f);
    int ol = o.ol + (car ? 0 : dB); d[16] = (uint8_t)(ol < 0 ? 0 : ol > 99 ? 99 : ol);
    d[17] = o.mode; d[18] = o.fc; d[19] = o.ff; d[20] = o.det;
  }
  for (int k = 0; k < 4; k++) { v[126 + k] = p.pr[k]; v[130 + k] = p.pl[k]; }
  v[134] = (uint8_t)alg; v[135] = p.fb; v[136] = p.oks; v[137] = p.lfs; v[138] = p.lfd; v[139] = p.lpmd; v[140] = p.lamd;
  v[141] = p.lfks; v[142] = p.lfw; v[143] = p.lpms; v[144] = 24;
  for (int k = 0; k < 10; k++) v[145 + k] = ' ';
  v[155] = 0x3f;
}


static TuningState TUNING; static EngineMkI ENGINE; static Controllers CTRL; static bool ready = false;
static void setup(float sr) {
  Exp2::init(); Tanh::init(); Sin::init(); Freqlut::init(sr); Lfo::init(sr); PitchEnv::init(sr); Env::init_sr(sr);
  CTRL.pitch_cc = 0x2000; CTRL.pitch_range_up = 2; CTRL.pitch_range_dn = 2; CTRL.pitch_step = 0; CTRL.masterTune = 0;
  CTRL.modwheel_cc = 0; CTRL.foot_cc = 0; CTRL.breath_cc = 0; CTRL.aftertouch_cc = 0;
  CTRL.portamento_enable_cc = false; CTRL.portamento_cc = 0; CTRL.portamento_gliss_cc = false; CTRL.mpeEnabled = false;
  CTRL.wheel.range = 99; CTRL.wheel.pitch = true; CTRL.at.range = 50; CTRL.at.amp = true;
  CTRL.core = &ENGINE; CTRL.refresh(); ready = true;
}
struct Fm6 {
  Dx7Note *n = nullptr; int32_t buf[N]; float out[N]; int pos = N; bool live = false;
  void start(int patch, int note, int vel, float bright, float decay, float velsens) {
    if (!n) n = new Dx7Note(&TUNING, nullptr);
    uint8_t d[156]; fm6Data(patch, bright, decay, velsens, d);
    n->init(d, note, vel, 1, &CTRL); live = true; pos = N;
  }
  void keyup() { if (live) n->keyup(); }
  float next() {
    if (!live) return 0.0f;
    if (pos >= N) {
      for (int j = 0; j < N; j++) buf[j] = 0;
      n->compute(buf, 0, 0, &CTRL);
      for (int j = 0; j < N; j++) { int32_t v = buf[j] >> 4; int c = v < -(1 << 24) ? -0x8000 : v >= (1 << 24) ? 0x7fff : v >> 9; out[j] = (float)c / 32768.0f; }
      pos = 0;
    }
    return out[pos++];
  }
  bool playing() const { return live && n && n->isPlaying(); }
};
}
