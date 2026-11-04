// Pop 89 (build 210): a real 6-operator FM voice. The engine is Dexed's (Pascal Gauthier, GPL-3) DX7 Mark I
// engine on Google's msfa core (Apache-2.0): all 32 algorithms, the DX7's envelopes, keyboard scaling, feedback
// and LFO. The sounds are new patches written for Pop 89, in the DX7's own voice format. The controls are the old
// Pop 89's (same ids, same order), so projects that used it still load; Sound now has sixteen patches.
#include "nbrs.h"
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

enum { MODE, BRIGHT, DECAY, VELSENS, CHORUS, VOLUME, VIBRATO, NPARAM };
static float P[NPARAM] = {0, 0.6f, 1.0f, 0.7f, 0.4f, 0.7f, 0.0f};

// ---------- the patches ----------
// One operator: rates R1-R4, levels L1-L4, break point, left/right depth, left/right curve, rate scaling,
// amp-mod sens, velocity sens, output level, mode (0 ratio / 1 fixed), coarse, fine, detune (7 = centre).
struct Op { uint8_t r[4], l[4], bp, ld, rd, lc, rc, rs, ams, kvs, ol, mode, fc, ff, det; };
struct Patch { const char *name; Op op[6] /* OP1..OP6 */; uint8_t pr[4], pl[4], alg /* 1-32 */, fb, oks, lfs, lfd, lpmd, lamd, lfks, lfw, lpms; };
#define ENV(a,b,c,d) {a,b,c,d}
static const Patch PATCHES[] = {
  { "Slap Bass", {
    { ENV(99,45,30,72), ENV(99,82,60,0), 39,0,0,0,0, 2, 0, 3, 99, 0, 1, 0, 7 },     // OP1 carrier, 1
    { ENV(99,62,40,72), ENV(99,62,40,0), 39,0,0,0,0, 2, 0, 5, 82, 0, 1, 0, 7 },     // OP2 → OP1
    { ENV(99,58,32,72), ENV(99,70,0,0),  39,0,0,0,0, 2, 0, 3, 84, 0, 1, 0, 8 },     // OP3 carrier, 1
    { ENV(99,78,48,72), ENV(99,45,0,0),  39,0,0,0,0, 2, 0, 7, 84, 0, 3, 0, 7 },     // OP4 slap, 3
    { ENV(99,82,52,72), ENV(99,30,0,0),  39,0,0,0,0, 2, 0, 7, 72, 0, 5, 0, 7 },
    { ENV(99,86,55,72), ENV(99,20,0,0),  39,0,0,0,0, 2, 0, 7, 62, 0, 7, 0, 7 } },
    {99,99,99,99}, {50,50,50,50}, 1, 5, 1, 35, 0, 0, 0, 1, 0, 3 },
  { "E. Piano", {
    { ENV(96,25,25,67), ENV(99,75,0,0),  41,0,19,0,0, 3, 0, 2, 99, 0, 1, 0, 10 },
    { ENV(95,50,35,78), ENV(99,75,0,0),  41,0,0,0,0, 3, 0, 7, 58, 0, 14, 0, 7 },     // the tine: ratio 14
    { ENV(95,20,20,50), ENV(99,95,0,0),  41,0,0,0,0, 3, 0, 2, 99, 0, 1, 0, 4 },
    { ENV(95,29,20,50), ENV(99,95,0,0),  41,0,0,0,0, 3, 0, 6, 86, 0, 1, 0, 7 },
    { ENV(95,20,20,50), ENV(99,95,0,0),  41,0,0,0,0, 3, 0, 0, 92, 0, 1, 0, 3 },
    { ENV(95,29,20,50), ENV(99,95,0,0),  41,0,0,0,0, 3, 0, 6, 76, 0, 1, 0, 11 } },
    {99,99,99,99}, {50,50,50,50}, 5, 6, 1, 34, 33, 0, 0, 0, 4, 3 },
  { "Brass Stab", {
    { ENV(80,40,22,62), ENV(99,90,86,0), 39,0,0,0,0, 2, 0, 1, 99, 0, 1, 0, 6 },
    { ENV(76,50,20,62), ENV(99,84,78,0), 39,0,0,0,0, 2, 0, 4, 80, 0, 1, 0, 7 },
    { ENV(80,40,22,62), ENV(99,90,86,0), 39,0,0,0,0, 2, 0, 1, 96, 0, 1, 0, 9 },
    { ENV(80,40,22,62), ENV(99,90,86,0), 39,0,0,0,0, 2, 0, 1, 93, 0, 1, 0, 4 },
    { ENV(78,40,22,62), ENV(99,88,84,0), 39,0,0,0,0, 2, 0, 1, 80, 0, 2, 0, 7 },
    { ENV(70,45,20,62), ENV(99,80,72,0), 39,0,0,0,0, 2, 0, 3, 79, 0, 1, 0, 7 } },
    {84,95,95,60}, {46,50,50,50}, 22, 7, 1, 37, 0, 5, 0, 1, 4, 3 },
  { "Orch Hit", {
    { ENV(99,44,34,58), ENV(99,58,0,0),  39,0,0,0,0, 1, 0, 1, 99, 0, 0, 0, 7 },
    { ENV(99,60,35,58), ENV(99,50,0,0),  39,0,0,0,0, 1, 0, 3, 84, 0, 1, 0, 7 },
    { ENV(99,44,34,58), ENV(99,58,0,0),  39,0,0,0,0, 1, 0, 1, 96, 0, 1, 0, 11 },
    { ENV(99,44,34,58), ENV(99,58,0,0),  39,0,0,0,0, 1, 0, 1, 92, 0, 1, 50, 7 },  // 1.5: the fifth
    { ENV(99,44,34,58), ENV(99,58,0,0),  39,0,0,0,0, 1, 0, 1, 90, 0, 2, 0, 3 },
    { ENV(99,70,40,58), ENV(99,35,0,0),  39,0,0,0,0, 1, 0, 5, 90, 0, 1, 0, 7 } },
    {99,99,99,99}, {50,50,50,50}, 22, 7, 1, 35, 0, 0, 0, 1, 0, 3 },
  { "Tine Piano", {
    { ENV(97,30,24,62), ENV(99,78,0,0),  44,0,24,0,0, 3, 0, 2, 99, 0, 1, 0, 9 },
    { ENV(97,55,38,75), ENV(99,70,0,0),  44,0,0,0,0, 4, 0, 7, 71, 0, 14, 0, 7 },
    { ENV(96,22,22,50), ENV(99,92,0,0),  44,0,0,0,0, 3, 0, 2, 99, 0, 1, 0, 5 },
    { ENV(96,32,22,50), ENV(99,90,0,0),  44,0,0,0,0, 3, 0, 6, 88, 0, 1, 0, 7 },
    { ENV(96,22,22,50), ENV(99,92,0,0),  44,0,0,0,0, 3, 0, 1, 90, 0, 1, 0, 2 },
    { ENV(96,34,22,50), ENV(99,90,0,0),  44,0,0,0,0, 3, 0, 6, 80, 0, 3, 0, 12 } },
    {99,99,99,99}, {50,50,50,50}, 5, 6, 1, 34, 33, 0, 0, 0, 4, 3 },
  { "Glass Bells", {
    { ENV(99,24,18,30), ENV(99,70,0,0),  39,0,0,0,0, 2, 0, 2, 99, 0, 1, 0, 7 },
    { ENV(99,32,20,30), ENV(99,60,0,0),  39,0,0,0,0, 2, 0, 5, 80, 0, 3, 50, 7 },  // 3.5
    { ENV(99,22,16,30), ENV(99,70,0,0),  39,0,0,0,0, 2, 0, 2, 92, 0, 2, 0, 9 },
    { ENV(99,30,20,30), ENV(99,60,0,0),  39,0,0,0,0, 2, 0, 5, 76, 0, 7, 0, 7 },
    { ENV(99,20,15,30), ENV(99,72,0,0),  39,0,0,0,0, 2, 0, 1, 86, 0, 1, 0, 4 },
    { ENV(99,40,25,30), ENV(99,50,0,0),  39,0,0,0,0, 2, 0, 6, 70, 0, 4, 20, 7 } },
    {99,99,99,99}, {50,50,50,50}, 5, 3, 1, 30, 0, 0, 0, 0, 4, 2 },
  { "Synth Bass", {
    { ENV(99,38,30,70), ENV(99,86,70,0), 39,0,0,0,0, 2, 0, 2, 99, 0, 1, 0, 7 },
    { ENV(99,55,36,70), ENV(99,58,40,0), 39,0,0,0,0, 2, 0, 5, 86, 0, 1, 0, 8 },
    { ENV(99,60,40,70), ENV(99,40,0,0),  39,0,0,0,0, 2, 0, 6, 76, 0, 1, 0, 7 },
    { ENV(99,40,30,70), ENV(99,80,60,0), 39,0,0,0,0, 2, 0, 2, 88, 0, 1, 0, 6 },
    { ENV(99,60,40,70), ENV(99,50,0,0),  39,0,0,0,0, 2, 0, 6, 80, 0, 1, 0, 7 },
    { ENV(99,70,45,70), ENV(99,30,0,0),  39,0,0,0,0, 2, 0, 6, 72, 0, 2, 0, 7 } },
    {99,99,99,99}, {50,50,50,50}, 3, 6, 1, 35, 0, 0, 0, 1, 0, 3 },
  { "Marimba", {
    { ENV(99,36,30,60), ENV(99,0,0,0),   45,0,30,0,0, 4, 0, 2, 99, 0, 1, 0, 7 },
    { ENV(99,72,50,60), ENV(99,0,0,0),   45,0,0,0,0, 4, 0, 6, 72, 0, 3, 50, 7 },
    { ENV(99,34,30,60), ENV(99,0,0,0),   45,0,30,0,0, 4, 0, 2, 90, 0, 4, 0, 7 },
    { ENV(99,80,60,60), ENV(99,0,0,0),   45,0,0,0,0, 4, 0, 7, 60, 0, 10, 0, 7 },
    { ENV(99,38,30,60), ENV(99,0,0,0),   45,0,30,0,0, 4, 0, 1, 80, 0, 1, 0, 8 },
    { ENV(99,85,60,60), ENV(99,0,0,0),   45,0,0,0,0, 4, 0, 7, 55, 0, 1, 0, 7 } },
    {99,99,99,99}, {50,50,50,50}, 5, 0, 1, 35, 0, 0, 0, 0, 0, 0 },
  { "FM Strings", {
    { ENV(55,30,20,45), ENV(99,95,92,0), 39,0,0,0,0, 1, 0, 1, 99, 0, 1, 0, 5 },
    { ENV(50,30,20,45), ENV(99,92,90,0), 39,0,0,0,0, 1, 0, 2, 74, 0, 1, 0, 7 },
    { ENV(55,30,20,45), ENV(99,95,92,0), 39,0,0,0,0, 1, 0, 1, 96, 0, 1, 0, 9 },
    { ENV(50,30,20,45), ENV(99,92,90,0), 39,0,0,0,0, 1, 0, 2, 70, 0, 2, 0, 7 },
    { ENV(55,30,20,45), ENV(99,95,92,0), 39,0,0,0,0, 1, 0, 1, 92, 0, 1, 0, 3 },
    { ENV(48,30,20,45), ENV(99,90,88,0), 39,0,0,0,0, 1, 0, 2, 66, 0, 1, 0, 11 } },
    {99,99,99,99}, {50,50,50,50}, 5, 4, 1, 34, 40, 6, 0, 0, 4, 3 },
  { "Soft Pad", {
    { ENV(38,24,20,36), ENV(99,95,92,0), 39,0,0,0,0, 1, 0, 1, 99, 0, 1, 0, 6 },
    { ENV(34,24,20,36), ENV(99,88,84,0), 39,0,0,0,0, 1, 0, 2, 66, 0, 1, 0, 7 },
    { ENV(38,24,20,36), ENV(99,95,92,0), 39,0,0,0,0, 1, 0, 1, 94, 0, 2, 0, 8 },
    { ENV(34,24,20,36), ENV(99,88,84,0), 39,0,0,0,0, 1, 0, 2, 60, 0, 1, 0, 7 },
    { ENV(38,24,20,36), ENV(99,95,92,0), 39,0,0,0,0, 1, 0, 1, 90, 0, 1, 0, 9 },
    { ENV(30,24,20,36), ENV(99,86,82,0), 39,0,0,0,0, 1, 0, 2, 58, 0, 3, 0, 7 } },
    {99,99,99,99}, {50,50,50,50}, 5, 2, 1, 30, 50, 4, 0, 0, 4, 2 },
  { "Clav", {
    { ENV(99,46,30,75), ENV(99,72,0,0),  39,0,0,0,0, 3, 0, 3, 99, 0, 1, 0, 7 },
    { ENV(99,70,48,75), ENV(99,40,0,0),  39,0,0,0,0, 3, 0, 6, 84, 0, 3, 0, 7 },
    { ENV(99,75,50,75), ENV(99,30,0,0),  39,0,0,0,0, 3, 0, 6, 76, 0, 5, 0, 7 },
    { ENV(99,46,30,75), ENV(99,72,0,0),  39,0,0,0,0, 3, 0, 3, 90, 0, 1, 0, 9 },
    { ENV(99,70,48,75), ENV(99,40,0,0),  39,0,0,0,0, 3, 0, 6, 80, 0, 1, 0, 7 },
    { ENV(99,80,55,75), ENV(99,30,0,0),  39,0,0,0,0, 3, 0, 6, 70, 0, 2, 0, 7 } },
    {99,99,99,99}, {50,50,50,50}, 3, 6, 1, 35, 0, 0, 0, 0, 0, 3 },
  { "Organ", {
    { ENV(99,99,99,70), ENV(99,99,99,0), 39,0,0,0,0, 0, 0, 0, 88, 0, 0, 0, 7 },   // 16'
    { ENV(99,99,99,70), ENV(99,99,99,0), 39,0,0,0,0, 0, 0, 0, 92, 0, 1, 0, 7 },   // 8'
    { ENV(99,99,99,70), ENV(99,99,99,0), 39,0,0,0,0, 0, 0, 0, 86, 0, 2, 0, 7 },   // 4'
    { ENV(99,99,99,70), ENV(99,99,99,0), 39,0,0,0,0, 0, 0, 0, 80, 0, 3, 0, 8 },   // 2 2/3'
    { ENV(99,55,40,70), ENV(99,0,0,0),   39,0,0,0,0, 0, 0, 2, 82, 0, 3, 0, 7 },   // percussion
    { ENV(99,99,99,70), ENV(99,99,99,0), 39,0,0,0,0, 0, 0, 0, 72, 0, 4, 0, 6 } }, // 2'
    {99,99,99,99}, {50,50,50,50}, 32, 0, 1, 35, 0, 4, 0, 0, 4, 2 },
  { "Kalimba", {
    { ENV(99,40,30,55), ENV(99,0,0,0),   45,0,25,0,0, 4, 0, 2, 99, 0, 1, 0, 7 },
    { ENV(99,75,55,55), ENV(99,0,0,0),   45,0,0,0,0, 4, 0, 6, 70, 0, 3, 0, 7 },
    { ENV(99,36,30,55), ENV(99,0,0,0),   45,0,25,0,0, 4, 0, 2, 70, 0, 6, 0, 7 },
    { ENV(99,85,60,55), ENV(99,0,0,0),   45,0,0,0,0, 4, 0, 7, 55, 0, 9, 0, 7 },
    { ENV(99,44,30,55), ENV(99,0,0,0),   45,0,25,0,0, 4, 0, 1, 82, 0, 1, 0, 9 },
    { ENV(99,90,60,55), ENV(99,0,0,0),   45,0,0,0,0, 4, 0, 7, 50, 0, 1, 0, 7 } },
    {99,99,99,99}, {50,50,50,50}, 5, 0, 1, 35, 0, 0, 0, 0, 0, 0 },
  { "Tubular Bells", {
    { ENV(99,18,14,26), ENV(99,60,0,0),  39,0,0,0,0, 1, 0, 2, 99, 0, 1, 0, 7 },
    { ENV(99,22,16,26), ENV(99,56,0,0),  39,0,0,0,0, 1, 0, 4, 78, 0, 3, 50, 7 },
    { ENV(99,16,12,26), ENV(99,62,0,0),  39,0,0,0,0, 1, 0, 2, 90, 0, 2, 0, 8 },
    { ENV(99,24,16,26), ENV(99,50,0,0),  39,0,0,0,0, 1, 0, 4, 74, 0, 5, 40, 7 },
    { ENV(99,15,12,26), ENV(99,66,0,0),  39,0,0,0,0, 1, 0, 1, 88, 0, 0, 0, 6 },
    { ENV(99,30,20,26), ENV(99,45,0,0),  39,0,0,0,0, 1, 0, 5, 70, 0, 1, 41, 7 } },
    {99,99,99,99}, {50,50,50,50}, 5, 2, 1, 30, 0, 0, 0, 0, 4, 2 },
  { "Pluck Lead", {
    { ENV(99,35,28,60), ENV(99,80,70,0), 39,0,0,0,0, 2, 0, 2, 99, 0, 1, 0, 7 },
    { ENV(99,55,32,60), ENV(99,60,50,0), 39,0,0,0,0, 2, 0, 5, 84, 0, 1, 0, 8 },
    { ENV(99,40,28,60), ENV(99,78,68,0), 39,0,0,0,0, 2, 0, 2, 92, 0, 1, 0, 5 },
    { ENV(99,60,35,60), ENV(99,55,40,0), 39,0,0,0,0, 2, 0, 5, 80, 0, 2, 0, 7 },
    { ENV(99,70,40,60), ENV(99,40,20,0), 39,0,0,0,0, 2, 0, 6, 74, 0, 3, 0, 7 },
    { ENV(99,75,45,60), ENV(99,30,10,0), 39,0,0,0,0, 2, 0, 6, 68, 0, 1, 0, 7 } },
    {99,99,99,99}, {50,50,50,50}, 1, 6, 1, 35, 30, 6, 0, 0, 4, 3 },
  { "Harmonica", {
    { ENV(62,40,30,60), ENV(99,92,88,0), 39,0,0,0,0, 1, 0, 3, 99, 0, 1, 0, 7 },
    { ENV(60,40,30,60), ENV(99,88,84,0), 39,0,0,0,0, 1, 0, 5, 82, 0, 1, 0, 7 },
    { ENV(60,40,30,60), ENV(99,84,80,0), 39,0,0,0,0, 1, 0, 5, 76, 0, 2, 0, 7 },
    { ENV(60,40,30,60), ENV(99,80,76,0), 39,0,0,0,0, 1, 0, 5, 70, 0, 3, 0, 7 },
    { ENV(60,40,30,60), ENV(99,80,76,0), 39,0,0,0,0, 1, 0, 5, 68, 0, 5, 0, 7 },
    { ENV(58,40,30,60), ENV(99,76,72,0), 39,0,0,0,0, 1, 0, 5, 64, 0, 1, 0, 7 } },
    {99,99,99,99}, {50,50,50,50}, 16, 7, 1, 36, 35, 6, 0, 0, 4, 3 },
};
static float GAIN[16] = {1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1};
static const int NPATCH = sizeof(PATCHES) / sizeof(PATCHES[0]);

