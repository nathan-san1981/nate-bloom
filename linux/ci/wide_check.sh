#!/bin/bash
# (175) CI: the installed app turning Across both screens on and off, and its X11 helper (xspan.py) answering from
# inside the packaged app. A virtual screen can't show what Cinnamon does with two real monitors; this checks the
# plumbing: one 3840 screen split into two RandR monitors if xrandr manages it, then two X screens joined by
# Xinerama. Never fails the build.
set -x
OUT=${1:-/tmp/nb-wide}; mkdir -p "$OUT"
BIN=$(command -v nate-bloom || echo "/opt/Nate Bloom/nate-bloom")
sudo apt-get install -y x11-xserver-utils > "$OUT/apt.txt" 2>&1
pip install -q playwright
run() {   # LABEL XVFB-ARGS…
  L=$1; shift
  pkill -f "^/opt/Nate Bloom/nate-bloom" 2>/dev/null; sleep 2   # (the smoke test's app, still open, would take the start over)
  Xvfb :55 "$@" -nolisten tcp > "$OUT/xvfb_$L.txt" 2>&1 & XV=$!
  sleep 2; export DISPLAY=:55
  if [ "$L" = randr ]; then xrandr --setmonitor A 1920/508x1080/286+0+0 screen >> "$OUT/xrandr_$L.txt" 2>&1; xrandr --setmonitor B 1920/508x1080/286+1920+0 none >> "$OUT/xrandr_$L.txt" 2>&1; fi
  xrandr --listmonitors >> "$OUT/xrandr_$L.txt" 2>&1
  rm -f "$HOME/.config/Nate Bloom/window.json"
  NB_FASTPADS_NULL=1 NB_DEBUG=1 "$BIN" --no-sandbox --remote-debugging-port=9334 > "$OUT/app_$L.txt" 2>&1 & APP=$!
  sleep 8
  timeout 90 python3 linux/ci/wide_check.py 9334 "$OUT" "$L" >> "$OUT/checks.txt" 2>&1
  kill $APP 2>/dev/null; pkill -f "^/opt/Nate Bloom/nate-bloom" 2>/dev/null; sleep 2; kill $XV 2>/dev/null; sleep 1
}
run randr -screen 0 3840x1080x24
run xinerama -screen 0 1920x1080x24 -screen 1 1920x1080x24 +xinerama
cat "$OUT/checks.txt"
exit 0
