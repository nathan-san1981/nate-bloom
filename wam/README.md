# Plugins (Web Audio Modules)

Nate Bloom hosts Web Audio Modules 2.0, the web's plugin format.

## Nate Bloom's own (natebloom/)

Written in Faust and compiled to WebAssembly with the Faust compiler (libfaust-wasm from
github.com/grame-cncm/faustwasm): `node natebloom/build.mjs <libfaust-wasm folder>` rebuilds every plugin folder from
`natebloom/src/*.dsp` and writes `natebloom/catalog-natebloom.json`. `natebloom/lib/nbfaust.js` runs a compiled DSP
in an AudioWorklet as a WAM (effects: one instance; instruments: a pool of voices played by timed MIDI events), and
`natebloom/lib/panel.js` is the knob panel. Built on the Faust libraries: the Zita reverb (Fons Adriaensen; Faust
version by Julius O. Smith III), the Dattorro plate (Jakob Zerbian), the physical models (Romain Michon and others)
and the ladder filter (Dario Sanfilippo).

- Effects: Hall, Plate, Cloud, Tape Echo, Ensemble, Juno Chorus, Tape, Lo-Fi, Ladder Filter, Bus Compressor,
  Auto-Pan, Ring Mod
- Instruments: Marimba, Nylon Guitar, Violin, Flute, Clarinet, Voice

## The community collection

The other plugins in this folder are the built versions published in the npm packages `wam-community` 0.4.9 and `burns-audio-wam` 0.2.54, gathered by the
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
