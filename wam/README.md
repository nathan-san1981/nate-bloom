# Plugins (Web Audio Modules)

Nate Bloom hosts Web Audio Modules 2.0, the web's plugin format. The plugins in this folder are the built
versions published in the npm packages `wam-community` 0.4.9 and `burns-audio-wam` 0.2.54, gathered by the
"Gather WAM plugins" workflow (the untouched copies are on the `wam-vendor` branch). `catalog.json` lists the
ones Nate Bloom offers.

Authors and sources:
- **Sequencer Party** (Tom Burns): Synth-101, Spectrum: Modal, DRM-16 DrumComputer, Simple Delay, Simple
  Distortion, Simple EQ. https://github.com/boourns/burns-audio-wam (MIT)
- **Wimmics** (Université Côte d'Azur / Inria; Michel Buffa and the authors named in each plugin's
  `descriptor.json`): the amps, pedals, delays, reverbs, phasers and the WAM SDK in `wimmics/utils`.
  https://github.com/boourns/wam-community and https://github.com/micbuffa/WebAudioPlugins. The Faust
  sources (`*.dsp`) of the Faust-built plugins are kept next to them.

What was changed here:
- Demo pages, type declarations, documentation and thumbnails were left out (the plugins don't load them).
- `wimmics/utils/sdk-parammgr/src/sdk/src/` is a copy of `wimmics/utils/sdk/src/`: the published package
  imports from that path but doesn't include it.
- The DRM-16's starting kit loads `burns-audio/drumsampler/909/*.wav` (Nate Bloom's own 909, rendered by the
  app) when Nate Bloom sets `NB_WAM_909`; otherwise it loads its original samples from burns.ca.
