# Sources of the ported plugins

`dx7/` is Pop 89 (`pop89.cpp`) on Dexed's DX7 engine: Google's msfa core (Apache-2.0, Copyright 2012 Google Inc.,
2016-2025 Pascal Gauthier) and Dexed's `EngineMkI` (GPL-3, Pascal Gauthier), from https://github.com/asb2m10/dexed.
Changes for WebAssembly: standard tuning only (no Scala files, no MTS-ESP), no console output. `rt.cpp` and
`mathf.cpp` are the small runtime the ports link against; `build-dx7.sh` builds `pop89.wasm` with clang and wasm-ld.

`unicorn_dream/` and `fuzz_bass/` are Unicorn Dream and Fuzz Bass (build 211). They use Ultramaster KR-106's IR3109
filter, BBD chorus and half-band resamplers (Karl LaRocca, GPL-3; the headers are in `kr106/`), Airwindows Galactic3
(Chris Johnson, MIT; `unicorn_dream/galactic3.h`) and jc303's diode ladder (midilab, GPL-3; `fuzz_bass/dfl_*`).
Build with `build-port.sh unicorn_dream` or `build-port.sh fuzz_bass`.

`junochorus/`, `tapeecho/`, `tape/` and `lofi/` (build 214) are the Juno Chorus on KR-106's BBD chorus, and Tape Echo,
Tape and Lo-Fi on Airwindows TapeDelay2, ToTape6 and DeRez2 (Chris Johnson, MIT). The `aw_*.h` headers are generated
from the Airwindows sources by `aw/awgen.py` (members, constructor and processReplacing unchanged; the float dither
dropped); TapeDelay2's two feedback lines are edited for ping-pong and in-loop saturation, marked in the header.
