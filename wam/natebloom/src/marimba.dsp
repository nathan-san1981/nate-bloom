declare name "Marimba";
declare description "A physical model of a marimba: a wooden bar with fifty vibrating modes over a tuned tube resonator, struck with a mallet you can soften or harden";
import("stdfaust.lib");
freq = hslider("freq", 440, 20, 8000, 0.01);
gain = hslider("gain", 0.8, 0, 1, 0.01);
gate = button("gate");
hard   = hslider("[0]Mallet [unit:%]", 45, 0, 100, 1) / 100;
decay  = hslider("[1]Decay [unit:s][scale:log]", 1.4, 0.15, 6, 0.01);
bright = hslider("[2]Brightness [unit:Hz][scale:log]", 6500, 400, 18000, 1);
pos    = hslider("[3]Strike position", 1, 0, 4, 1);
level  = hslider("[4]Level [unit:%]", 80, 0, 100, 1) / 100 : si.smoo;
// longer ring on low notes, as on the real instrument
t60 = decay * min(2, max(0.35, 260 / freq));
process = pm.strikeModel(10, bright, 0.15 + hard * 2.5, gain, gate) : pm.marimbaBarModel(freq, pos, t60, 1, 5) : pm.marimbaResTube(freq : pm.f2l) : *(level * 1.6);
