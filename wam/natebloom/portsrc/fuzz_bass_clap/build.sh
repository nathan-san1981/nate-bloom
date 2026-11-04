#!/bin/bash
# Fuzz Bass II for Bitwig (CLAP, Linux x86-64): the Nate Bloom port's DSP (fb_dsp.h, from ../fuzz_bass/wrap.cpp with
# its controls per instance) behind a small CLAP wrapper. Needs the CLAP headers (github.com/free-audio/clap, include/).
# GPL-3 (jc303's diode ladder, Ultramaster KR-106's half-band filters).
set -e
CLAP_INC=${CLAP_INC:-$HOME/clap/include}
H=$(cd "$(dirname "$0")" && pwd)
g++ -O2 -std=c++17 -shared -fPIC -fvisibility=hidden -static-libstdc++ -static-libgcc -Wl,--exclude-libs,ALL -w \
  -I"$CLAP_INC" -I"$H/../fuzz_bass" -I"$H/../kr106" -I"$H" "$H/fbclap.cpp" "$H/../fuzz_bass/dfl_DiodeLadderFilter.cpp" -o FuzzBass2.clap
echo "built FuzzBass2.clap: copy it to ~/.clap/"
