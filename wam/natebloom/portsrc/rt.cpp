// A tiny runtime so plugin DSP written for desktops runs as WebAssembly with no libc: memory (a grow-only heap;
// the DSP allocates when it starts, not while it plays), the C/C++ bits the compiler asks for, and the few maths
// functions WebAssembly lacks as instructions come from JavaScript (Math.*) as imports.
#include <stddef.h>
extern "C" {
extern unsigned char __heap_base;
static size_t heapTop = 0;
__attribute__((export_name("nb_heap"))) size_t nb_heap() { return heapTop; }
void *malloc(size_t n) {
  if (!heapTop) heapTop = ((size_t)&__heap_base + 15) & ~(size_t)15;
  size_t p = heapTop; n = (n + 15) & ~(size_t)15; heapTop += n + 16;
  size_t have = __builtin_wasm_memory_size(0) * 65536;
  if (heapTop > have) { size_t need = (heapTop - have + 65535) / 65536; if (__builtin_wasm_memory_grow(0, need) == (size_t)-1) __builtin_trap(); }
  return (void *)p;
}
void free(void *) {}
void *memset(void *d, int c, size_t n) { unsigned char *p = (unsigned char *)d; while (n--) *p++ = (unsigned char)c; return d; }
void *memcpy(void *d, const void *s, size_t n) { unsigned char *a = (unsigned char *)d; const unsigned char *b = (const unsigned char *)s; while (n--) *a++ = *b++; return d; }
void *memmove(void *d, const void *s, size_t n) { unsigned char *a = (unsigned char *)d; const unsigned char *b = (const unsigned char *)s; if (a < b) while (n--) *a++ = *b++; else { a += n; b += n; while (n--) *--a = *--b; } return d; }
void *calloc(size_t a, size_t b) { void *p = malloc(a * b); memset(p, 0, a * b); return p; }
void *realloc(void *p, size_t n) { void *q = malloc(n); if (p) memcpy(q, p, n); return q; }   // (copies n: the old block was at least as big or the extra is unused)
int memcmp(const void *x, const void *y, size_t n) { const unsigned char *a = (const unsigned char *)x, *b = (const unsigned char *)y; for (; n; n--, a++, b++) if (*a != *b) return *a - *b; return 0; }
size_t strlen(const char *s) { size_t n = 0; while (s[n]) n++; return n; }
int strcmp(const char *a, const char *b) { while (*a && *a == *b) { a++; b++; } return (unsigned char)*a - (unsigned char)*b; }
int strncmp(const char *a, const char *b, size_t n) { for (; n; n--, a++, b++) { if (*a != *b) return (unsigned char)*a - (unsigned char)*b; if (!*a) return 0; } return 0; }
int strcasecmp(const char *a, const char *b) { auto lc = [](int c) { return c >= 'A' && c <= 'Z' ? c + 32 : c; }; while (*a && lc(*a) == lc(*b)) { a++; b++; } return lc((unsigned char)*a) - lc((unsigned char)*b); }
char *strncpy(char *d, const char *s, size_t n) { size_t i = 0; for (; i < n && s[i]; i++) d[i] = s[i]; for (; i < n; i++) d[i] = 0; return d; }
void abort() { __builtin_trap(); }
char *strchr(const char *s, int c) { for (;; s++) { if (*s == (char)c) return (char *)s; if (!*s) return 0; } }
char *strrchr(const char *s, int c) { const char *r = 0; for (;; s++) { if (*s == (char)c) r = s; if (!*s) return (char *)r; } }
char *strstr(const char *h, const char *n) { if (!*n) return (char *)h; for (; *h; h++) { const char *a = h, *b = n; while (*a && *b && *a == *b) { a++; b++; } if (!*b) return (char *)h; } return 0; }
double strtod(const char *s, char **end) {   // plain decimals (text typed into a control)
  while (*s == ' ' || *s == '\t') s++;
  double sign = 1, v = 0, f = 0.1; if (*s == '-') { sign = -1; s++; } else if (*s == '+') s++;
  while (*s >= '0' && *s <= '9') v = v * 10 + (*s++ - '0');
  if (*s == '.') { s++; while (*s >= '0' && *s <= '9') { v += (*s++ - '0') * f; f *= 0.1; } }
  if (*s == 'e' || *s == 'E') { int es = 1, e = 0; s++; if (*s == '-') { es = -1; s++; } else if (*s == '+') s++; while (*s >= '0' && *s <= '9') e = e * 10 + (*s++ - '0'); while (e--) v = es > 0 ? v * 10 : v / 10; }
  if (end) *end = (char *)s; return sign * v;
}
float strtof(const char *s, char **end) { return (float)strtod(s, end); }
double atof(const char *s) { return strtod(s, 0); }
int atoi(const char *s) { return (int)strtod(s, 0); }
int abs(int x) { return x < 0 ? -x : x; }
long labs(long x) { return x < 0 ? -x : x; }
int rand() { static unsigned s = 22222; s = s * 1103515245u + 12345u; return (s >> 1) & 0x7fffffff; }
void srand(unsigned) {}
// rounding as C defines it (half away from zero); WebAssembly's own rounds half to even
float roundf(float x) { return x < 0 ? -__builtin_floorf(-x + 0.5f) : __builtin_floorf(x + 0.5f); }
double round(double x) { return x < 0 ? -__builtin_floor(-x + 0.5) : __builtin_floor(x + 0.5); }
long lroundf(float x) { return (long)roundf(x); }
long lround(double x) { return (long)round(x); }
long long llroundf(float x) { return (long long)roundf(x); }
float fmodf(float x, float y) { return x - __builtin_truncf(x / y) * y; }
double fmod(double x, double y) { return x - __builtin_trunc(x / y) * y; }
float fabsf(float x) { return __builtin_fabsf(x); }
double fabs(double x) { return __builtin_fabs(x); }
float sqrtf(float x) { return __builtin_sqrtf(x); }
double sqrt(double x) { return __builtin_sqrt(x); }
float floorf(float x) { return __builtin_floorf(x); }
double floor(double x) { return __builtin_floor(x); }
float ceilf(float x) { return __builtin_ceilf(x); }
double ceil(double x) { return __builtin_ceil(x); }
float truncf(float x) { return __builtin_truncf(x); }
double trunc(double x) { return __builtin_trunc(x); }
float fminf(float a, float b) { return a < b ? a : b; }
float fmaxf(float a, float b) { return a > b ? a : b; }
double fmin(double a, double b) { return a < b ? a : b; }
double fmax(double a, double b) { return a > b ? a : b; }
float copysignf(float a, float b) { return __builtin_copysignf(a, b); }
// printf-family: the DSP never needs output; formatting for display happens in JavaScript
int snprintf(char *b, size_t n, const char *, ...) { if (n) b[0] = 0; return 0; }
int printf(const char *, ...) { return 0; }
int fprintf(void *, const char *, ...) { return 0; }
int puts(const char *) { return 0; }
}
namespace std { struct nothrow_t; }
void *operator new(size_t n, const std::nothrow_t &) noexcept { return malloc(n); }
void *operator new[](size_t n, const std::nothrow_t &) noexcept { return malloc(n); }
void *operator new(size_t n) { return malloc(n); }
void *operator new[](size_t n) { return malloc(n); }
void operator delete(void *) noexcept {}
void operator delete[](void *) noexcept {}
void operator delete(void *, size_t) noexcept {}
void operator delete[](void *, size_t) noexcept {}
namespace std {
[[noreturn]] void __throw_length_error(const char *) { __builtin_trap(); }
[[noreturn]] void __throw_bad_alloc() { __builtin_trap(); }
[[noreturn]] void __throw_bad_array_new_length() { __builtin_trap(); }
[[noreturn]] void __throw_out_of_range(const char *) { __builtin_trap(); }
[[noreturn]] void __throw_out_of_range_fmt(const char *, ...) { __builtin_trap(); }
[[noreturn]] void __throw_logic_error(const char *) { __builtin_trap(); }
[[noreturn]] void __throw_invalid_argument(const char *) { __builtin_trap(); }
[[noreturn]] void __throw_bad_function_call() { __builtin_trap(); }
}
extern "C" int __cxa_atexit(void (*)(void *), void *, void *) { return 0; }
extern "C" void __cxa_pure_virtual() { __builtin_trap(); }
extern "C" int __cxa_guard_acquire(long long *g) { return !*(char *)g; }
extern "C" void __cxa_guard_release(long long *g) { *(char *)g = 1; }
extern "C" void __cxa_guard_abort(long long *) {}
void *__dso_handle = 0;
