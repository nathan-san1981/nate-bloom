#!/usr/bin/env bash
# Nate Bloom Box: turns a fresh Raspberry Pi OS Lite (64-bit) on a Raspberry Pi 5 into the box.
#   curl -fsSL https://raw.githubusercontent.com/nathan-san1981/nate-bloom/main/box/install.sh | bash
# Options (after "bash -s --" when piped):  --chromium   use the browser kiosk instead of the ARM64 app
#                                            --dsi0       the screen's ribbon is in the Pi's port 0 (default: port 1)
#                                            --rotate N   90 (default) or 270, whichever way the screen sits in the case
#                                            --no-reboot  don't reboot at the end
# Safe to run again: every file it writes is replaced, every config.txt line sits in one marked block.
set -euo pipefail

REPO="nathan-san1981/nate-bloom"
RAW="https://raw.githubusercontent.com/$REPO/main/box"
DEB_URL="https://github.com/$REPO/releases/download/pi-latest/NateBloom-pi-arm64.deb"
MODE=app DSI=1 ROTATE=90 REBOOT=1
while [ $# -gt 0 ]; do
  case "$1" in
    --chromium) MODE=chromium ;;
    --dsi0) DSI=0 ;;
    --rotate) shift; ROTATE="${1:-90}" ;;
    --no-reboot) REBOOT=0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$ROTATE" in 90|270) ;; *) echo "--rotate takes 90 or 270" >&2; exit 2 ;; esac

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$*"; }

[ "$(id -u)" -ne 0 ] || { echo "Run this as your normal user (it uses sudo itself), not as root." >&2; exit 1; }
BOXUSER="$(id -un)"
[ "$(uname -m)" = aarch64 ] || { echo "This needs 64-bit Raspberry Pi OS (aarch64); this is $(uname -m)." >&2; exit 1; }
MODEL="$(tr -d '\0' </proc/device-tree/model 2>/dev/null || echo unknown)"
case "$MODEL" in *"Raspberry Pi 5"*) ;; *) warn "Built for a Raspberry Pi 5; this is: $MODEL. Carrying on." ;; esac
. /etc/os-release
say "Nate Bloom Box setup for $BOXUSER on $MODEL ($PRETTY_NAME)"

SRC=""
if [ -f "$(dirname "$0")/session.sh" ]; then SRC="$(cd "$(dirname "$0")" && pwd)"; fi   # (run from a clone: use its files)
fetch() {   # fetch NAME DEST
  if [ -n "$SRC" ]; then sudo install -m "${3:-0644}" "$SRC/$1" "$2"
  else curl -fsSL "$RAW/$1" -o /tmp/nb-box-$$ && sudo install -m "${3:-0644}" /tmp/nb-box-$$ "$2" && rm -f /tmp/nb-box-$$; fi
}

say "Packages"
sudo apt-get update -qq
PKGS="cage wlr-randr pipewire pipewire-pulse pipewire-alsa wireplumber rtkit alsa-utils curl ca-certificates iw rfkill fonts-noto-core"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $PKGS

if [ "$MODE" = app ]; then
  say "Nate Bloom for the Pi (ARM64 app)"
  if curl -fsSL "$DEB_URL" -o /tmp/NateBloom-pi-arm64.deb; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq /tmp/NateBloom-pi-arm64.deb
    rm -f /tmp/NateBloom-pi-arm64.deb
  else
    warn "The ARM64 app package isn't published yet; using the browser kiosk instead."
    warn "Run this script again later to switch to the app."
    MODE=chromium
  fi
fi
if [ "$MODE" = chromium ]; then
  say "Browser kiosk (fallback)"
  CHR=chromium; apt-cache show chromium >/dev/null 2>&1 || CHR=chromium-browser
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$CHR" git python3
  sudo rm -rf /opt/nb-box/site.new && sudo mkdir -p /opt/nb-box
  sudo git clone -q --depth 1 --filter=blob:none --sparse "https://github.com/$REPO.git" /opt/nb-box/site.new
  sudo git -C /opt/nb-box/site.new sparse-checkout set --no-cone /index.html /manifest.webmanifest /sw.js /icon-192.png /icon-512.png /snd/ /inst/ /wam/ /stage/
  sudo rm -rf /opt/nb-box/site && sudo mv /opt/nb-box/site.new /opt/nb-box/site
fi

