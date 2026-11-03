#!/bin/bash
# (187) CI: the Bitwig bridge in the installed app (see bridge_check.py): the plugin is installed into ~/.clap, a small
# real-time CLAP host (bridgetest/mini.cc) plays it, and what comes back is checked for sound and timing. Never fails
# the build.
set -x
OUT=${1:-/tmp/nb-bridge}; mkdir -p "$OUT"
BIN=$(command -v nate-bloom || echo "/opt/Nate Bloom/nate-bloom")
pip install -q playwright numpy
g++ -std=c++17 -O2 -I linux/native/third_party/clap/include linux/ci/bridgetest/mini.cc -o /tmp/nb-mini -ldl > "$OUT/build_mini.txt" 2>&1
pkill -f "^/opt/Nate Bloom/nate-bloom" 2>/dev/null; sleep 2
rm -f "$HOME/.config/Nate Bloom/window.json"; rm -rf "$HOME/.config/Nate Bloom/site"
NB_NO_UPDATE=1 NB_FASTPADS_NULL=1 NB_DEBUG=1 xvfb-run -a -s "-screen 0 1366x800x24" "$BIN" --no-sandbox --disable-gpu --remote-debugging-port=9338 > "$OUT/app.txt" 2>&1 &
sleep 10
ls -la "$HOME/.clap" /dev/shm > "$OUT/files.txt" 2>&1
timeout 240 python3 linux/ci/bridge_check.py 9338 "$OUT" /tmp/nb-mini > "$OUT/checks.txt" 2>&1
cat "$OUT/checks.txt"
pkill -f "^/opt/Nate Bloom/nate-bloom" 2>/dev/null; sleep 1
grep -iv "dbus" "$OUT/app.txt" | tail -20
exit 0
