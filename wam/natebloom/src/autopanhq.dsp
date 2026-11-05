declare name "Auto-Pan";
declare description "Tremolo or auto-pan, free or in time with the song: sine, triangle, saw up or down, or random steps, smooth or choppy, in the same phase on both sides or swinging left to right";
import("stdfaust.lib");
rate  = hslider("[0]Rate [unit:Hz][scale:log]", 2, 0.05, 16, 0.01);
depth = hslider("[1]Depth [unit:%]", 70, 0, 100, 1) / 100 : si.smoo;
shape = hslider("[2]Shape [unit:%]", 20, 0, 100, 1) / 100 : si.smoo;
pan   = hslider("[3]Pan [unit:%]", 100, 0, 100, 1) / 100 : si.smoo;
sync  = nentry("[4]Sync", 0, 0, 9, 1);
wave  = nentry("[5]Wave", 0, 0, 4, 1);
bpm   = hslider("bpm", 120, 20, 400, 0.01);
beats = ba.selectn(10, sync, 0, 4, 2, 1, 0.5, 0.25, 1.5, 0.75, 2/3, 1/3);
hz = select2(sync > 0, rate, bpm / 60 / max(0.01, beats));
phasor = (+(hz / ma.SR) : ma.frac) ~ _;
base(p) = ba.selectn(5, wave, sin(2 * ma.PI * p), 1 - 4 * abs(p - 0.5), 2 * p - 1, 1 - 2 * p, sh) with { sh = ba.sAndH(p < p', no.noise); };
// Shape: 0 = the wave as it is, 100 = a hard on/off of it; the steps are rounded over 2 ms so they don't click
w(off) = base(ma.frac(phasor + off)) : sh : si.smooth(ba.tau2pole(0.002)) with { sh(s) = s * (1 - shape) + ma.signum(s) * shape; };
g(off) = 1 - depth * (0.5 + 0.5 * w(off));
// (229) Pan swings on an equal-power law: the level doesn't dip as it passes the centre (it fell 3 dB there)
pk = 1 + (sqrt(2) - 1) * (1 - depth);   // (unity at Depth 0, a constant level at 100)
th = (0.25 + 0.25 * w(0) * depth) * ma.PI;
process = _, _ : *(g(0) * (1 - pan) + cos(th) * pk * pan), *(g(0) * (1 - pan) + sin(th) * pk * pan);
