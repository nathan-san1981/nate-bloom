#!/bin/bash
# Run on the laptop. Installs the newest tandem_*.deb from Downloads on all three machines and restarts Tandem
# on each, so nothing keeps running the old version. The GPU box is skipped (with a note) if it's asleep.
# Passwords: the laptop's sudo, then the Beelink's and the GPU box's.
DEB=$(ls -t ~/Downloads/tandem_*_all*.deb 2>/dev/null | head -1)
[ -s "$DEB" ] || { echo "No tandem_*.deb in Downloads."; exit 1; }
REMOTE='sudo apt install -y /tmp/tandem-new.deb >/dev/null && sudo systemctl restart tandem-worker; echo ">>> $(hostname): Tandem $(dpkg-query -W -f="\${Version}" tandem)"'

echo "=== $(hostname): installing $(basename "$DEB") ==="
sudo apt install -y "$DEB" >/dev/null || exit 1
if systemctl list-unit-files tandem-worker.service 2>/dev/null | grep -q tandem-worker; then
  sudo systemctl restart tandem-worker
else  # the laptop: restart the desktop agent so it runs the new code
  pkill -f "tandem.py agent"; sleep 1
  # over SSH (e.g. from the iPhone) there's no desktop session in the environment: borrow the logged-in one
  if [ -z "${DISPLAY:-}" ]; then
    export DISPLAY=:0 XDG_RUNTIME_DIR=/run/user/$(id -u)
    export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
  fi
  setsid -f tandem agent >/dev/null 2>&1
fi
echo ">>> $(hostname): Tandem $(dpkg-query -W -f='${Version}' tandem)"

for M in beelink gpubox; do
  echo "=== $M ==="
  if ! ssh -o BatchMode=yes -o ConnectTimeout=5 $M true 2>/dev/null; then
    echo "  $M didn't answer (asleep?). Wake it (wake-gpubox) and run this again."; continue
  fi
  scp -q "$DEB" $M:/tmp/tandem-new.deb && ssh -t $M "$REMOTE"
done
echo "Reload the Tandem pages in the browser (F5)."
