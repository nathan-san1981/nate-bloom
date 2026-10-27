#!/bin/bash
# CI: install the .deb the way Mint would, start the installed app on a virtual screen, and check it over its
# DevTools port. The runner has no sound card, so fast pads play into miniaudio's silent device.
set -x
OUT=${1:-/tmp/nb-smoke}; mkdir -p "$OUT"
DEB=$(ls linux/dist/NateBloom-*.deb | head -1)
sudo apt-get update -qq
sudo apt-get install -y "./$DEB" > "$OUT/install.txt" 2>&1; tail -5 "$OUT/install.txt"
dpkg -L nate-bloom > "$OUT/files.txt" 2>&1
cat /usr/share/applications/nate-bloom.desktop > "$OUT/desktop-entry.txt" 2>&1
BIN=$(command -v nate-bloom || echo "/opt/Nate Bloom/nate-bloom")
export NB_FASTPADS_NULL=1 NB_DEBUG=1
xvfb-run -a -s "-screen 0 1366x800x24" "$BIN" --no-sandbox --remote-debugging-port=9333 > "$OUT/app.log" 2>&1 &
APP=$!
sleep 10
pip install -q playwright
python3 linux/ci/lx_smoke.py 9333 "$OUT" > "$OUT/checks.txt" 2>&1
node linux/ci/save_check.mjs 9333 >> "$OUT/checks.txt" 2>&1
cat "$OUT/checks.txt"
# a second start reuses the window (single instance), and the app quits cleanly
DISPLAY=$(ls /tmp/.X11-unix 2>/dev/null | head -1 | sed "s/^X/:/") timeout 10 "$BIN" --no-sandbox > "$OUT/second.txt" 2>&1; echo "second start (hands over to the open window) exit $?" >> "$OUT/checks.txt"
kill $APP 2>/dev/null; sleep 2
grep -v "dbus\|DBus" "$OUT/app.log" | tail -30
exit 0