// the DX7's 156-byte voice, with Brightness (modulator levels), Decay (carrier decay rates) and Velocity applied
static void voiceData(int pi, float bright, float decay, float velsens, uint8_t *v) {
  const Patch &p = PATCHES[pi];
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

// ---------- the synth ----------
static const int MAX_VOICES = 16;
static TuningState TUNING;
static EngineMkI ENGINE;
static Controllers CTRL;
struct Voice { float g = 1; Dx7Note *n = nullptr; bool live = false, keydown = false, sustained = false; int note = -1; uint64_t age = 0; };
struct Chorus {
  float *buf = nullptr; size_t len = 0, write = 0; float lfo = 0;
  void init(float sr) { len = (size_t)(sr * 0.05f) + 4; buf = (float *)calloc(len, sizeof(float)); write = 0; lfo = 0; }
  float read(float delay) const {
    float pos = (float)write - delay; pos = fmodf(pos, (float)len); if (pos < 0) pos += (float)len;
    size_t i0 = (size_t)floorf(pos) % len, i1 = (i0 + 1) % len; float frac = pos - floorf(pos);
    return buf[i0] * (1.0f - frac) + buf[i1] * frac;
  }
  void process(float x, float sr, float &wl, float &wr) {
    buf[write] = x;
    float base = 0.007f * sr, depth = 0.003f * sr;
    wl = read(base + depth * sinf(TAU * lfo)); wr = read(base + depth * sinf(TAU * (lfo + 0.5f)));
    lfo = fract(lfo + 0.5f / sr); write = (write + 1) % len;
  }
  void clear() { for (size_t i = 0; i < len; i++) buf[i] = 0; }
};
static struct Synth {
  float sr = 48000; Voice v[MAX_VOICES]; Lfo lfo; Chorus chorus; uint64_t ageN = 0; int lfoPatch = -1; bool sustain = false;
  uint8_t data[156]; float block[N]; int have = 0, pos = 0;
  int32_t buf[N];
  void noteOn(int note, int vel) {
    int pi = (int)clampf(P[MODE], 0, NPATCH - 1);
    voiceData(pi, P[BRIGHT], P[DECAY], P[VELSENS], data);
    if (pi != lfoPatch) { lfo.reset(data + 137); lfoPatch = pi; }
    int idx = -1;
    for (int i = 0; i < MAX_VOICES; i++) if (v[i].live && v[i].note == note) { idx = i; break; }   // a retrigger takes the same voice
    if (idx < 0) for (int i = 0; i < MAX_VOICES; i++) if (!v[i].live) { idx = i; break; }
    if (idx < 0) { idx = 0; for (int i = 1; i < MAX_VOICES; i++) if (v[i].age < v[idx].age) idx = i; }
    Voice &x = v[idx];
    x.n->init(data, note, vel, 1, &CTRL);
    x.g = GAIN[pi]; x.live = true; x.keydown = true; x.sustained = false; x.note = note; x.age = ++ageN;
    lfo.keydown();
  }
  void noteOff(int note) {
    for (auto &x : v) if (x.live && x.keydown && x.note == note) { x.keydown = false; if (sustain) x.sustained = true; else x.n->keyup(); }
  }
  void pedal(bool on) {
    sustain = on;
    if (!on) for (auto &x : v) if (x.live && x.sustained) { x.sustained = false; x.n->keyup(); }
  }
  void allOff() { for (auto &x : v) if (x.live) { x.keydown = false; x.sustained = false; x.n->keyup(); } }
  void fill() {   // one msfa block of N samples
    for (int j = 0; j < N; j++) block[j] = 0;
    int32_t lv = lfo.getsample(), ld = lfo.getdelay();
    CTRL.modwheel_cc = (int)(P[VIBRATO] * 127.0f); CTRL.refresh();
    for (auto &x : v) {
      if (!x.live) continue;
      for (int j = 0; j < N; j++) buf[j] = 0;
      x.n->compute(buf, lv, ld, &CTRL);
      for (int j = 0; j < N; j++) {
        int32_t val = buf[j] >> 4;
        int clip = val < -(1 << 24) ? -0x8000 : val >= (1 << 24) ? 0x7fff : val >> 9;
        block[j] += x.g * (float)clip / 32768.0f;
      }
      if (!x.keydown && !x.sustained && !x.n->isPlaying()) x.live = false;
    }
    have = N; pos = 0;
  }
  void process(float *L, float *R, int n) {
    float cm = P[CHORUS], vol = P[VOLUME], norm = 1.0f / (1.0f + 0.5f * cm);
    for (int i = 0; i < n; i++) {
      if (pos >= have) fill();
      float x = block[pos++] * 1.4f;
      float wl, wr; chorus.process(x, sr, wl, wr);
      L[i] = tanhf((x + wl * cm) * norm * vol * 1.4f);
      R[i] = tanhf((x + wr * cm) * norm * vol * 1.4f);
    }
  }
} S;

extern "C" {
EXPORT("nb_init") void nb_init(float sr) {
  S.sr = sr;
  Exp2::init(); Tanh::init(); Sin::init(); Freqlut::init(sr); Lfo::init(sr); PitchEnv::init(sr); Env::init_sr(sr);
  CTRL.pitch_cc = 0x2000; CTRL.pitch_range_up = 2; CTRL.pitch_range_dn = 2; CTRL.pitch_step = 0; CTRL.masterTune = 0;
  CTRL.modwheel_cc = 0; CTRL.foot_cc = 0; CTRL.breath_cc = 0; CTRL.aftertouch_cc = 0;
  CTRL.portamento_enable_cc = false; CTRL.portamento_cc = 0; CTRL.portamento_gliss_cc = false; CTRL.mpeEnabled = false;
  CTRL.wheel.range = 99; CTRL.wheel.pitch = true; CTRL.at.range = 50; CTRL.at.amp = true;
  CTRL.core = &ENGINE; CTRL.refresh();
  for (auto &x : S.v) x.n = new Dx7Note(&TUNING, nullptr);
  S.chorus.init(sr);
}
EXPORT("nb_params") float *nb_params() { return P; }
EXPORT("nb_count") int nb_count() { return NPARAM; }
EXPORT("nb_reset") void nb_reset() { for (auto &x : S.v) { x.live = false; x.keydown = false; x.sustained = false; } S.chorus.clear(); S.have = S.pos = 0; }
EXPORT("nb_midi") void nb_midi(int st, int d1, int d2) {
  int c = st & 0xF0;
  if (c == 0x90 && d2 > 0) S.noteOn(d1, d2);
  else if (c == 0x80 || c == 0x90) S.noteOff(d1);
  else if (c == 0xB0) {
    if (d1 == 64) S.pedal(d2 >= 64);
    else if (d1 == 1) P[VIBRATO] = d2 / 127.0f;
    else if (d1 == 120 || d1 == 123) S.allOff();
  }
  else if (c == 0xE0) { CTRL.pitch_cc = d1 | (d2 << 7); }
  else if (c == 0xD0) { CTRL.aftertouch_cc = d1; CTRL.refresh(); }
}
EXPORT("nb_render") void nb_render(int n) { S.process(OUT_L, OUT_R, n); }
}
