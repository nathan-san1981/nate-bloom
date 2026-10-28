{
  "targets": [
    {
      "target_name": "nbfastpads",
      "sources": ["nb_fastpads_linux.cc", "../../native/nbsynth/nbsynth.c", "../../native/nbsynth/wasm-rt-impl.c", "../../native/nbsynth/wasm-rt-mem-impl.c", "../../native/nbsynth/wasm-rt-exceptions-impl.c", "../../native/nbsynth/gen/balladkit.c", "../../native/nbsynth/gen/duet80.c", "../../native/nbsynth/gen/fuzzbass.c", "../../native/nbsynth/gen/hypnagogia.c", "../../native/nbsynth/gen/nebula80.c", "../../native/nbsynth/gen/parafour.c", "../../native/nbsynth/gen/pop89.c", "../../native/nbsynth/gen/stab85.c", "../../native/nbsynth/gen/twin77.c", "../../native/nbsynth/gen/unicorndream.c"],
      "include_dirs": ["../../native/nbsynth", "../../native/nbsynth/gen", "../../native/nbsynth/simde"],
      "defines": ["NAPI_VERSION=8", "WASM_RT_INSTALL_SIGNAL_HANDLER=0", "WASM_RT_USE_MMAP=0", "WASM_RT_MEMCHECK_BOUNDS_CHECK=1"],
      "cflags": ["-O2"],
      "cflags_cc": ["-std=c++17", "-O2", "-fexceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "libraries": ["-ldl", "-lpthread", "-lm"]
    }
  ]
}
