#!/bin/sh
# Runs inside cage (nb-box.service): turns the 5" panel to landscape, then starts Nate Bloom full screen.
# The app shows the home screen (Nate Bloom, Keys, Listen, Radio, Sheets, Stream, Media, Retro, Games). Stream, Media and
# Retro are programs of their own: the app writes "stream", "media" or "retro" into /run/nb-box/next and quits, this runs that program, and when it closes
# (or the power button is pressed) the app comes back on the home screen. When the app closes without asking for
# anything, this script ends, cage exits and systemd starts it all again.
set -a; . /etc/nb-box.conf; set +a   # (exported: the programs run through outside.sh see STREAM_* too)
# Kodi, Moonlight and RetroArch run through outside.sh: in a small labwc with an on-screen Home button over them
OUTSIDE=/usr/local/lib/nb-box/outside.sh
outside() { if [ -x "$OUTSIDE" ]; then "$OUTSIDE" "$1"; else sh -c "$1"; fi; }
ROTATE="${ROTATE:-90}"
SCALE="${SCALE:-auto}"   # (the app's zoom: auto = 1.333 on the 5" panel, so pages read at arm's length, and 1 on a TV or
                          # monitor at its own resolution; 1.25 / 1.333 / 1.5 force one. Never a forced device scale: under cage a
                          # fractional one draws the page into a corner of a big screen)

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
RUN=/run/nb-box; NEXT="$RUN/next"
mkdir -p "$RUN" 2>/dev/null || true
rm -f "$NEXT" "$RUN/home"
if [ "${MODE:-app}" = app ] && command -v nate-bloom >/dev/null 2>&1; then
  START=""   # (the first time: /etc/nb-box.conf's START decides, normally the home screen)
  [ "${START_AT_BOOT:=$(sed -n 's/^START=//p' /etc/nb-box.conf)}" = stream ] && command -v moonlight-qt >/dev/null 2>&1 && START=streamboot
  while :; do
    nb_start="$START"; START=""
    if [ -f "$NEXT" ]; then nb_start=$(head -c 16 "$NEXT" | tr -cd 'a-z'); rm -f "$NEXT"; fi
    case "$nb_start" in
      streamboot)   # power-on straight into the game on the GPU box (box/stream-setup.sh --boot-into-stream)
        i=0; while [ $i -lt 15 ] && ! tailscale ping -c 1 --timeout 2s "${STREAM_HOST:-gpu-box}" >/dev/null 2>&1; do i=$((i + 1)); sleep 1; done
        outside 'QT_QPA_PLATFORM=wayland moonlight-qt stream "${STREAM_HOST:-gpu-box}" "${STREAM_APP:-Steam Big Picture}" --display-mode fullscreen \
          --resolution "${STREAM_RES:-1280x720}" --fps "${STREAM_FPS:-60}" --bitrate "${STREAM_BITRATE:-12000}" --video-codec "${STREAM_CODEC:-HEVC}"' || true
        START=home; continue ;;
      stream)   # Moonlight: games streamed from the PC (controller-driven; power button = home)
        outside 'QT_QPA_PLATFORM=wayland moonlight-qt' || true
        START=home; continue ;;
      media)    # Kodi
        outside 'kodi --windowing=wayland' || true   # (no plain-kodi fallback: Home closing it would start it again)
        START=home; continue ;;
      retro)    # RetroArch with the core and game the Retro page picked (/run/nb-box/retro); power button = home
        CORE=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["core"])' "$RUN/retro" 2>/dev/null)
        ROM=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["rom"])' "$RUN/retro" 2>/dev/null)
        rm -f "$RUN/retro"
        export CORE ROM
        [ -n "$CORE" ] && [ -f "$ROM" ] && outside 'retroarch --fullscreen -L "$CORE" "$ROM"' || true
        START=home; continue ;;
    esac
    NB_BOX_START="$nb_start" NB_BOX_ZOOM="$SCALE" nate-bloom --box --ozone-platform=wayland
    rc=$?
    [ -f "$NEXT" ] || exit $rc
  done
fi

# fallback: the website's own files from /opt/nb-box/site in the browser, served on this machine only
cd /opt/nb-box/site || exit 1
python3 -m http.server 8080 --bind 127.0.0.1 >/dev/null 2>&1 &
sleep 1
CHR=$(command -v chromium || command -v chromium-browser)
exec "$CHR" --kiosk --ozone-platform=wayland --noerrdialogs --no-first-run --disable-translate --disable-sync \
  --autoplay-policy=no-user-gesture-required --enable-gpu-rasterization --ignore-gpu-blocklist \
  --disable-features=AudioServiceOutOfProcess,Translate --disable-background-timer-throttling \
  --disable-renderer-backgrounding --audio-buffer-size=256 --password-store=basic \
  --user-data-dir="$HOME/.config/nb-box-chromium" "http://127.0.0.1:8080/?box=1"
