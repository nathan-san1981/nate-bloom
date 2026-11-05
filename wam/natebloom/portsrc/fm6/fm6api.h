// fm6api.h: the 6-operator FM voice (fm6.h) behind a small API, so instruments whose own names clash with msfa's
// (Env, Lfo) can use it from their own file. Link fm6.cpp and the dx7/ sources.
#pragma once
namespace fm6api {
enum { TINE = 0, EPIANO = 1, GLASS = 2, TUBULAR = 3 };
struct V;
void setup(float sr);
V *make();
void start(V *v, int patch, int note, int vel, float bright, float decay, float velsens);
void keyup(V *v);
float next(V *v);
bool live(V *v);
void stop(V *v);
}
