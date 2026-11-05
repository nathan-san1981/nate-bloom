#!/bin/bash
# buildclapfm.sh ID SRC.cpp → out/ID.wasm: a CLAP plugin with the 6-op FM core linked in (-DNB_FM6)
set -e
ID=$1; SRC=$2; EXTRA=$3; P=/tmp/claude-0/port; R=/home/claude/nate-bloom/wam/natebloom/portsrc; mkdir -p $P/out $P/obj/$ID
SYS="-isystem $P/sys -isystem /usr/include/c++/13 -isystem /usr/include/x86_64-linux-gnu/c++/13 -isystem /usr/include -isystem /usr/include/x86_64-linux-gnu"
FL="--target=wasm32 -O3 -std=c++17 -fno-exceptions -fno-rtti -nostdinc++ -ffast-math -fno-math-errno -msimd128 -DNB_WASM=1 -DNB_FM6=1 -I$P/clap -I/tmp/claude-0/plugsrc/nebula80/clap-sdk/include -I$R/fm6 -I$R/dx7 -I$(dirname $SRC) -I$R/duet80core $SYS -Wno-everything"
objs=""
DX="dx7note.cc env.cc exp2.cc fm_core.cc fm_op_kernel.cc freqlut.cc lfo.cc pitchenv.cc sin.cc EngineMkI.cpp porta.cpp"
for f in $P/clap/wrap.cpp $P/rt.cpp $P/mathf.cpp $SRC $R/fm6/fm6.cpp $EXTRA $(for d in $DX; do echo $R/dx7/$d; done); do o=$P/obj/$ID/$(basename $f).o; clang++ $FL -c $f -o $o; objs="$objs $o"; done
wasm-ld --no-entry --allow-undefined --export=__wasm_call_ctors -z stack-size=1048576 --initial-memory=8388608 --strip-all -o $P/out/$ID.wasm $objs
echo "$ID: $(stat -c %s $P/out/$ID.wasm) bytes"
