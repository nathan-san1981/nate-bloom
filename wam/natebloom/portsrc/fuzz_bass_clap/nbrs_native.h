// Helpers for the plugins translated from Rust (nih-plug) to C++: the same f32 maths, the same names
#pragma once
#include <math.h>
#include <stdint.h>

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
