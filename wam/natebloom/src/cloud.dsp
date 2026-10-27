declare name "Cloud";
declare description "A granular texture cloud: grains of what you play, scattered in time and pitch, fed back into themselves";
import("stdfaust.lib");
N = 6; MAXD = 131072;
size  = hslider("[0]Grain size [unit:ms][scale:log]", 140, 20, 600, 1);
dens  = hslider("[1]Density [unit:%]", 70, 5, 100, 1) / 100;
pmode = nentry("[2]Pitch [style:menu{'−12':0;'0':1;'+7':2;'+12':3;'0 / +12':4}]", 4, 0, 4, 1);
scat  = hslider("[3]Scatter [unit:%]", 45, 0, 100, 1) / 100;
fb    = hslider("[4]Feedback [unit:%]", 35, 0, 92, 1) / 100 : si.smoo;
spread= hslider("[5]Spread [unit:%]", 80, 0, 100, 1) / 100 : si.smoo;
mix   = hslider("[6]Mix [unit:%]", 40, 0, 100, 1) / 100 : si.smoo;
L = size * ma.SR / 1000;
ramp = os.lf_sawpos(1000 / size);
u(k) = no.noises(16, k) * 0.5 + 0.5;
grain(k, s) = s : de.fdelay(MAXD, max(64, d)) : *(w * on) <: *(pl), *(pr)
with {
  ph = ma.frac(ramp + k / N);
  trig = ph < ph';
  pos = u(k) : ba.sAndH(trig);
  on = (u(k + 6) < dens) : ba.sAndH(trig);
  coin = (u(k + 12) < 0.5) : ba.sAndH(trig);
  ratio = ba.selectn(5, pmode, 0.5, 1, 1.4983, 2, select2(coin, 1, 2));
  d = 64 + pos * scat * 1.4 * ma.SR + max(0, ratio - 1) * L - (ratio - 1) * ph * L;
  w = sin(ma.PI * ph) ^ 2;
  pan = (pos - 0.5) * spread;
  pl = sqrt(0.5 - pan * 0.5) * 1.41; pr = sqrt(0.5 + pan * 0.5) * 1.41;
};
grains(s) = s <: par(k, N, grain(k)) :> _, _ : *(g), *(g) with { g = 1.05 / sqrt(N * 0.5 * max(dens, 0.15)); };
fbpath(a, b) = (a + b) * 0.5 * fb * 0.62 : fi.lowpass(1, 6500) : fi.highpass(1, 80) : ma.tanh;

wet(l, r) = (l + r) * 0.5 : (+ : grains) ~ fbpath;
process = _, _ <: (_, _), wet : ro.interleave(2, 2) : par(i, 2, xf) with { xf(d, w) = d * cos(mix * ma.PI / 2) + w * sin(mix * ma.PI / 2); };
