#!/bin/bash
# stream-host-setup.sh — GPU box: Sunshine game streaming for Moonlight (iPhone, Pi 5 handheld).
#   Sunshine (NVENC + KMS capture), auto-login Cinnamon/X11 session at boot, screen lock/blanking off,
#   per-client resolution switching, Steam + "Steam Big Picture" and "Desktop" apps, firewall, Tandem play-mode hooks.
# Usage (on the GPU box, as nathan, over SSH is fine):
#   bash stream-host-setup.sh           install / repair (safe to re-run)
#   bash stream-host-setup.sh --check   verification checklist only
# Needs: an HDMI dummy plug in the GTX 1660 Ti (not the motherboard), then one reboot.
set -uo pipefail
MODE=install; [ "${1:-}" = "--check" ] && MODE=check
U=$(id -un); CONF="$HOME/.config/sunshine"; FAIL=0; REBOOT=()
ok()   { printf '  \e[32m✓\e[0m %s\n' "$*"; }
bad()  { printf '  \e[31m✗\e[0m %s\n' "$*"; FAIL=1; }
note() { printf '  • %s\n' "$*"; }
hdr()  { printf '\n\e[1m== %s\e[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] && { echo "Run as your user (it uses sudo where needed), not as root."; exit 1; }
. /etc/os-release
CODENAME=${UBUNTU_CODENAME:-$VERSION_CODENAME}

sunshine_unit() {
  systemctl --user list-unit-files --no-legend 2>/dev/null | awk '{print $1}' \
    | grep -iE '^(sunshine|app-dev\.lizardbyte\.app\.sunshine)\.service$' | head -1
}
xenv() {  # DISPLAY/XAUTHORITY of the running desktop session, for xrandr over SSH
  export DISPLAY=:0
  local xa; xa=$(ls /run/lightdm/"$U"/xauthority "$HOME/.Xauthority" 2>/dev/null | head -1)
  [ -n "$xa" ] && export XAUTHORITY="$xa"
}

check() {
  hdr "Checklist"
  local drv; drv=$(nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>/dev/null)
  [ -n "$drv" ] && ok "GPU/driver: $drv" || bad "nvidia-smi failed: NVIDIA driver not loaded"
  ok "OS: $PRETTY_NAME ($CODENAME)"
  [ "$(cat /sys/module/nvidia_drm/parameters/modeset 2>/dev/null)" = Y ] && ok "nvidia_drm modeset=1 (KMS capture possible)" \
    || bad "nvidia_drm modeset is off: re-run install, then reboot"
  local hd; hd=$(grep -l '^connected' /sys/class/drm/card*-HDMI-*/status /sys/class/drm/card*-DP-*/status 2>/dev/null | head -1)
  [ -n "$hd" ] && ok "display connected: $(basename "$(dirname "$hd")") (dummy plug seen)" \
    || bad "no display connected on the card: insert the HDMI dummy plug in the GTX 1660 Ti (physical access)"
  grep -qs "autologin-user=$U" /etc/lightdm/lightdm.conf.d/90-stream-autologin.conf && ok "lightdm auto-login → Cinnamon (X11)" \
    || bad "auto-login not configured"
  if dpkg -s sunshine >/dev/null 2>&1; then ok "Sunshine $(dpkg-query -W -f='${Version}' sunshine)"; else bad "Sunshine not installed"; fi
  getcap "$(readlink -f "$(command -v sunshine 2>/dev/null || echo /usr/bin/sunshine)")" 2>/dev/null | grep -q cap_sys_admin \
    && ok "cap_sys_admin set (KMS capture)" || bad "cap_sys_admin missing on sunshine"
  grep -qs '"username"' "$CONF/sunshine_state.json" && ok "web UI credentials set" || bad "no Sunshine credentials: re-run install"
  local unit; unit=$(sunshine_unit)
  if [ -n "$unit" ] && systemctl --user is-active -q "$unit"; then ok "Sunshine running ($unit)"
  else bad "Sunshine not running (it starts with the desktop session: reboot, or check: journalctl --user -u ${unit:-sunshine} -n 50)"; fi
  local ports; ports=$(ss -lntu 2>/dev/null | awk '{print $5}' | grep -oE ':(47984|47989|47990|48010|47998|47999|48000)$' | sort -u | tr '\n' ' ')
  [ -n "$ports" ] && ok "listening on$ports" || bad "Sunshine ports not listening"
  xenv; local mode; mode=$(xrandr --query 2>/dev/null | awk '/ connected/{c=$1} /\*/{print c, $1, $2; exit}')
  [ -n "$mode" ] && ok "desktop: $mode" || note "desktop display not readable over SSH yet (normal before first reboot)"
  id -nG | grep -qw input && ok "$U in input group (virtual controller)" || bad "$U not in input group yet (reboot)"
  if sudo -n true 2>/dev/null && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    sudo ufw status | grep -q 47984 && ok "ufw: Sunshine allowed from desk LAN + Tailscale" || bad "ufw active without Sunshine rules"
  else note "ufw inactive or not checkable without sudo: nothing blocks Sunshine locally"; fi
  local ts; ts=$(tailscale ip -4 2>/dev/null | head -1)
  [ -n "$ts" ] && ok "Tailscale up: $ts  (Moonlight host address)" || bad "Tailscale not up: sudo tailscale up"
  tailscale netcheck 2>/dev/null | grep -E 'UDP:|Nearest DERP' | sed 's/^\s*/    /'
  tailscale status 2>/dev/null | grep -iE 'iphone|pi|handheld' | sed 's/^/    peer: /'
  note "peers marked 'direct' = low latency; 'relay \"xxx\"' = DERP relay (fine for testing, bad for games)"
  curl -s -m 2 127.0.0.1:8740/api/ping | grep -q tandem && ok "Tandem running: streams switch it to play mode (no new jobs)" \
    || note "Tandem not answering on this box: play-mode hook will no-op"
  command -v steam >/dev/null && ok "Steam installed (first login: stream the Desktop app, start Steam once)" || bad "Steam not installed"
  [ -f "$CONF/apps.json" ] && ok "apps: $(python3 -c "import json;print(', '.join(a['name'] for a in json.load(open('$CONF/apps.json'))['apps']))")"
  echo; [ $FAIL -eq 0 ] && echo "All checks passed." || echo "Some checks failed (see ✗ above)."
}

install() {
  hdr "Preflight"
  command -v nvidia-smi >/dev/null && nvidia-smi -L >/dev/null 2>&1 || { echo "NVIDIA driver not working. Stop."; exit 1; }
  ok "$(nvidia-smi --query-gpu=name,driver_version --format=csv,noheader) on $PRETTY_NAME"
  [ -f /usr/share/xsessions/cinnamon.desktop ] || { echo "No Cinnamon X11 session found; this script targets Mint Cinnamon. Stop."; exit 1; }
  if [ -d "/home/.ecryptfs/$U" ]; then
    echo "Your home folder is eCryptfs-encrypted. Auto-login can't unlock it (no password at boot), so the desktop,"
    echo "Sunshine config and Steam would be missing after a reboot. Stop. Tell Claude: options are removing home"
    echo "encryption on this box or a separate unencrypted 'stream' user."; exit 1
  fi
  sudo -v || exit 1

  hdr "NVIDIA KMS (needed for low-latency capture)"
  if [ "$(cat /sys/module/nvidia_drm/parameters/modeset 2>/dev/null)" = Y ]; then ok "modeset already on"
  else
    echo 'options nvidia_drm modeset=1 fbdev=1' | sudo tee /etc/modprobe.d/nvidia-drm-modeset.conf >/dev/null
    sudo update-initramfs -u >/dev/null 2>&1; REBOOT+=("nvidia_drm modeset=1"); ok "modeset=1 set (after reboot)"
  fi

  hdr "Sunshine"
  if dpkg -s sunshine >/dev/null 2>&1; then ok "installed: $(dpkg-query -W -f='${Version}' sunshine)"
  else
    case $CODENAME in noble) REL=24.04;; jammy) REL=22.04;; *) echo "Unknown Ubuntu base '$CODENAME'. Stop."; exit 1;; esac
    URL=$(curl -fsSL https://api.github.com/repos/LizardByte/Sunshine/releases/latest | python3 -c '
import json,sys
rel=sys.argv[1]
for a in json.load(sys.stdin).get("assets",[]):
    n=a["name"].lower()
    if n.endswith(".deb") and "ubuntu" in n and rel in n and ("amd64" in n or "x86_64" in n):
        print(a["browser_download_url"]); break' "$REL")
    [ -n "$URL" ] || { echo "Couldn't find the Sunshine Ubuntu $REL .deb on GitHub. Stop."; exit 1; }
    curl -fL --progress-bar -o /tmp/sunshine.deb "$URL" && sudo apt-get install -y /tmp/sunshine.deb || { echo "Install failed. Stop."; exit 1; }
    ok "installed $(dpkg-query -W -f='${Version}' sunshine)"
  fi
  SB=$(readlink -f "$(command -v sunshine)")
  getcap "$SB" | grep -q cap_sys_admin || sudo setcap cap_sys_admin+p "$SB"; ok "cap_sys_admin on $SB"
  echo uinput | sudo tee /etc/modules-load.d/uinput.conf >/dev/null; sudo modprobe uinput 2>/dev/null || true
  [ -f /etc/udev/rules.d/60-sunshine.rules ] || ls /usr/lib/udev/rules.d/*sunshine* >/dev/null 2>&1 || \
    echo 'KERNEL=="uinput", SUBSYSTEM=="misc", OPTIONS+="static_node=uinput", TAG+="uaccess", GROUP="input", MODE="0660"' \
    | sudo tee /etc/udev/rules.d/60-sunshine.rules >/dev/null
  id -nG | grep -qw input || { sudo usermod -aG input "$U"; REBOOT+=("input group"); }
  ok "uinput + input group (virtual controllers)"

  mkdir -p "$CONF"
  setkv() { if grep -qE "^\s*$1\s*=" "$CONF/sunshine.conf" 2>/dev/null; then sed -i -E "s|^\s*$1\s*=.*|$1 = $2|" "$CONF/sunshine.conf"; else echo "$1 = $2" >> "$CONF/sunshine.conf"; fi; }
  touch "$CONF/sunshine.conf"
  setkv sunshine_name gpubox
  setkv encoder nvenc
  setkv capture kms
  setkv nvenc_preset 1               # P1: lowest encoder latency; the 1660 Ti has headroom at 1080p60
  setkv origin_web_ui_allowed lan    # web UI only from LAN; pairing is done from the terminal (sunshine-pin)
  ok "sunshine.conf: nvenc, kms, P1, name gpubox"
  if ! grep -qs '"username"' "$CONF/sunshine_state.json"; then
    echo "  Set Sunshine web-UI/pairing credentials (you'll need them for sunshine-pin):"
    read -rp "    username: " SU; read -rsp "    password: " SP; echo
    sunshine --creds "$SU" "$SP" >/dev/null 2>&1 && ok "credentials set" || bad "couldn't set credentials"
  else ok "credentials already set"; fi

  hdr "Helpers"
  sudo tee /usr/local/bin/stream-display >/dev/null <<'EOF'
#!/bin/bash
# stream-display do|undo — match the dummy-plug display to the Moonlight client, then back to 1920x1080@60.
export DISPLAY=${DISPLAY:-:0}
OUT=$(xrandr --query 2>/dev/null | awk '/ connected/{print $1; exit}'); [ -n "$OUT" ] || exit 0
if [ "${1:-}" = do ]; then
  W=${SUNSHINE_CLIENT_WIDTH:-1920}; H=${SUNSHINE_CLIENT_HEIGHT:-1080}; F=${SUNSHINE_CLIENT_FPS:-60}
  xrandr --output "$OUT" --mode "${W}x${H}" --rate "$F" 2>/dev/null || xrandr --output "$OUT" --mode "${W}x${H}" 2>/dev/null \
    || xrandr --output "$OUT" --mode 1920x1080 --rate 60 2>/dev/null
else
  xrandr --output "$OUT" --mode 1920x1080 --rate 60 2>/dev/null
fi
exit 0
EOF
  sudo tee /usr/local/bin/stream-tandem >/dev/null <<'EOF'
#!/bin/sh
# stream-tandem on|off — Tandem play mode on this box: no new jobs while a stream runs (running ones finish).
v=false; [ "${1:-}" = on ] && v=true
curl -s -m 3 -X POST -H 'X-Tandem-UI: 1' -H 'Content-Type: application/json' \
  -d "{\"play_mode\": $v}" http://127.0.0.1:8740/api/settings >/dev/null 2>&1
exit 0
EOF
  sudo tee /usr/local/bin/sunshine-pin >/dev/null <<'EOF'
#!/bin/bash
# sunshine-pin PIN [device-name] — accept the PIN Moonlight shows, from the terminal.
[ -n "${1:-}" ] || { echo "usage: sunshine-pin PIN [device-name]"; exit 2; }
read -rp "Sunshine username: " SU; read -rsp "Password: " SP; echo
curl -sk -u "$SU:$SP" -H 'Content-Type: application/json' -d "{\"pin\":\"$1\",\"name\":\"${2:-moonlight}\"}" \
  https://localhost:47990/api/pin; echo
EOF
  sudo chmod 755 /usr/local/bin/stream-display /usr/local/bin/stream-tandem /usr/local/bin/sunshine-pin
  ok "stream-display, stream-tandem, sunshine-pin in /usr/local/bin"

  python3 - "$CONF/apps.json" <<'EOF'
import json, sys
p = sys.argv[1]
try: d = json.load(open(p))
except Exception: d = {"env": {"PATH": "$(PATH):$(HOME)/.local/bin"}, "apps": []}
prep = [{"do": "/usr/local/bin/stream-display do", "undo": "/usr/local/bin/stream-display undo", "elevated": False},
        {"do": "/usr/local/bin/stream-tandem on", "undo": "/usr/local/bin/stream-tandem off", "elevated": False}]
want = [{"name": "Desktop", "image-path": "desktop.png", "prep-cmd": prep},
        {"name": "Steam Big Picture", "image-path": "steam.png", "prep-cmd": prep,
         "detached": ["setsid steam steam://open/bigpicture"], "auto-detach": "true", "wait-all": "true"}]
names = {a["name"] for a in want}
d["apps"] = [a for a in d.get("apps", []) if a.get("name") not in names] + want
json.dump(d, open(p, "w"), indent=2)
EOF
  ok "apps.json: Desktop, Steam Big Picture (both switch resolution + Tandem play mode)"

  hdr "Desktop session at boot"
  sudo mkdir -p /etc/lightdm/lightdm.conf.d
  sudo rm -f /etc/lightdm/lightdm.conf.d/90-autologin.conf   # older setup file, replaced by this one
  printf '[Seat:*]\nautologin-user=%s\nautologin-user-timeout=0\nautologin-session=cinnamon\nuser-session=cinnamon\n' "$U" \
    | sudo tee /etc/lightdm/lightdm.conf.d/90-stream-autologin.conf >/dev/null
  ok "lightdm auto-login as $U into Cinnamon (X11)"
  UNIT=$(sunshine_unit); UNIT=${UNIT:-sunshine.service}
  mkdir -p "$HOME/.local/bin" "$HOME/.config/autostart"
  cat > "$HOME/.local/bin/stream-session" <<EOF
#!/bin/bash
# Runs at desktop login: keep the screen awake and unlocked for streaming, then (re)start Sunshine with this session's display.
xset s off -dpms 2>/dev/null
gsettings set org.cinnamon.desktop.screensaver lock-enabled false 2>/dev/null
gsettings set org.cinnamon.desktop.screensaver idle-activation-enabled false 2>/dev/null
gsettings set org.cinnamon.desktop.session idle-delay 0 2>/dev/null
gsettings set org.cinnamon.settings-daemon.plugins.power sleep-display-ac 0 2>/dev/null
gsettings set org.cinnamon.settings-daemon.plugins.power sleep-inactive-ac-timeout 0 2>/dev/null
/usr/local/bin/stream-display undo
systemctl --user import-environment DISPLAY XAUTHORITY XDG_SESSION_TYPE XDG_CURRENT_DESKTOP
systemctl --user restart $UNIT
EOF
  chmod 755 "$HOME/.local/bin/stream-session"
  printf '[Desktop Entry]\nType=Application\nName=Streaming session\nExec=%s\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n' \
    "$HOME/.local/bin/stream-session" > "$HOME/.config/autostart/stream-session.desktop"
  systemctl --user disable "$UNIT" >/dev/null 2>&1 || true   # started by the session above, with the right DISPLAY
  ok "at login: screen lock/blanking off, 1920x1080@60, Sunshine started ($UNIT)"

  hdr "Steam"
  dpkg --print-foreign-architectures | grep -q i386 || { sudo dpkg --add-architecture i386; ok "i386 architecture added"; }
  sudo apt-get update -qq
  if ! command -v steam >/dev/null; then
    echo 'steam steam/question select I AGREE' | sudo debconf-set-selections
    echo 'steam steam/license note ""' | sudo debconf-set-selections
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y steam-installer >/dev/null 2>&1 \
      || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y steam >/dev/null 2>&1
    command -v steam >/dev/null && ok "Steam installed" || bad "Steam install failed (try: sudo apt install steam-installer)"
  else ok "Steam already installed"; fi
  GL=$(dpkg-query -W -f='${Package} ${Architecture}\n' 'libnvidia-gl-*' 2>/dev/null | awk '$2=="amd64"{print $1; exit}')
  if [ -n "$GL" ]; then
    dpkg -s "$GL:i386" >/dev/null 2>&1 || sudo apt-get install -y "$GL:i386" >/dev/null 2>&1
    dpkg -s "$GL:i386" >/dev/null 2>&1 && ok "32-bit NVIDIA GL ($GL:i386) for Steam/Proton" || bad "couldn't install $GL:i386"
  else note "NVIDIA driver isn't from apt packages (.run install?): make sure its 32-bit libraries were included"; fi

  hdr "Firewall"
  if sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    for src in 10.77.0.0/24 100.64.0.0/10; do
      sudo ufw allow proto tcp from $src to any port 47984:48010 >/dev/null
      sudo ufw allow proto udp from $src to any port 47998:48010 >/dev/null
    done
    ok "ufw: Sunshine TCP 47984-48010 / UDP 47998-48010 from desk LAN and Tailscale"
  else note "ufw inactive: nothing to open. Tailscale needs no inbound ports on the Beelink"; fi

  hdr "Apply now"
  if [ ${#REBOOT[@]} -eq 0 ] && pgrep -u "$U" -x cinnamon >/dev/null; then
    xenv; systemctl --user import-environment DISPLAY XAUTHORITY 2>/dev/null; systemctl --user restart "$UNIT" 2>/dev/null \
      && ok "Sunshine restarted in the running session"
  fi
  check
  echo
  if [ ${#REBOOT[@]} -gt 0 ] || ! pgrep -u "$U" -x cinnamon >/dev/null; then
    echo "REBOOT needed (${REBOOT[*]:-start the auto-login session}). With the dummy plug in: sudo reboot"
    echo "Then: bash stream-host-setup.sh --check"
  fi
}

if [ "$MODE" = check ]; then check; else install; fi
