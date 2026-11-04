#!/bin/bash
# build-port.sh ID → out/ID.wasm from ID/wrap.cpp (+ ID/*.cpp), with the KR-106 headers on the include path
set -e
ID=$1; P=$(cd "$(dirname "$0")" && pwd); mkdir -p $P/out $P/obj/$ID
INC="-isystem $P/sys -isystem /usr/include/c++/13 -isystem /usr/include/x86_64-linux-gnu/c++/13 -isystem /usr/include -isystem /usr/include/x86_64-linux-gnu"
FL="--target=wasm32 -O3 -std=c++17 -fno-exceptions -fno-rtti -nostdinc++ -ffast-math -fno-math-errno -msimd128 -DNB_WASM=1 -I$P/kr106 -I$P/$ID -I$P $INC -Wno-everything"
objs=""
for f in $P/$ID/*.cpp $P/rt.cpp $P/mathf.cpp; do o=$P/obj/$ID/$(basename $f).o; clang++ $FL -c $f -o $o; objs="$objs $o"; done
wasm-ld --no-entry --allow-undefined --export=__wasm_call_ctors --export-dynamic -z stack-size=1048576 --initial-memory=4194304 --strip-all -o $P/out/$ID.wasm $objs
ls -la $P/out/$ID.wasm
