#!/bin/bash
# (181) CI: the app's output latency with a real sound server (null sink): PulseAudio, then PipeWire, each with the
# app as it is and with the low-latency settings main.js can apply. Never fails the build.
set -x
OUT=${1:-/tmp/nb-lat}; mkdir -p "$OUT"
BIN=$(command -v nate-bloom || echo "/opt/Nate Bloom/nate-bloom")
pip install -q playwright
export XDG_RUNTIME_DIR=/tmp/nbxdg; mkdir -p $XDG_RUNTIME_DIR; chmod 700 $XDG_RUNTIME_DIR
run() {   # LABEL, then env and args for the app
  L=$1; shift
  pkill -f "^/opt/Nate Bloom/nate-bloom" 2>/dev/null; sleep 3
  rm -rf "$HOME/.config/Nate Bloom/site"
  env NB_NO_UPDATE=1 NB_DEBUG=1 "$@" xvfb-run -a -s "-screen 0 1366x800x24" "$BIN" --no-sandbox --disable-gpu --remote-debugging-port=9337 > "$OUT/app_$L.txt" 2>&1 &
  sleep 8
  timeout 90 python3 linux/ci/latency_check.py 9337 "$L" >> "$OUT/checks.txt" 2>&1
  pkill -f "^/opt/Nate Bloom/nate-bloom" 2>/dev/null; sleep 2
}
sudo apt-get install -y pulseaudio > "$OUT/apt.txt" 2>&1
pulseaudio -D --exit-idle-time=-1 --log-target=file:$OUT/pulse.log; sleep 2
pactl load-module module-null-sink sink_name=nbnull >> "$OUT/pactl.txt" 2>&1; pactl set-default-sink nbnull; pactl info >> "$OUT/pactl.txt" 2>&1
run pulse
run pulse_env10 PULSE_LATENCY_MSEC=10
run pulse_low256 NB_LOW_LATENCY=256
run pulse_low128 NB_LOW_LATENCY=128
pulseaudio -k; sleep 2
sudo apt-get install -y pipewire pipewire-pulse wireplumber >> "$OUT/apt.txt" 2>&1
(pipewire > "$OUT/pw.log" 2>&1 &); sleep 1; (pipewire-pulse > "$OUT/pwp.log" 2>&1 &); (wireplumber > "$OUT/wp.log" 2>&1 &); sleep 3
pactl load-module module-null-sink sink_name=nbnull >> "$OUT/pactl_pw.txt" 2>&1; pactl set-default-sink nbnull; pactl info >> "$OUT/pactl_pw.txt" 2>&1
run pipewire
run pipewire_env PIPEWIRE_LATENCY=256/48000
run pipewire_low256 NB_LOW_LATENCY=256
run pipewire_low128 NB_LOW_LATENCY=128
cat "$OUT/checks.txt"
exit 0
