#!/bin/bash
# (175) CI: the installed app on a virtual 3840x1080 screen split into two 1920 monitors (RandR monitors), with no window
# manager and then with Cinnamon's (muffin) if it installs, turning Across both screens on and off. Never fails the build.
set -x
OUT=${1:-/tmp/nb-wide}; mkdir -p "$OUT"
BIN=$(command -v nate-bloom || echo "/opt/Nate Bloom/nate-bloom")
sudo apt-get install -y x11-xserver-utils > "$OUT/apt.txt" 2>&1
sudo apt-get install -y muffin dbus-x11 >> "$OUT/apt.txt" 2>&1 || echo "no muffin" >> "$OUT/apt.txt"
pip install -q playwright
run() {   # LABEL WM
  Xvfb :55 -screen 0 3840x1080x24 -nolisten tcp > "$OUT/xvfb_$1.txt" 2>&1 & XV=$!
  sleep 2; export DISPLAY=:55
  xrandr --setmonitor A 1920/508x1080/286+0+0 screen; xrandr --setmonitor B 1920/508x1080/286+1920+0 none
  xrandr --listmonitors > "$OUT/monitors_$1.txt" 2>&1
  WMP=""
  if [ "$2" = muffin ] && command -v muffin >/dev/null; then dbus-launch muffin --replace > "$OUT/wm_$1.txt" 2>&1 & WMP=$!; sleep 3; fi
  rm -f "$HOME/.config/Nate Bloom/window.json"
  NB_FASTPADS_NULL=1 NB_DEBUG=1 "$BIN" --no-sandbox --remote-debugging-port=9334 > "$OUT/app_$1.txt" 2>&1 & APP=$!
  sleep 8
  timeout 90 python3 linux/ci/wide_check.py 9334 "$OUT" "$1" >> "$OUT/checks.txt" 2>&1
  kill $APP 2>/dev/null; sleep 2; [ -n "$WMP" ] && kill $WMP 2>/dev/null; kill $XV 2>/dev/null; sleep 1
}
run nowm none
run muffin muffin
cat "$OUT/checks.txt"
exit 0
