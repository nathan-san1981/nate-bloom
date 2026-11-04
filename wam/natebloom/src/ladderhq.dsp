declare name "Ladder Filter";
declare description "The Moog ladder as Antti Huovilainen modelled it: four saturating transistor stages with the feedback taken half a sample late, run at twice the sample rate, so it drives, squelches and self-oscillates like the real one. An LFO (free or in time with the song) and an envelope follower move the cutoff";
// (203, the Linux app's Ladder Filter) The Huovilainen model, as in MoogLadders (github.com/ddiakopoulos/MoogLadders,
// HuovilainenModel.h, after Huovilainen, "Non-linear digital implementation of the Moog ladder filter", DAFx 2004),
// with the thermal voltage normalised so the stages saturate at the signal's own level. Same knobs as the Ladder Filter,
// plus Sync and Shape for its LFO.
import("stdfaust.lib");
cut   = hslider("[0]Cutoff [unit:Hz][scale:log]", 1200, 40, 18000, 1) : si.smoo;
res   = hslider("[1]Resonance [unit:%]", 35, 0, 100, 1) / 100 : si.smoo;
rate  = hslider("[2]LFO rate [unit:Hz][scale:log]", 0.25, 0.02, 12, 0.01);
ldep  = hslider("[3]LFO depth [unit:%]", 40, 0, 100, 1) / 100 : si.smoo;
env   = hslider("[4]Envelope [unit:%]", 0, -100, 100, 1) / 100 : si.smoo;
drive = hslider("[5]Drive [unit:dB]", 0, 0, 18, 0.1) : ba.db2linear : si.smoo;
mix   = hslider("[6]Mix [unit:%]", 100, 0, 100, 1) / 100 : si.smoo;
sync  = nentry("[7]LFO sync", 0, 0, 9, 1);
wave  = nentry("[8]LFO shape", 0, 0, 4, 1);
bpm   = hslider("bpm", 120, 20, 400, 0.01);
beats = ba.selectn(10, sync, 0, 4, 2, 1, 0.5, 0.25, 1.5, 0.75, 2/3, 1/3);
lfoHz = select2(sync > 0, rate, bpm / 60 / max(0.01, beats));
phasor = (+(lfoHz / ma.SR) : ma.frac) ~ _;
shp(p) = ba.selectn(5, wave, sin(2 * ma.PI * p), 1 - 4 * abs(p - 0.5), 2 * p - 1, 1 - 2 * p, sh) with { sh = ba.sAndH(p < p', no.noise) : si.smooth(ba.tau2pole(0.004)); };
lfo(off) = shp(ma.frac(phasor + off)) * ldep * 0.22;
follow(l, r) = (abs(l) + abs(r)) * 0.5 : an.amp_follower_ar(0.005, 0.18) : min(1);
// one step of the model (state: stage delays d0-d3, the half-sample average d4/d5, the stages' tanh t0-t2)
huo(g, rq, x, d0, d1, d2, d3, d4, d5, t0, t1, t2) = n0, n1, n2, n3, n3, (n3 + d4) * 0.5, u0, u1, u2 with {
  n0 = d0 + g * (ma.tanh(x - rq * d5) - t0); u0 = ma.tanh(n0);
  n1 = d1 + g * (u0 - t1); u1 = ma.tanh(n1);
  n2 = d2 + g * (u1 - t2); u2 = ma.tanh(n2);
  n3 = d3 + g * (u2 - ma.tanh(d3));
};
ladder(fc, r) = (step2 ~ si.bus(9)) : (!, !, !, !, !, _, !, !, !) with {
  f = fc * 0.5; fc2 = f * f; fc3 = fc2 * f;
  fcr = 1.8730 * fc3 + 0.4955 * fc2 - 0.6490 * f + 0.9988;
  acr = -3.9364 * fc2 + 1.8409 * f + 0.9968;
  g = 1 - exp(-2 * ma.PI * f * fcr);
  rq = 4 * r * acr;
  step2(d0, d1, d2, d3, d4, d5, t0, t1, t2, x) = huo(g, rq, x, d0, d1, d2, d3, d4, d5, t0, t1, t2) : huo(g, rq, x);
};
f(x, off, e) = x * drive : ladder(fn, res * 1.06) : *((1 + res * 2.2) / sqrt(drive)) with {
  nf = max(0, min(1, log10(cut / 20) / 3 + lfo(off) + env * e * 0.35));
  fn = min(0.45, 20 * pow(1000, nf) / ma.SR);
};
wet(l, r) = f(l, 0, e), f(r, 0.5, e) with { e = follow(l, r); };
process = _, _ <: (_, _), wet : ro.interleave(2, 2) : par(i, 2, xf) with { xf(d, w) = d * (1 - mix) + w * mix; };
