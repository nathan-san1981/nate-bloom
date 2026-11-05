declare name "Nylon Guitar";
declare description "A physical model of a classical guitar string and body; pluck it near the bridge for bite or near the middle for warmth; let go and the string is damped";
import("stdfaust.lib");
freq = hslider("freq", 440, 20, 8000, 0.01);
gain = hslider("gain", 0.8, 0, 1, 0.01);
gate = button("gate");
pluck = hslider("[0]Pluck position [unit:%]", 80, 5, 95, 1) / 100 : si.smoo;
tone  = hslider("[1]Tone [unit:Hz][scale:log]", 7000, 800, 18000, 1) : si.smoo;
level = hslider("[2]Level [unit:%]", 80, 0, 100, 1) / 100 : si.smoo;
body  = hslider("[3]Body [unit:%]", 50, 0, 100, 1) / 100 : si.smoo;
rel   = hslider("[4]Release [unit:ms][scale:log]", 400, 20, 4000, 1) / 1000;
// (225) the guitar body: its air and top resonances (about 100, 200 and 400 Hz) under the string; a softer pluck
// is darker; letting go damps the string over Release
bodyf = _ <: _, (fi.resonbp(98, 6, 1) + fi.resonbp(204, 8, 0.7) + fi.resonbp(392, 10, 0.45)) * 1.4 : (_ * (1 - body * 0.5)), (_ * body) :> _;
damp = en.asr(0.001, 1, rel, gate);
toneV = tone * (0.4 + 0.6 * gain);
process = pm.nylonGuitar(freq : pm.f2l, pluck, gain, gate) : bodyf : fi.lowpass(2, toneV) : *(damp) : *(level * 4);
