#include "fm6.h"
#include "fm6api.h"
namespace fm6api {
struct V { fm6::Fm6 f; };
void setup(float sr) { fm6::setup(sr); }
V *make() { return new V(); }
void start(V *v, int patch, int note, int vel, float bright, float decay, float velsens) { v->f.start(patch, note, vel, bright, decay, velsens); }
void keyup(V *v) { v->f.keyup(); }
float next(V *v) { return v->f.next(); }
bool live(V *v) { return v->f.live; }
void stop(V *v) { v->f.live = false; }
}
