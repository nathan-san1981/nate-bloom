{
  "targets": [
    {
      "target_name": "nbfastpads",
      "sources": ["nb_fastpads_linux.cc"],
      "cflags_cc": ["-std=c++17", "-O2", "-fexceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "defines": ["NAPI_VERSION=8"],
      "libraries": ["-ldl", "-lpthread", "-lm"]
    }
  ]
}
