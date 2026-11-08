#!/bin/bash
# stream-pi-setup.sh — Raspberry Pi 5 handheld: Moonlight straight at boot (console, no desktop), Tailscale,
# Wi-Fi power saving off, controller mapping hook.
# Usage (on the Pi, as your user):
#   bash stream-pi-setup.sh            install / repair (safe to re-run)
#   bash stream-pi-setup.sh --desktop  keep the desktop and start Moonlight inside it instead of the console
#   bash stream-pi-setup.sh --check    verification checklist only
# Host defaults to the GPU box's Tailscale address; override: STREAM_HOST=10.77.0.51 bash stream-pi-setup.sh
set -uo pipefail
HOST=${STREAM_HOST:-100.65.30.77}
MODE=install; DESKTOP=0
for a in "$@"; do case $a in --check) MODE=check;; --desktop) DESKTOP=1;; esac; done
U=$(id -un); FAIL=0; REBOOT=()
ok()   { printf '  \e[32m✓\e[0m %s\n' "$*"; }
bad()  { printf '  \e[31m✗\e[0m %s\n' "$*"; FAIL=1; }
note() { printf '  • %s\n' "$*"; }
hdr()  { printf '\n\e[1m== %s\e[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] && { echo "Run as your user (it uses sudo where needed), not as root."; exit 1; }
. /etc/os-release
MARK_B='# >>> moonlight-autostart >>>'; MARK_E='# <<< moonlight-autostart <<<'

check() {
  hdr "Checklist"
  local model; model=$(tr -d '\0' </proc/device-tree/model 2>/dev/null)
  [[ $model == *"Raspberry Pi 5"* ]] && ok "$model, $PRETTY_NAME" || bad "not a Pi 5 ($model)"
  command -v moonlight-qt >/dev/null && ok "moonlight-qt $(dpkg-query -W -f='${Version}' moonlight-qt 2>/dev/null)" || bad "moonlight-qt missing"
  if [ $DESKTOP -eq 1 ] || grep -qs moonlight-qt "$HOME/.config/labwc/autostart"; then
    grep -qs moonlight-qt "$HOME/.config/labwc/autostart" && ok "Moonlight starts with the desktop (labwc)" || bad "labwc autostart missing"
  else
    grep -qsF "$MARK_B" "$HOME/.bash_profile" && ok "Moonlight starts on tty1 after console auto-login" || bad "autostart block missing in ~/.bash_profile"
    [ "$(systemctl get-default)" = multi-user.target ] && ok "boots to console (no desktop)" || bad "boots to desktop: re-run install (or use --desktop)"
    ls /etc/systemd/system/getty@tty1.service.d/*autologin* >/dev/null 2>&1 && ok "console auto-login on tty1" || bad "no tty1 auto-login"
  fi
  id -nG | grep -qw render && id -nG | grep -qw input && ok "$U in video/render/input/audio" || bad "groups missing (reboot after install)"
  [ -f /etc/NetworkManager/conf.d/90-wifi-powersave-off.conf ] && ok "Wi-Fi power saving off" || bad "Wi-Fi power saving still on"
  iw dev 2>/dev/null | awk '/Interface/{i=$2} /channel/{print "    Wi-Fi " i ": " $0}' | head -2
  [ -f "$HOME/.config/gamecontroller.txt" ] && ok "custom controller mapping: ~/.config/gamecontroller.txt" \
    || note "no custom controller mapping (fine for Xbox/PS/8BitDo pads; see 'sdl2-jstest --list')"
  if tailscale status >/dev/null 2>&1; then
    ok "Tailscale up: $(tailscale ip -4 | head -1)"
    local tp; tp=$(timeout 15 tailscale ping -c 3 "$HOST" 2>&1 | tail -1)
    [[ $tp == *"via DERP"* ]] && note "path to $HOST is RELAYED ($tp): playable but adds latency" \
      || { [[ $tp == *pong* ]] && ok "path to $HOST: $tp" || bad "tailscale ping $HOST failed: $tp"; }
  else bad "Tailscale not logged in: sudo tailscale up"; fi
  (exec 3<>/dev/tcp/"$HOST"/47989) 2>/dev/null && ok "Sunshine reachable at $HOST:47989" || bad "Sunshine not reachable at $HOST:47989"
  echo; [ $FAIL -eq 0 ] && echo "All checks passed." || echo "Some checks failed (see ✗ above)."
}

install() {
  hdr "Preflight"
  local model; model=$(tr -d '\0' </proc/device-tree/model 2>/dev/null)
  [[ $model == *"Raspberry Pi 5"* ]] || { echo "This is for a Raspberry Pi 5 ($model). Stop."; exit 1; }
  ok "$model, $PRETTY_NAME"
  sudo -v || exit 1
  sudo apt-get update -qq
  sudo apt-get install -y curl iw >/dev/null 2>&1

  hdr "Moonlight"
  if command -v moonlight-qt >/dev/null; then ok "already installed"
  else
    curl -1sLf 'https://dl.cloudsmith.io/public/moonlight-game-streaming/moonlight-qt/setup.deb.sh' \
      | sudo -E distro=raspbian codename="$VERSION_CODENAME" bash >/dev/null 2>&1
    sudo apt-get install -y moonlight-qt >/dev/null 2>&1 && ok "moonlight-qt installed" \
      || { echo "moonlight-qt install failed (no package for $VERSION_CODENAME?). Tell Claude."; exit 1; }
  fi
  sudo apt-get install -y sdl2-jstest >/dev/null 2>&1 || sudo apt-get install -y sdl-jstest >/dev/null 2>&1 || true
  for g in video render input audio; do id -nG | grep -qw $g || { sudo usermod -aG $g "$U"; REBOOT+=("group $g"); }; done
  ok "groups video/render/input/audio"

  hdr "Tailscale"
  command -v tailscale >/dev/null || { curl -fsSL https://tailscale.com/install.sh | sh >/dev/null 2>&1; }
  if tailscale status >/dev/null 2>&1; then ok "logged in: $(tailscale ip -4 | head -1)"
  else echo "  Log this Pi into Tailscale: open the URL below on your iPhone."; sudo tailscale up --hostname=pi5-handheld; fi

  hdr "Wi-Fi latency"
  printf '[connection]\nwifi.powersave = 2\n' | sudo tee /etc/NetworkManager/conf.d/90-wifi-powersave-off.conf >/dev/null
  sudo systemctl reload NetworkManager 2>/dev/null || true
  ok "Wi-Fi power saving off (it adds 20-100 ms spikes otherwise)"

  hdr "Start Moonlight at boot"
  if [ $DESKTOP -eq 1 ]; then
    sudo raspi-config nonint do_boot_behaviour B4 && ok "desktop auto-login"
    mkdir -p "$HOME/.config/labwc"
    grep -qs moonlight-qt "$HOME/.config/labwc/autostart" || echo 'moonlight-qt &' >> "$HOME/.config/labwc/autostart"
    ok "Moonlight starts with the desktop"
  else
    if [ "$(systemctl get-default)" != multi-user.target ] || ! ls /etc/systemd/system/getty@tty1.service.d/*autologin* >/dev/null 2>&1; then
      sudo raspi-config nonint do_boot_behaviour B2 && REBOOT+=("console auto-login")
    fi
    ok "console auto-login on tty1 (desktop no longer starts at boot)"
    touch "$HOME/.bash_profile"
    sed -i "/$MARK_B/,/$MARK_E/d" "$HOME/.bash_profile"
    cat >> "$HOME/.bash_profile" <<EOF
$MARK_B
# Moonlight full screen on the handheld's own console. SSH logins are unaffected.
# Shell instead: ssh in, then  touch ~/.no-moonlight; pkill moonlight-qt   (rm the file to bring it back)
if [ "\$(tty)" = /dev/tty1 ] && [ -z "\${SSH_CONNECTION:-}" ]; then
  [ -f "\$HOME/.config/gamecontroller.txt" ] && export SDL_GAMECONTROLLERCONFIG="\$(cat "\$HOME/.config/gamecontroller.txt")"
  while [ ! -e "\$HOME/.no-moonlight" ]; do moonlight-qt; sleep 2; done
fi
$MARK_E
EOF
    # a ~/.bash_profile stops bash reading ~/.profile (PATH, .bashrc): keep it in the chain
    if ! grep -q '\.profile' "$HOME/.bash_profile"; then
      { echo '[ -f ~/.profile ] && . ~/.profile'; cat "$HOME/.bash_profile"; } > "$HOME/.bash_profile.new" && mv "$HOME/.bash_profile.new" "$HOME/.bash_profile"
    fi
    ok "Moonlight launches on tty1 and relaunches if closed"
  fi

  check
  echo
  [ ${#REBOOT[@]} -gt 0 ] && echo "REBOOT needed (${REBOOT[*]}): sudo reboot"
  echo "Then in Moonlight: + (add host) → $HOST → select it → note the PIN → on the GPU box: sunshine-pin <PIN> pi5"
}

if [ "$MODE" = check ]; then check; else install; fi
