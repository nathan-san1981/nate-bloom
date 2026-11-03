#!/bin/bash
# (176) CI: the installed app's native synth engine (see native_check.py). Never fails the build.
set -x
OUT=${1:-/tmp/nb-native}; mkdir -p "$OUT"
BIN=$(command -v nate-bloom || echo "/opt/Nate Bloom/nate-bloom")
pip install -q playwright
pkill -f "^/opt/Nate Bloom/nate-bloom" 2>/dev/null; sleep 2
rm -f "$HOME/.config/Nate Bloom/window.json"; rm -rf "$HOME/.config/Nate Bloom/site"   # (the smoke test cached the website's page; this checks the one in the app)
NB_NO_UPDATE=1 NB_FASTPADS_NULL=1 NB_DEBUG=1 xvfb-run -a -s "-screen 0 1366x800x24" "$BIN" --no-sandbox --remote-debugging-port=9335 > "$OUT/app.txt" 2>&1 &
sleep 10
timeout 120 python3 linux/ci/native_check.py 9335 "$OUT" > "$OUT/checks.txt" 2>&1
cat "$OUT/checks.txt"
pkill -f "^/opt/Nate Bloom/nate-bloom" 2>/dev/null; sleep 1
grep -iv "dbus" "$OUT/app.txt" | tail -20
exit 0
