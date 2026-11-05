declare name "Marimba";
declare description "A physical model of a marimba: a wooden bar with fifty vibrating modes over a tuned tube resonator, struck with a mallet you can soften or harden; harder hits sound harder";
import("stdfaust.lib");
freq = hslider("freq", 440, 20, 8000, 0.01);
gain = hslider("gain", 0.8, 0, 1, 0.01);
gate = button("gate");
hard   = hslider("[0]Mallet [unit:%]", 45, 0, 100, 1) / 100;
decay  = hslider("[1]Decay [unit:s][scale:log]", 1.4, 0.15, 6, 0.01);
bright = hslider("[2]Brightness [unit:Hz][scale:log]", 6500, 400, 18000, 1);
pos    = hslider("[3]Strike position", 1, 0, 4, 1);
level  = hslider("[4]Level [unit:%]", 80, 0, 100, 1) / 100 : si.smoo;
velsens = hslider("[5]Velocity [unit:%]", 60, 0, 100, 1) / 100;
tube   = hslider("[6]Resonator [unit:%]", 100, 0, 100, 1) / 100 : si.smoo;
// longer ring on low notes, as on the real instrument
t60 = decay * min(2, max(0.35, 260 / freq));
// (225) how hard you play: a harder hit is a harder, brighter mallet as well as louder
v = 1 - velsens + velsens * gain;
sharp = 0.15 + (hard * 0.75 + gain * velsens * 0.25) * 2.5;
cut = bright * (0.45 + 0.55 * v);
bar = pm.strikeModel(10, cut, sharp, gain, gate) : pm.marimbaBarModel(freq, pos, t60, 1, 5);
process = bar <: _, (pm.marimbaResTube(freq : pm.f2l)) : *(1 - tube), *(tube) :> *(level * 1.6);
