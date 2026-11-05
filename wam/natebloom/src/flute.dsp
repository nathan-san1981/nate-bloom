declare name "Flute";
declare description "A physical model of a flute: breath, embouchure and vibrato that blooms as the note holds; breathy and soft or bright and pure";
import("stdfaust.lib");
freq = hslider("freq", 440, 20, 8000, 0.01);
gain = hslider("gain", 0.8, 0, 1, 0.01);
gate = button("gate");
att    = hslider("[0]Attack [unit:ms][scale:log]", 40, 2, 1500, 1) / 1000;
rel    = hslider("[1]Release [unit:ms][scale:log]", 160, 10, 3000, 1) / 1000;
breath = hslider("[2]Breath [unit:%]", 35, 0, 100, 1) / 100 : si.smoo;
mouth  = hslider("[3]Embouchure [unit:%]", 50, 10, 90, 1) / 100 : si.smoo;
vib    = hslider("[4]Vibrato [unit:%]", 40, 0, 100, 1) / 100 : si.smoo;
level  = hslider("[5]Level [unit:%]", 75, 0, 100, 1) / 100 : si.smoo;
env = en.asr(att, 1, rel, gate) * (0.85 + gain * 0.15);
vel = 0.25 + gain * 0.75;
// (225) vibrato that comes in after the attack, as a player's does; a softer note is breathier
vibEnv = en.asr(0.45, 1, 0.15, gate);
blow = pm.blower(env, breath * (0.08 + (1 - gain) * 0.08), 2000, 5, vib * 0.03 * vibEnv);
process = pm.fluteModel(freq : pm.f2l, mouth, blow) * level * vel * 0.9;
