#!/bin/sh
# nb-box.service starts cage through this: on the 5" touch screen alone (no TV or monitor on HDMI) the mouse pointer
# is hidden, by giving cage and the app an invisible cursor theme (/usr/share/icons/nb-none). With a TV it shows.
# HIDE_CURSOR=yes|no in /etc/nb-box.conf overrides (yes = always hidden, no = always shown).
want=$(sed -n 's/^HIDE_CURSOR=//p' /etc/nb-box.conf 2>/dev/null)
if [ -z "$want" ] || [ "$want" = auto ]; then
  want=no
  i=0; while [ $i -lt 5 ] && ! grep -qx connected /sys/class/drm/card*-DSI-*/status 2>/dev/null; do i=$((i + 1)); sleep 1; done
  grep -qx connected /sys/class/drm/card*-DSI-*/status 2>/dev/null && ! grep -qx connected /sys/class/drm/card*-HDMI-*/status 2>/dev/null && want=yes
fi
if [ "$want" = yes ] && [ -d /usr/share/icons/nb-none/cursors ]; then export XCURSOR_THEME=nb-none XCURSOR_SIZE=24; fi
exec "$@"
