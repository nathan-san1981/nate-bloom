// csapi.h (Nate Bloom build 229): Duet 80's CS-80 voice engine (portsrc/duet80core, Nathan's own) behind a few calls,
// so Nebula 80's CS Brass and CS Lead play on it.
#pragma once
namespace csapi {
void init(float sr);
void patch(int which);   // 0 brass, 1 lead
// Nebula's knobs, as offsets from the patch: cutoff/bright/res/attack/release/sustain/detune/mix and the touch
void knobs(float bril, float res, float att, float rel, float sus, float det, float mix, float atVib, float glide, float vol);
void on(int key, float vel);
void off(int key);
void choke();
void pedal(bool down);
void pressure(float p);
void bend(float v);
void mod(float v);
void process(float *L, float *R, int n);
int active();
}
