declare name "Ensemble";
declare description "The three-voice string-machine ensemble chorus: slow swirl plus fast shimmer, the sound of a Solina, an ARP Omni and Vangelis-era pads";
import("stdfaust.lib");
depth = hslider("[0]Depth [unit:%]", 70, 0, 100, 1) / 100 : si.smoo;
speed = hslider("[1]Speed [unit:%]", 50, 0, 100, 1) / 100 : si.smoo;
width = hslider("[2]Width [unit:%]", 90, 0, 100, 1) / 100 : si.smoo;
mix   = hslider("[3]Mix [unit:%]", 55, 0, 100, 1) / 100 : si.smoo;
slow = 0.35 + speed * 0.9; fast = 4.2 + speed * 4;
tap(i, x) = x : de.fdelay(4096, (0.0065 + depth * (0.0026 * os.oscp(slow, i * 2 * ma.PI / 3) + 0.00045 * os.oscp(fast, i * 2 * ma.PI / 3 + 1))) * ma.SR);
wet(l, r) = m <: tap(0), tap(1), tap(2) : lr with {
  m = (l + r) * 0.5;
  lr(a, b, c) = (a + b * 0.6 + c * (1 - width)) * 0.62, (c + b * 0.6 + a * (1 - width)) * 0.62;
};
process = _, _ <: (_, _), (wet : fi.lowpass(1, 9000), fi.lowpass(1, 9000)) : ro.interleave(2, 2) : par(i, 2, xf) with { xf(d, w) = d * (1 - mix) + w * mix * 1.3; };
