declare name "Ring Mod";
declare description "A ring modulator: bell tones, metallic shimmer and alien drones, with a slow drift on the carrier";
import("stdfaust.lib");
freq  = hslider("[0]Frequency [unit:Hz][scale:log]", 220, 1, 3000, 0.1) : si.smooth(0.999);
drift = hslider("[1]Drift [unit:%]", 15, 0, 100, 1) / 100 : si.smoo;
mix   = hslider("[2]Mix [unit:%]", 40, 0, 100, 1) / 100 : si.smoo;
car(ph) = os.oscp(freq * (1 + drift * 0.08 * os.osc(0.13 + ph * 0.05)), ph);
process = _, _ <: (_, _), (*(car(0)), *(car(1.1))) : ro.interleave(2, 2) : par(i, 2, xf) with { xf(d, w) = d * (1 - mix) + w * mix; };
