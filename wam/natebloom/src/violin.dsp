declare name "Violin";
declare description "A bowed-string physical model through a violin body: the bow's pressure and position, a slow or sharp attack, and vibrato that grows as the note sustains";
import("stdfaust.lib");
freq = hslider("freq", 440, 20, 8000, 0.01);
gain = hslider("gain", 0.8, 0, 1, 0.01);
gate = button("gate");
att   = hslider("[0]Attack [unit:ms][scale:log]", 90, 2, 2000, 1) / 1000;
rel   = hslider("[1]Release [unit:ms][scale:log]", 300, 10, 4000, 1) / 1000;
press = hslider("[2]Bow pressure [unit:%]", 45, 0, 100, 1) / 100 : si.smoo;
pos   = hslider("[3]Bow position [unit:%]", 70, 5, 95, 1) / 100 : si.smoo;
vib   = hslider("[4]Vibrato [unit:%]", 45, 0, 100, 1) / 100 : si.smoo;
level = hslider("[5]Level [unit:%]", 75, 0, 100, 1) / 100 : si.smoo;
body  = hslider("[6]Body [unit:%]", 60, 0, 100, 1) / 100 : si.smoo;
env = en.asr(att, 1, rel, gate) * 0.72;
vel = 0.2 + gain * 0.8;
vibEnv = en.asr(0.6, 1, 0.2, gate);
f = freq * (1 + os.osc(5.4 + no.lfnoise(0.7) * 0.3) * vib * 0.0075 * vibEnv);
// (225) the body: the violin's main wood and air resonances (A0 ~280 Hz, B1 ~460 Hz, the bridge hill ~2.5 kHz); playing
// harder presses the bow harder
bodyf = _ <: _, (fi.resonbp(280, 5, 1) + fi.resonbp(460, 6, 0.8) + fi.resonbp(2500, 2, 0.6)) : (_ * (1 - body * 0.6)), (_ * body * 0.35) :> *(0.85);
process = pm.violinModel(f : pm.f2l, min(1, press * (0.75 + gain * 0.5)), env, pos) : bodyf : *(level * vel * 0.85);
