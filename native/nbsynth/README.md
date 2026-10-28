# Nathan's plugin instruments, native

The apps' fast audio (Android AAudio, Linux miniaudio) can play Nathan's plugin instruments directly, for the
lowest latency. It runs the very same DSP as the web app: each `wam/natebloom/<id>/dsp.wasm` turned into C by
[wasm2c](https://github.com/WebAssembly/wabt/tree/main/wasm2c) (in `gen/`), with one small C API over them
(`nbsynth.c`, `nbsynth.h`) and the engine side (`nbsynth_host.h`). The output matches the web app's sample for
sample.

- `gen_nbsynth.py WASM2C ../../wam/natebloom gen` regenerates `gen/` and `nbsynth.c` after a plugin's DSP changes;
  move `gen/nbsynth.*` up one level afterwards.
- `wasm-rt*`: the wasm2c runtime (Apache 2.0, from WABT).
- The DSP uses WebAssembly SIMD, which [SIMD Everywhere](https://github.com/simd-everywhere/simde) (MIT) maps to
  NEON or SSE. The builds fetch it into `simde/` (see the Android and Linux workflows).
