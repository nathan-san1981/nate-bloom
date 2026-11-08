#!/bin/sh
# Runs inside cage (nb-box.service): turns the 5" panel to landscape, then starts Nate Bloom full screen.
# When Nate Bloom exits, cage exits and systemd starts it all again.
. /etc/nb-box.conf
ROTATE="${ROTATE:-90}"
SCALE="${SCALE:-1.333}"   # (1280 x 720 on 5": the page drawn at 960 x 540, so text reads at arm's length)

# the panel is portrait (720 x 1280); the box is landscape. cage maps touch to the output, so touch turns with it.
i=0
while [ $i -lt 20 ]; do
  OUT=$(wlr-randr 2>/dev/null | awk '/^DSI/ {print $1; exit}')
  [ -n "$OUT" ] && break
  i=$((i + 1)); sleep 0.25
done
[ -n "$OUT" ] && wlr-randr --output "$OUT" --transform "$ROTATE" || true

export NB_BOX=1
# the native synth engine: its own thread plus two workers on the Pi 5's four cores (the desktop default leaves three
# cores to other programs; the box has none). The fourth core keeps the browser's audio thread and the screen.
export NB_ENG_THREADS="${NB_ENG_THREADS:-3}"
if [ "${MODE:-app}" = app ] && command -v nate-bloom >/dev/null 2>&1; then
  exec nate-bloom --box --ozone-platform=wayland --force-device-scale-factor="$SCALE"
fi

# fallback: the website's own files from /opt/nb-box/site in the browser, served on this machine only
cd /opt/nb-box/site || exit 1
python3 -m http.server 8080 --bind 127.0.0.1 >/dev/null 2>&1 &
sleep 1
CHR=$(command -v chromium || command -v chromium-browser)
exec "$CHR" --kiosk --ozone-platform=wayland --force-device-scale-factor="$SCALE" --noerrdialogs --no-first-run --disable-translate --disable-sync \
  --autoplay-policy=no-user-gesture-required --enable-gpu-rasterization --ignore-gpu-blocklist \
  --disable-features=AudioServiceOutOfProcess,Translate --disable-background-timer-throttling \
  --disable-renderer-backgrounding --audio-buffer-size=256 --password-store=basic \
  --user-data-dir="$HOME/.config/nb-box-chromium" "http://127.0.0.1:8080/?box=1"
