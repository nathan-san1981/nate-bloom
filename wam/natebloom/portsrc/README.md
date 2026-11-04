# Sources of the ported plugins

`dx7/` is Pop 89 (`pop89.cpp`) on Dexed's DX7 engine: Google's msfa core (Apache-2.0, Copyright 2012 Google Inc.,
2016-2025 Pascal Gauthier) and Dexed's `EngineMkI` (GPL-3, Pascal Gauthier), from https://github.com/asb2m10/dexed.
Changes for WebAssembly: standard tuning only (no Scala files, no MTS-ESP), no console output. `rt.cpp` and
`mathf.cpp` are the small runtime the ports link against; `build-dx7.sh` builds `pop89.wasm` with clang and wasm-ld.
