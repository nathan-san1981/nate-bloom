#!/bin/bash
# CI (pi.yml): install the ARM64 .deb, start it the way the box does (--box) on a 1280x720 virtual screen, and check
# over DevTools that the page came up in the Box layout with Play open; a screenshot goes into the logs.
set -x
OUT=${1:-/tmp/nb-box}; mkdir -p "$OUT"
DEB=$(ls linux/dist/NateBloom-pi-*.deb | head -1)
sudo apt-get install -y -qq xvfb > /dev/null 2>&1
sudo apt-get install -y "./$DEB" > "$OUT/install.txt" 2>&1; tail -5 "$OUT/install.txt"
BIN=$(command -v nate-bloom || echo "/opt/Nate Bloom/nate-bloom")
export NB_FASTPADS_NULL=1 NB_DEBUG=1 NB_NO_UPDATE=1
xvfb-run -a -s "-screen 0 1280x720x24" "$BIN" --box --no-sandbox --remote-debugging-port=9334 > "$OUT/app.log" 2>&1 &
APP=$!
sleep 15
pip install -q playwright
python3 linux/ci/box_check.py 9334 "$OUT" > "$OUT/checks.txt" 2>&1
cat "$OUT/checks.txt"
kill $APP 2>/dev/null; sleep 2
grep -v "dbus\|DBus" "$OUT/app.log" | tail -40
exit 0
