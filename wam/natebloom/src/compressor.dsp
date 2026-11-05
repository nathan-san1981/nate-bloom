declare name "Bus Compressor";
declare description "Glue for the whole mix: a stereo-linked compressor (on the louder side, 6 dB soft knee) with soft attack, auto-free release and a parallel Mix for New York-style compression";
import("stdfaust.lib");
thresh = hslider("[0]Threshold [unit:dB]", -18, -40, 0, 0.1);
ratio  = hslider("[1]Ratio", 3, 1, 12, 0.1);
att    = hslider("[2]Attack [unit:ms][scale:log]", 10, 0.3, 80, 0.1) / 1000;
rel    = hslider("[3]Release [unit:ms][scale:log]", 160, 30, 1200, 1) / 1000;
makeup = hslider("[4]Makeup [unit:dB]", 4, 0, 18, 0.1) : ba.db2linear : si.smoo;
mix    = hslider("[5]Mix [unit:%]", 100, 0, 100, 1) / 100 : si.smoo;
// (229) linked on the louder side (the library's stereo compressor added the two sides, so it heard a centred sound
// 6 dB too loud and squashed it about 3.5 dB more than the Ratio said), with a 6 dB soft knee
knee = 6;
gc(x) = select3((o > -knee / 2) + (o >= knee / 2), 0, (1 / ratio - 1) * (o + knee / 2) ^ 2 / (2 * knee), (1 / ratio - 1) * o) with { o = x - thresh; };
gain(l, r) = max(abs(l), abs(r)) : an.amp_follower_ar(att, rel) : max(1e-6) : ba.linear2db : gc : ba.db2linear;
comp(l, r) = l * g * makeup, r * g * makeup with { g = gain(l, r); };
process = _, _ <: (_, _), comp : ro.interleave(2, 2) : par(i, 2, xf) with { xf(d, w) = d * (1 - mix) + w * mix; };
