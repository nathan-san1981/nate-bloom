// Single-precision maths for the ported plugins, compiled into the WebAssembly (calling out to JavaScript for every
// sample costs more than these do). Cephes-style range reduction and polynomials: within an ulp or two, like glibc's.
#include <stdint.h>
extern "C" {
static inline float asf(uint32_t u) { float f; __builtin_memcpy(&f, &u, 4); return f; }
static inline uint32_t asu(float f) { uint32_t u; __builtin_memcpy(&u, &f, 4); return u; }
float exp2f(float x) {
  if (x != x) return x;
  if (x > 127.99f) return asf(0x7f800000u);
  if (x < -149.0f) return 0.0f;
  float n = __builtin_floorf(x + 0.5f), f = x - n;   // f in [-0.5, 0.5]
  // 2^f, minimax on [-0.5, 0.5]
  float p = 1.535336188319500e-4f;
  p = p * f + 1.339887440266574e-3f;
  p = p * f + 9.618437357674640e-3f;
  p = p * f + 5.550332471162809e-2f;
  p = p * f + 2.402264791363012e-1f;
  p = p * f + 6.931472028550421e-1f;
  p = p * f + 1.0f;
  int e = (int)n;
  if (e < -126) return p * asf((uint32_t)(e + 253) << 23) * asf(1u << 23);   // (below the normal range)
  return p * asf((uint32_t)(e + 127) << 23);
}
float expf(float x) { return exp2f(x * 1.44269504088896341f); }
float log2f(float x) {
  uint32_t u = asu(x);
  if (x <= 0.0f) return x == 0.0f ? -asf(0x7f800000u) : asf(0x7fc00000u);
  if (u >= 0x7f800000u) return x;
  int e = (int)(u >> 23) - 127; if (e == -127) { x *= 8388608.0f; u = asu(x); e = (int)(u >> 23) - 127 - 23; }
  float m = asf((u & 0x007fffffu) | 0x3f800000u);   // [1, 2)
  if (m > 1.41421356f) { m *= 0.5f; e++; }
  float z = m - 1.0f, zz = z * z;   // Cephes logf polynomial for ln(1+z) on [sqrt(.5)-1, sqrt(2)-1]
  float y = 7.0376836292e-2f;
  y = y * z - 1.1514610310e-1f; y = y * z + 1.1676998740e-1f; y = y * z - 1.2420140846e-1f; y = y * z + 1.4249322787e-1f;
  y = y * z - 1.6668057665e-1f; y = y * z + 2.0000714765e-1f; y = y * z - 2.4999993993e-1f; y = y * z + 3.3333331174e-1f;
  y = y * z * zz - 0.5f * zz + z;   // ln(m)
  return y * 1.44269504088896341f + (float)e;
}
float logf(float x) { return log2f(x) * 0.693147180559945309f; }
float log10f(float x) { return log2f(x) * 0.301029995663981195f; }
float powf(float x, float y) {
  if (y == 0.0f) return 1.0f;
  if (x > 0.0f) return exp2f(y * log2f(x));
  if (x == 0.0f) return y > 0 ? 0.0f : asf(0x7f800000u);
  float yi = __builtin_truncf(y); if (yi != y) return asf(0x7fc00000u);
  float r = exp2f(y * log2f(-x)); return ((int64_t)yi & 1) ? -r : r;
}
// sin and cos: reduce to [-pi/4, pi/4] by quadrant
static inline float sinp(float x) { float z = x * x; return ((-1.9515295891e-4f * z + 8.3321608736e-3f) * z - 1.6666654611e-1f) * z * x + x; }
static inline float cosp(float x) { float z = x * x; return ((2.443315711809948e-5f * z - 1.388731625493765e-3f) * z + 4.166664568298827e-2f) * z * z - 0.5f * z + 1.0f; }
static inline void reduce(float x, float &r, int &q) {
  double xd = x;   // in double, so large arguments (phase accumulators) still reduce cleanly
  double k = __builtin_floor(xd * 0.636619772367581343 + 0.5);
  r = (float)(xd - k * 1.57079632679489662);
  q = (int)((int64_t)k & 3);
}
float sinf(float x) { float r; int q; reduce(x, r, q); switch (q) { case 0: return sinp(r); case 1: return cosp(r); case 2: return -sinp(r); default: return -cosp(r); } }
float cosf(float x) { float r; int q; reduce(x, r, q); switch (q) { case 0: return cosp(r); case 1: return -sinp(r); case 2: return -cosp(r); default: return sinp(r); } }
float tanf(float x) { float r; int q; reduce(x, r, q); float s = sinp(r), c = cosp(r); return (q & 1) ? -c / s : s / c; }
void sincosf(float x, float *s, float *c) { float r; int q; reduce(x, r, q); float a = sinp(r), b = cosp(r); switch (q) { case 0: *s = a; *c = b; break; case 1: *s = b; *c = -a; break; case 2: *s = -a; *c = -b; break; default: *s = -b; *c = a; } }
float tanhf(float x) {
  float a = __builtin_fabsf(x);
  if (a > 9.0f) return x > 0 ? 1.0f : -1.0f;
  if (a < 0.625f) { float z = x * x; return ((((-5.70498872745e-3f * z + 2.06390887954e-2f) * z - 5.37397155531e-2f) * z + 1.33314422036e-1f) * z - 3.33332819422e-1f) * z * x + x; }
  float e = exp2f(2.0f * a * 1.44269504088896341f), t = 1.0f - 2.0f / (e + 1.0f);
  return x > 0 ? t : -t;
}
float atanf(float x) {
  float s = x < 0 ? -1.0f : 1.0f, a = __builtin_fabsf(x), y = 0, z;
  if (a > 2.414213562373095f) { y = 1.570796326794897f; a = -1.0f / a; } else if (a > 0.4142135623730950f) { y = 0.7853981633974483f; a = (a - 1.0f) / (a + 1.0f); }
  z = a * a; y += (((8.05374449538e-2f * z - 1.38776856032e-1f) * z + 1.99777106478e-1f) * z - 3.33329491539e-1f) * z * a + a;
  return s * y;
}
float atan2f(float y, float x) {
  if (x > 0) return atanf(y / x);
  if (x < 0) return atanf(y / x) + (y >= 0 ? 3.14159265358979f : -3.14159265358979f);
  return y > 0 ? 1.5707963267949f : y < 0 ? -1.5707963267949f : 0.0f;
}
float sinhf(float x) { float e = expf(x); return 0.5f * (e - 1.0f / e); }
float coshf(float x) { float e = expf(x); return 0.5f * (e + 1.0f / e); }
float expm1f(float x) { return __builtin_fabsf(x) < 1e-3f ? x + 0.5f * x * x : expf(x) - 1.0f; }
float log1pf(float x) { return __builtin_fabsf(x) < 1e-3f ? x - 0.5f * x * x : logf(1.0f + x); }
float cbrtf(float x) { if (x == 0) return 0; float a = __builtin_fabsf(x), y = exp2f(log2f(a) / 3.0f); y = y - (y * y * y - a) / (3 * y * y); return x < 0 ? -y : y; }
float hypotf(float a, float b) { return __builtin_sqrtf(a * a + b * b); }
}
// the double versions, at single precision (plenty for audio; faster than calling out to JavaScript)
extern "C" {
double sin(double x) { double k = __builtin_floor(x * 0.159154943091895336 + 0.5); return sinf((float)(x - k * 6.28318530717958648)); }
double cos(double x) { double k = __builtin_floor(x * 0.159154943091895336 + 0.5); return cosf((float)(x - k * 6.28318530717958648)); }
double tan(double x) { double k = __builtin_floor(x * 0.318309886183790672 + 0.5); return tanf((float)(x - k * 3.14159265358979324)); }
double exp(double x) { return x > 88.7 ? __builtin_inf() : x < -103.9 ? 0.0 : (double)expf((float)x); }
double exp2(double x) { return x > 127.9 ? __builtin_inf() : x < -149.0 ? 0.0 : (double)exp2f((float)x); }
double log(double x) { return x > 3.4e38 ? (double)logf((float)(x * 1e-30)) + 69.0775527898214 : (double)logf((float)x); }
double log2(double x) { return log(x) * 1.44269504088896341; }
double log10(double x) { return log(x) * 0.434294481903251828; }
double pow(double x, double y) { if (y == 0) return 1.0; if (x > 0) { double l = log2(x) * y; return l > 127.9 ? __builtin_inf() : l < -149.0 ? 0.0 : (double)exp2f((float)l); } return (double)powf((float)x, (float)y); }
double tanh(double x) { return (double)tanhf((float)x); }
double atan(double x) { return (double)atanf((float)x); }
double atan2(double y, double x) { return (double)atan2f((float)y, (float)x); }
double sinh(double x) { return (double)sinhf((float)x); }
double cosh(double x) { return (double)coshf((float)x); }
float ldexpf(float x, int e) { float m = 1.0f; if (e > 0) { while (e-- > 0) m *= 2.0f; } else { while (e++ < 0) m *= 0.5f; } return x * m; }
double ldexp(double x, int e) { return (double)ldexpf((float)x, e); }
}
