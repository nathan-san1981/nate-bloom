#!/bin/bash
# builddx.sh ID → out/ID.wasm from dx7/ID.cpp + Dexed's msfa/Mark I engine (dx7/*.cc)
set -e
ID=$1; P=$(cd "$(dirname "$0")" && pwd); mkdir -p $P/out $P/obj/dx7
SYS="-isystem $P/sys -isystem /usr/include/c++/13 -isystem /usr/include/x86_64-linux-gnu/c++/13 -isystem /usr/include -isystem /usr/include/x86_64-linux-gnu"
FL="--target=wasm32 -O3 -std=c++17 -fno-exceptions -fno-rtti -nostdinc++ -fno-math-errno -msimd128 -I$P/dx7 -I$P $SYS -Wno-everything"
objs=""
for f in $P/dx7/$ID.cpp $P/dx7/dx7note.cc $P/dx7/env.cc $P/dx7/exp2.cc $P/dx7/fm_core.cc $P/dx7/fm_op_kernel.cc $P/dx7/freqlut.cc $P/dx7/lfo.cc $P/dx7/pitchenv.cc $P/dx7/sin.cc $P/dx7/porta.cpp $P/dx7/EngineMkI.cpp $P/rt.cpp $P/mathf.cpp; do o=$P/obj/dx7/$(basename $f).o; clang++ $FL -c $f -o $o; objs="$objs $o"; done
wasm-ld --no-entry --allow-undefined --export=__wasm_call_ctors -z stack-size=1048576 --initial-memory=4194304 --strip-all -o $P/out/$ID.wasm $objs
ls -la $P/out/$ID.wasm