say "The box's files"
sudo mkdir -p /usr/local/lib/nb-box
fetch session.sh /usr/local/lib/nb-box/session.sh 0755
fetch nb-box-helper /usr/local/sbin/nb-box-helper 0755
fetch nb-box.service /tmp/nb-box.service.$$
sudo sed "s/__USER__/$BOXUSER/g" /tmp/nb-box.service.$$ | sudo tee /etc/systemd/system/nb-box.service >/dev/null; sudo rm -f /tmp/nb-box.service.$$
fetch nb-box-cpu.service /etc/systemd/system/nb-box-cpu.service
sudo tee /etc/nb-box.conf >/dev/null <<EOF
# Nate Bloom Box settings (Box… in the app changes ROTATE and SCALE; MODE is app or chromium)
MODE=$MODE
ROTATE=$ROTATE
SCALE=1.333
BOXUSER=$BOXUSER
EOF

say "Sound: PipeWire at 48 kHz with small buffers, the USB headphone cable first"
sudo mkdir -p /etc/pipewire/pipewire.conf.d /etc/pipewire/pipewire-pulse.conf.d /etc/wireplumber/wireplumber.conf.d /etc/wireplumber/main.lua.d
fetch pipewire-nb-box.conf /etc/pipewire/pipewire.conf.d/10-nb-box.conf
fetch pipewire-pulse-nb-box.conf /etc/pipewire/pipewire-pulse.conf.d/10-nb-box.conf
fetch wireplumber-nb-box.conf /etc/wireplumber/wireplumber.conf.d/51-nb-box.conf   # (WirePlumber 0.5, Trixie)
fetch wireplumber-nb-box.lua /etc/wireplumber/main.lua.d/51-nb-box.lua             # (WirePlumber 0.4, Bookworm)
sudo tee /etc/security/limits.d/95-nb-box-audio.conf >/dev/null <<'EOF'
# real-time audio for the box's user (the app's audio thread asks rtkit; these are the ceilings)
@audio   -  rtprio   95
@audio   -  memlock  unlimited
@audio   -  nice     -10
EOF
sudo usermod -aG audio,video,input,render,plugdev "$BOXUSER"

say "The screen (Touch Display 2, 5\") and USB power"
CFG=/boot/firmware/config.txt; [ -f "$CFG" ] || CFG=/boot/config.txt
sudo cp -n "$CFG" "$CFG.before-nb-box" 2>/dev/null || true
sudo sed -i '/^# >>> nb-box/,/^# <<< nb-box/d' "$CFG"
sudo sed -i 's/^dtoverlay=vc4-kms-v3d$/dtoverlay=vc4-kms-v3d,noaudio/' "$CFG"   # (no HDMI sound devices: the USB cable is the only output)
OVL="dtoverlay=vc4-kms-dsi-ili9881-5inch"; [ "$DSI" = 0 ] && OVL="$OVL,dsi0"   # (landscape is done in session.sh, so touch turns with it)
sudo tee -a "$CFG" >/dev/null <<EOF
# >>> nb-box (Nate Bloom Box: written by box/install.sh, replaced when it runs again)
[all]
$OVL
usb_max_current_enable=1
disable_splash=1
# <<< nb-box
EOF

say "Tuning: CPU at full speed, logs in memory, Wi-Fi without power saving, idle services off"
sudo mkdir -p /etc/systemd/journald.conf.d /etc/NetworkManager/conf.d
printf '[Journal]\nStorage=volatile\nRuntimeMaxUse=32M\n' | sudo tee /etc/systemd/journald.conf.d/nb-box.conf >/dev/null
printf '[connection]\nwifi.powersave = 2\n' | sudo tee /etc/NetworkManager/conf.d/nb-box-wifi.conf >/dev/null
for u in cups.service cups-browsed.service ModemManager.service triggerhappy.service dphys-swapfile.service \
         apt-daily.timer apt-daily-upgrade.timer man-db.timer e2scrub_all.timer; do
  sudo systemctl disable --now "$u" >/dev/null 2>&1 || true   # (ones this system doesn't have are skipped)
done

say "Permissions: the app may run the box helper (and nothing else) as root"
echo "$BOXUSER ALL=(root) NOPASSWD: /usr/local/sbin/nb-box-helper" | sudo tee /etc/sudoers.d/nb-box >/dev/null
sudo chmod 0440 /etc/sudoers.d/nb-box
sudo visudo -cf /etc/sudoers.d/nb-box >/dev/null

say "Start on power-up"
sudo systemctl daemon-reload
sudo systemctl enable nb-box-cpu.service nb-box.service >/dev/null
sudo systemctl set-default graphical.target >/dev/null
sudo systemctl disable getty@tty1.service >/dev/null 2>&1 || true

say "Done ($MODE mode). Plug in the MiniLab and the headphone cable."
if [ "$REBOOT" = 1 ]; then echo "Rebooting in 5 seconds (Ctrl+C to stay)…"; sleep 5; sudo reboot; else echo "Reboot when ready: sudo reboot"; fi
