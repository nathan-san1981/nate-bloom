// Nathan's plugin instruments, native: a small C API over the wasm2c builds (see nbsynth.c).
#ifndef NBSYNTH_H
#define NBSYNTH_H
#ifdef __cplusplus
extern "C" {
#endif
int nbs_count(void);
const char* nbs_id(int i);
int nbs_find(const char* id);
void nbs_thread_init(void);
int nbs_create(int i, float rate);
int nbs_alive(int i);
int nbs_params(int i);
void nbs_param(int i, int idx, float v);
void nbs_midi(int i, int st, int d1, int d2);
void nbs_tempo(int i, double bpm, int playing);
void nbs_reset(int i);
int nbs_render(int i, int n, float* L, float* R);
#ifdef __cplusplus
}
#endif
#endif
