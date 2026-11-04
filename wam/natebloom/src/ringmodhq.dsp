declare name "Ring Mod";
declare description "A ring modulator for bells, metallic shimmer and alien drones: a sine, triangle, square or saw carrier with a slow drift, and a sweep that moves it, free or in time with the song";
import("stdfaust.lib");
freq  = hslider("[0]Frequency [unit:Hz][scale:log]", 220, 1, 3000, 0.1) : si.smooth(0.999);
drift = hslider("[1]Drift [unit:%]", 15, 0, 100, 1) / 100 : si.smoo;
mix   = hslider("[2]Mix [unit:%]", 40, 0, 100, 1) / 100 : si.smoo;
wave  = nentry("[3]Wave", 0, 0, 3, 1);
sweep = hslider("[4]Sweep [unit:%]", 0, 0, 100, 1) / 100 : si.smoo;
srate = hslider("[5]Sweep rate [unit:Hz][scale:log]", 0.5, 0.02, 12, 0.01);
sync  = nentry("[6]Sync", 0, 0, 9, 1);
bpm   = hslider("bpm", 120, 20, 400, 0.01);
beats = ba.selectn(10, sync, 0, 4, 2, 1, 0.5, 0.25, 1.5, 0.75, 2/3, 1/3);
shz = select2(sync > 0, srate, bpm / 60 / max(0.01, beats));
sw = pow(2, os.osc(shz) * sweep * 2);   // up to two octaves either way
cf(ph) = min(9000, freq * sw * (1 + drift * 0.08 * os.osc(0.13 + ph * 0.05)));
car(ph) = ba.selectn(4, wave, os.oscp(cf(ph), ph), os.triangle(cf(ph)), os.square(cf(ph)), os.sawtooth(cf(ph)));
process = _, _ <: (_, _), (*(car(0)), *(car(1.1))) : ro.interleave(2, 2) : par(i, 2, xf) with { xf(d, w) = d * (1 - mix) + w * mix; };
