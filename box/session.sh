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

# Screens. cage puts every screen side by side and stretches the one window across all of them, so with the 5" panel
# and a TV both plugged in, part of each page landed on the other screen (the menu came out too wide on the TV). One
# screen at a time instead: a TV or monitor on HDMI gets the picture while it's plugged in and the panel goes dark;
# unplug it and the panel comes back. SCREEN= in /etc/nb-box.conf: auto (that), panel (the 5" panel only) or hdmi.
# What's showing goes to /run/nb-box/display ("tv", "monitor" or "panel", then the zoom): the app reads it to size
# its pages, outside.sh to size the Home button over games.
RUN=/run/nb-box
mkdir -p "$RUN" 2>/dev/null || true
# the panel is portrait (720 x 1280); the box is landscape. cage maps touch to the output, so touch turns with it.
i=0
while [ $i -lt 20 ]; do
  OUT=$(wlr-randr 2>/dev/null | awk '/^DSI/ {print $1; exit}')
  [ -n "$OUT" ] && break
  i=$((i + 1)); sleep 0.25
done
[ -n "$OUT" ] && wlr-randr --output "$OUT" --transform "$ROTATE" || true
# a 4K TV: 1080p at 60 Hz instead of its preferred 4K (the Pi 5 does 4K at 30 Hz at most: choppy, and the pages come
# out small). HDMI_MODE= in /etc/nb-box.conf picks another (e.g. 1280x720@60Hz), or "native" keeps the TV's own.
hdmi_mode() {
  [ "${HDMI_MODE:=1920x1080@60Hz}" != native ] || return 0
  CUR=$(wlr-randr 2>/dev/null | awk -v o="$1" '$1 == o {f = 1; next} /^[^ ]/ {f = 0} f && /current/ {print $1; exit}')
  W=${CUR%%x*}
  [ -n "$W" ] && [ "$W" -gt "${HDMI_MODE%%x*}" ] && wlr-randr --output "$1" --mode "$HDMI_MODE" 2>/dev/null || true
}
# a TV across the room (a screen 70 cm wide or more, from its EDID): SCALE=auto zooms the pages to the 960 x 540 layout
# they're drawn for, as on the 5" panel, so a 1080p TV gets everything twice the size (zoom 2). A desk monitor keeps 1.
screen_info() {   # prints "tv 2.000", "monitor 1" or "panel 1.333": what's showing now and its zoom
  wlr-randr 2>/dev/null | awk -v scale="$SCALE0" '
    /^[^ ]/ { hd = ($1 ~ /^HDMI/) } hd && /Enabled: yes/ { hon = 1 }
    hd && /Physical size:/ { split($3, a, "x"); mm = a[1] + 0 }
    hd && /current/ { split($1, r, "x"); h = r[2] + 0 }
    END { z = (scale ~ /^[0-9.]+$/) ? scale : "";
      if (hon && mm >= 700 && h >= 720) print "tv", (z != "" ? z : sprintf("%.3f", h / 540));
      else if (hon) print "monitor", (z != "" ? z : 1);
      else print "panel", (z != "" ? z : 1.333) }'
}
out_on() { echo "$R" | awk -v o="$1" '$1 == o {f = 1; next} /^[^ ]/ {f = 0} f && /Enabled:/ {print $2; exit}'; }
screens() {   # one screen at a time (quick when nothing changed)
  R=$(wlr-randr 2>/dev/null) || return 0
  D=$(echo "$R" | awk '/^DSI/ {print $1; exit}'); H=$(echo "$R" | awk '/^HDMI/ {print $1; exit}')
  WANT=panel
  case "${SCREEN:-auto}" in panel) ;; *) [ -n "$H" ] && WANT=hdmi ;; esac
  [ -z "$D" ] && [ -n "$H" ] && WANT=hdmi
  if [ "$WANT" = hdmi ]; then
    [ "$(out_on "$H")" = yes ] || wlr-randr --output "$H" --on 2>/dev/null
    hdmi_mode "$H"
    [ -n "$D" ] && [ "$(out_on "$D")" = yes ] && wlr-randr --output "$D" --off 2>/dev/null
  elif [ -n "$D" ]; then
    [ "$(out_on "$D")" = yes ] || wlr-randr --output "$D" --on --transform "$ROTATE" 2>/dev/null
    [ -n "$H" ] && [ "$(out_on "$H")" = yes ] && wlr-randr --output "$H" --off 2>/dev/null
  fi
  I=$(screen_info); [ "$I" = "$(cat "$RUN/display" 2>/dev/null)" ] || echo "$I" > "$RUN/display"
}
SCALE0="$SCALE"
screens
case "$(cat "$RUN/display" 2>/dev/null)" in tv*) export NB_TV=1 ;; esac   # (outside.sh: a bigger Home button over Kodi, Moonlight and RetroArch)
[ "$SCALE" = auto ] && SCALE=$(cut -d" " -f2 "$RUN/display" 2>/dev/null)
# a TV plugged in or out later: looked at every 2 s for as long as cage runs (the app follows within a second)
( while sleep 2; do [ -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] || exit 0; screens; done ) &
SCR_PID=$!
trap 'kill $SCR_PID 2>/dev/null' EXIT
trap 'kill $SCR_PID 2>/dev/null; exit 143' TERM HUP INT

export NB_BOX=1
# the native synth engine: its own thread plus two workers on the Pi 5's four cores (the desktop default leaves three
# cores to other programs; the box has none). The fourth core keeps the browser's audio thread and the screen.
export NB_ENG_THREADS="${NB_ENG_THREADS:-3}"
NEXT="$RUN/next"
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
