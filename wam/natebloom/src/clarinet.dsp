declare name "Clarinet";
declare description "A physical model of a clarinet: reed stiffness and bell opening shape a woody, hollow tone";
import("stdfaust.lib");
freq = hslider("freq", 440, 20, 8000, 0.01);
gain = hslider("gain", 0.8, 0, 1, 0.01);
gate = button("gate");
att   = hslider("[0]Attack [unit:ms][scale:log]", 30, 2, 1500, 1) / 1000;
rel   = hslider("[1]Release [unit:ms][scale:log]", 120, 10, 3000, 1) / 1000;
reed  = hslider("[2]Reed [unit:%]", 50, 0, 100, 1) / 100 : si.smoo;
bell  = hslider("[3]Bell [unit:%]", 50, 0, 100, 1) / 100 : si.smoo;
vib   = hslider("[4]Vibrato [unit:%]", 25, 0, 100, 1) / 100 : si.smoo;
level = hslider("[5]Level [unit:%]", 70, 0, 100, 1) / 100 : si.smoo;
env = en.asr(att, 1, rel, gate) * (0.55 + gain * 0.3);   // (blown much harder the reed squeals and drops out)
vel = 0.4 + gain * 0.6;
blow = pm.blower(env, 0.05, 2000, 5, vib * 0.012);
process = pm.clarinetModel(freq : pm.f2l, blow, reed, bell) * level * vel * 1.05;
