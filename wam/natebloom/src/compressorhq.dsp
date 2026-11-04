declare name "Bus Compressor";
declare description "Glue for the whole mix on Airwindows Pressure4's gain computer (Chris Johnson, MIT): its program-dependent attack, which clamps faster the harder it is hit, then the release you set, Ratio, Makeup, an Airwindows Console-style saturation and a parallel Mix";
// (203, the Linux app's Bus Compressor) Pressure4's gain computer (the side it actually runs: its flip never toggles),
// transcribed from airwindows/plugins/LinuxVST/src/Pressure4. Threshold sets Pressure, Release sets Speed. Its own release
// slows down the louder the signal still is (many seconds at bus levels), so here the gain comes back at the Release knob's rate. Ratio takes
// part of its gain reduction (all of it at 12:1); Console is ConsoleChannel's sine saturation, blended in.
import("stdfaust.lib");
thresh = hslider("[0]Threshold [unit:dB]", -18, -40, 0, 0.1);
ratio  = hslider("[1]Ratio", 3, 1, 12, 0.1);
rel    = hslider("[2]Release [unit:ms][scale:log]", 160, 30, 1200, 1) / 1000;
makeup = hslider("[3]Makeup [unit:dB]", 4, 0, 18, 0.1) : ba.db2linear : si.smoo;
cons   = hslider("[4]Console [unit:%]", 30, 0, 100, 1) / 100 : si.smoo;
mix    = hslider("[5]Mix [unit:%]", 100, 0, 100, 1) / 100 : si.smoo;
thr = sqrt(ba.db2linear(thresh));                       // Pressure4's threshold (it compares after its own make-up of 1/thr)
spdB = max(0, min(1, 1 - log(rel / 0.03) / log(40)));   // Release 30 ms..1.2 s -> Speed 1..0
release = pow(1.28 - spdB, 5) * 32768 / (ma.SR / 44100);
fastest = sqrt(release);
// state kept as offsets from Pressure4's starting values (speed 10000, coefficient 1), since Faust's state starts at 0
gc(l, r) = (step ~ (_, _)) : (!, _) with {
  sense = max(abs(l), abs(r)) / thr;
  step(ds, dc) = spd2 - 10000, c2 - 1 with {
    spd = ds + 10000; c = dc + 1;
    over = sense > thr;
    att = sqrt(abs(spd));
    cA = (c * (att - 1) + max(thr, thr / max(sense, 1e-9))) / att;
    cB = c + (1 - c) * (1 - exp(-1 / (rel * ma.SR)));
    c2 = select2(over, cB, cA);
    spd2 = (spd * (spd - 1) + abs(sense * release) + fastest) / spd;
  };
} : +(1) : (^(2)) : max(1e-4);                            // mewiness 1: the coefficient squared
console(x) = x * (1 - cons) + s * cons with { a = min(abs(x), ma.PI / 2); s = ma.signum(x) * sin(a); };
comp(l, r) = l * g, r * g with { g = gc(l, r) : pow(_, 1 - 1 / ratio) : *(makeup); };
process = _, _ <: (_, _), (comp : console, console) : ro.interleave(2, 2) : par(i, 2, xf) with { xf(d, w) = d * (1 - mix) + w * mix; };
