#!/bin/sh
# (202) checks the Airwindows ports in src/app/890-airwindows.js sample by sample against the original C++
# (github.com/airwindows/airwindows, MIT). Needs git, g++ and node. Run from anywhere: sh linux/ci/airwindows/run.sh
set -e
cd "$(dirname "$0")"
[ -d airwindows ] || { git clone -q --depth 1 --filter=blob:none --sparse https://github.com/airwindows/airwindows.git && (cd airwindows && git sparse-checkout set plugins/LinuxVST/src/Density plugins/LinuxVST/src/DeRez2 plugins/LinuxVST/src/Pressure4 plugins/LinuxVST/src/Galactic plugins/LinuxVST/src/ToTape6); }
for n in Density DeRez2 Pressure4 Galactic ToTape6; do python3 gen.py $n && g++ -O2 -w -o $n $n.cc; done
node cmp.js
