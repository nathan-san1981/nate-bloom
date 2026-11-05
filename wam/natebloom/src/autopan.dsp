declare name "Auto-Pan";
declare description "Tremolo or auto-pan: a smooth or choppy level movement, in the same phase on both sides or swinging left to right";
import("stdfaust.lib");
rate  = hslider("[0]Rate [unit:Hz][scale:log]", 2, 0.05, 16, 0.01);
depth = hslider("[1]Depth [unit:%]", 70, 0, 100, 1) / 100 : si.smoo;
shape = hslider("[2]Shape [unit:%]", 20, 0, 100, 1) / 100 : si.smoo;
pan   = hslider("[3]Pan [unit:%]", 100, 0, 100, 1) / 100 : si.smoo;
wave(ph) = os.oscp(rate, ph) : sh with { sh(s) = s * (1 - shape) + ma.signum(s) * shape; };
g(ph) = 1 - depth * (0.5 + 0.5 * wave(ph));
// (229) Pan swings on an equal-power law: the level doesn't dip as it passes the centre (it fell 3 dB there)
pk = 1 + (sqrt(2) - 1) * (1 - depth);   // (unity at Depth 0, a constant level at 100)
th = (0.25 + 0.25 * wave(0) * depth) * ma.PI;
process = _, _ : *(g(0) * (1 - pan) + cos(th) * pk * pan), *(g(0) * (1 - pan) + sin(th) * pk * pan);
