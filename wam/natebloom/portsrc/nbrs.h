// Helpers for the plugins translated from Rust (nih-plug) to C++: the same f32 maths, the same names
#pragma once
#include <math.h>
#include <stdint.h>
#define EXPORT(n) __attribute__((export_name(n)))
static const float TAU = 6.28318530717958647692f, PI = 3.14159265358979323846f, FRAC_PI_4 = 0.78539816339744830962f, FRAC_PI_2 = 1.57079632679489661923f;
static inline float fract(float x) { return x - truncf(x); }   // Rust's f32::fract
static inline float clampf(float x, float a, float b) { return x < a ? a : x > b ? b : x; }
static inline float maxf(float a, float b) { return a > b ? a : b; }
static inline float minf(float a, float b) { return a < b ? a : b; }
static inline float midi_to_freq(float note) { return 440.0f * powf(2.0f, (note - 69.0f) / 12.0f); }
static inline float poly_blep(float t, float dt) {
  if (t < dt) { t = t / dt; return t + t - t * t - 1.0f; }
  if (t > 1.0f - dt) { t = (t - 1.0f) / dt; return t * t + t + t + 1.0f; }
  return 0.0f;
}
static float OUT_L[512], OUT_R[512], IN_L[512], IN_R[512];
static double TEMPO = 120.0; static bool PLAYING = false; static double SONG_BEATS = 0.0;
extern "C" {
EXPORT("nb_out") float *nb_out(int c) { return c ? OUT_R : OUT_L; }
EXPORT("nb_in") float *nb_in(int c) { return c ? IN_R : IN_L; }
EXPORT("nb_tempo") void nb_tempo(double b, int play) { TEMPO = b > 0 ? b : 120; PLAYING = play != 0; }   // (full precision, as the host gives it)
}
