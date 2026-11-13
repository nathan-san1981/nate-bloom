#!/bin/sh
# Nate Bloom Box: outside.sh 'COMMAND' runs Kodi, Moonlight or RetroArch inside a small labwc nested in cage, with the
# on-screen Home button (home-button.py) floating over it. labwc ends when the program does (-S), then session.sh
# brings the app back. Without labwc or the button's libraries, the program just runs as before.
# (COMMAND is run by sh -c, so variables exported by session.sh, like the ROM's path, are expanded there, spaces and all)
D=/usr/local/lib/nb-box
if [ -n "$NB_OUTSIDE_INNER" ]; then
  export QT_WAYLAND_DISABLE_WINDOWDECORATION=1   # (Moonlight: no title bar of its own)
  case "$(cat /run/nb-box/display 2>/dev/null)" in tv*) NB_TV=1 ;; panel*) NB_TV= ;; esac   # (what shows now: session.sh keeps it)
  NB_HOME_SCALE="${NB_TV:+2}" python3 "$D/home-button.py" >/dev/null 2>&1 &   # (twice the size on a TV)
  B=$!
  sh -c "$NB_OUTSIDE_CMD"
  rc=$?
  kill "$B" 2>/dev/null
  exit $rc
fi
export NB_OUTSIDE_CMD="$1"
if command -v labwc >/dev/null 2>&1 && python3 -c 'import gi; gi.require_version("GtkLayerShell", "0.1")' 2>/dev/null; then
  export NB_OUTSIDE_INNER=1; exec labwc -C "$D/labwc" -S "$0"
fi
exec sh -c "$NB_OUTSIDE_CMD"
