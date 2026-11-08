#!/usr/bin/env bash
# GPU box game streaming host: Sunshine (NVENC) + Steam, auto-starting in an X11 desktop at boot with no login.
# Run as your normal user over SSH (it uses sudo). Safe to run again: it only changes what isn't already right.
#
#   bash gpu-box-setup.sh --check      facts only (distro, driver, display, Tailscale), changes nothing
#   bash gpu-box-setup.sh              set everything up
#   bash gpu-box-setup.sh --update     same, and reinstall the latest Sunshine
# Options: --no-steam  --enable-ufw (turn the firewall on: SSH + Sunshine on Tailscale and the desk network only)
#
# Physical access / reboot: a reboot is needed after the first run (driver, nvidia-drm.modeset, autologin); the
# script says so at the end. The only physical step is plugging an HDMI dummy plug into the GTX 1660 Ti (recommended).
set -euo pipefail

CHECK=0 UPDATE=0 STEAM=1 UFW_ON=0
for a in "$@"; do
  case "$a" in
    --check) CHECK=1 ;; --update) UPDATE=1 ;; --no-steam) STEAM=0 ;; --enable-ufw) UFW_ON=1 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done
[ "$(id -u)" -ne 0 ] || { echo "Run as your desktop user (it uses sudo), not root." >&2; exit 1; }
U="$(id -un)"; H="$HOME"; CONF_DIR="$H/.config/sunshine"
REBOOT=() WARN=() OK=()
say()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
need_reboot() { REBOOT+=("$1"); }
warn() { WARN+=("$1"); printf '\033[1;33m   ! %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- facts
. /etc/os-release
BASE="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
case "$BASE" in jammy) UBU=22.04 ;; noble) UBU=24.04 ;; *) UBU="" ;; esac
DRV="$(nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>/dev/null | head -1 || true)"
DM="$(basename "$(readlink -f /etc/systemd/system/display-manager.service 2>/dev/null || echo none)" .service)"
CONNECTED=""
for s in /sys/class/drm/card*-*/status; do [ -f "$s" ] && [ "$(cat "$s")" = connected ] && CONNECTED="$CONNECTED $(basename "$(dirname "$s")")"; done
TS="$(tailscale status --self --json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); s=d["Self"]; print(d.get("BackendState",""), s.get("DNSName","").rstrip("."), (s.get("TailscaleIPs") or [""])[0])' 2>/dev/null || true)"
GW="$(ip route get 1.1.1.1 2>/dev/null | sed -n 's/.* via \([0-9.]*\) dev \([^ ]*\).*/\1 on \2/p')"

say "This box"
note "OS:        $PRETTY_NAME (Ubuntu base: ${BASE:-unknown})"
note "Kernel:    $(uname -r)"
note "GPU/driver: ${DRV:-no NVIDIA driver loaded}"
note "Login:     display manager = $DM"
note "Displays:  ${CONNECTED:-none connected (no monitor or dummy plug)}"
note "Internet:  via ${GW:-no default route}"
note "Tailscale: ${TS:-not running}"
[ -n "$UBU" ] || { echo "Needs an Ubuntu 22.04/24.04 base (Mint 21/22, Ubuntu, Pop!_OS). This is: $PRETTY_NAME" >&2; exit 1; }
lspci 2>/dev/null | grep -qi 'nvidia' || { echo "No NVIDIA GPU found on the PCI bus." >&2; exit 1; }
if [ "$CHECK" = 1 ]; then exit 0; fi

# ---------------------------------------------------------------- 1. NVIDIA driver, KMS
say "NVIDIA driver"
if [ -z "$DRV" ]; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ubuntu-drivers-common
  sudo ubuntu-drivers install
  need_reboot "NVIDIA driver installed"
else
  V="${DRV##*, }"; note "loaded: $V"
  [ "${V%%.*}" -ge 535 ] 2>/dev/null || warn "driver $V is old for NVENC in current Sunshine: install 550 or newer (Driver Manager / ubuntu-drivers install)"
fi
# nvidia-drm.modeset=1: needed for KMS capture (the fast path: frames go GPU -> NVENC without a CPU copy)
if [ ! -f /etc/modprobe.d/gpu-box-nvidia-drm.conf ]; then
  echo "options nvidia-drm modeset=1" | sudo tee /etc/modprobe.d/gpu-box-nvidia-drm.conf >/dev/null
  sudo update-initramfs -u >/dev/null 2>&1 || true
  need_reboot "nvidia-drm.modeset=1"
fi
[ "$(cat /sys/module/nvidia_drm/parameters/modeset 2>/dev/null || echo N)" = Y ] && note "KMS (nvidia-drm.modeset) is on" || note "KMS turns on after the reboot"

# ---------------------------------------------------------------- 2. X11 desktop with autologin
say "Desktop: X11, logged in automatically at boot"
SESSION=""
for s in cinnamon xfce mate; do [ -f "/usr/share/xsessions/$s.desktop" ] && { SESSION="$s"; break; }; done
if [ -z "$SESSION" ]; then
  note "no desktop installed: adding a light one (Xfce + LightDM)"
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq xfce4 xfce4-terminal lightdm lightdm-gtk-greeter dbus-x11 x11-xserver-utils
  SESSION=xfce; DM=lightdm; need_reboot "desktop installed"
fi
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq x11-xserver-utils curl jq python3 >/dev/null
case "$DM" in
  lightdm)
    F=/etc/lightdm/lightdm.conf.d/60-gpu-box-autologin.conf
    WANT="[Seat:*]
autologin-user=$U
autologin-user-timeout=0
autologin-session=$SESSION
user-session=$SESSION"
    if [ "$(cat "$F" 2>/dev/null)" != "$WANT" ]; then sudo mkdir -p /etc/lightdm/lightdm.conf.d; echo "$WANT" | sudo tee "$F" >/dev/null; need_reboot "autologin"; fi
    getent group autologin >/dev/null && ! id -nG "$U" | grep -qw autologin && { sudo usermod -aG autologin "$U"; need_reboot "autologin group"; } || true
    ;;
  gdm|gdm3)
    F=/etc/gdm3/custom.conf
    if ! grep -q "^AutomaticLogin=$U" "$F" 2>/dev/null; then
      sudo sed -i '/^\[daemon\]/,/^\[/{/^\(WaylandEnable\|AutomaticLoginEnable\|AutomaticLogin\)=/d}' "$F"
      sudo sed -i "s/^\[daemon\]/[daemon]\nWaylandEnable=false\nAutomaticLoginEnable=True\nAutomaticLogin=$U/" "$F"
      need_reboot "autologin (GDM, Wayland off)"
    fi ;;
  *) warn "display manager '$DM' isn't LightDM or GDM: set autologin to $U with an X11 session by hand" ;;
esac
sudo systemctl set-default graphical.target >/dev/null
# no screen lock, blanking or sleep on a box nobody sits at
mkdir -p "$H/.config/autostart" "$H/.local/bin"
cat > "$H/.local/bin/gpu-box-session" <<'EOF'
#!/bin/sh
# (gpu-box) runs at login: no blanking, no lock (the box is headless; Sunshine needs the desktop awake)
xset s off -dpms s noblank 2>/dev/null
gsettings set org.cinnamon.desktop.screensaver lock-enabled false 2>/dev/null
gsettings set org.cinnamon.desktop.session idle-delay 0 2>/dev/null
gsettings set org.cinnamon.settings-daemon.plugins.power sleep-display-ac 0 2>/dev/null
gsettings set org.gnome.desktop.screensaver lock-enabled false 2>/dev/null
gsettings set org.gnome.desktop.session idle-delay 0 2>/dev/null
xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/dpms-enabled -n -t bool -s false 2>/dev/null
xfconf-query -c xfce4-screensaver -p /saver/enabled -n -t bool -s false 2>/dev/null
exit 0
EOF
chmod +x "$H/.local/bin/gpu-box-session"
printf '[Desktop Entry]\nType=Application\nName=GPU box: stay awake\nExec=%s\nX-GNOME-Autostart-enabled=true\n' "$H/.local/bin/gpu-box-session" > "$H/.config/autostart/gpu-box-session.desktop"
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1 || true

# ---------------------------------------------------------------- 3. the screen Sunshine captures
say "Headless display"
XCONF=/etc/X11/xorg.conf.d/20-gpu-box-headless.conf
if [ -n "$CONNECTED" ]; then
  CAPTURE=kms
  note "a display is connected ($CONNECTED): using it (KMS capture)"
  [ -f "$XCONF" ] && { sudo rm -f "$XCONF"; note "removed the virtual-monitor fallback"; need_reboot "virtual monitor removed"; }
else
  CAPTURE=x11
  warn "no monitor or HDMI dummy plug: using a virtual monitor (X11 capture, slower). Plug a 4K HDMI dummy plug into the GPU and run this again"
  if [ ! -f "$XCONF" ]; then
    sudo mkdir -p /etc/X11/xorg.conf.d
    sudo tee "$XCONF" >/dev/null <<'EOF'
# (gpu-box) no monitor attached: the NVIDIA driver pretends one is, at 1920x1080 and 1280x720.
# Removed by gpu-box-setup.sh once a dummy plug or monitor is connected.
Section "Monitor"
    Identifier "gpu-box-virtual"
    HorizSync   28.0-80.0
    VertRefresh 48.0-75.0
    Modeline "1920x1080_60" 173.00 1920 2048 2248 2576 1080 1083 1088 1120 -hsync +vsync
    Modeline "1280x720_60"   74.50 1280 1344 1472 1664  720  723  728  748 -hsync +vsync
EndSection
Section "Device"
    Identifier "gpu-box-nvidia"
    Driver     "nvidia"
    Option     "AllowEmptyInitialConfiguration" "true"
    Option     "ConnectedMonitor" "DFP-0"
    Option     "ModeValidation" "NoEdidModes, NoDFPNativeResolutionCheck, NoVirtualSizeCheck, NoMaxPClkCheck, NoHorizSyncCheck, NoVertRefreshCheck, AllowNonEdidModes"
    Option     "MetaModes" "DFP-0: 1920x1080_60 +0+0, DFP-0: 1280x720_60 +0+0"
EndSection
Section "Screen"
    Identifier "gpu-box-screen"
    Device     "gpu-box-nvidia"
    Monitor    "gpu-box-virtual"
    DefaultDepth 24
    SubSection "Display"
        Depth 24
        Modes "1920x1080_60" "1280x720_60"
    EndSubSection
EndSection
EOF
    need_reboot "virtual monitor"
  fi
fi
# resolution per client: Sunshine passes the client's size and frame rate; the nearest mode the screen has is used
sudo tee /usr/local/bin/gpu-box-res >/dev/null <<'EOF'
#!/bin/sh
# (gpu-box) Sunshine prep command: "do" sets the screen to the client's size (SUNSHINE_CLIENT_WIDTH/HEIGHT/FPS),
# "undo" puts it back to 1920x1080. A mode the screen doesn't have falls back to 1920x1080 (phones) or 1280x720.
OUT=$(xrandr --current 2>/dev/null | awk '/ connected/ {print $1; exit}'); [ -n "$OUT" ] || exit 0
W=${SUNSHINE_CLIENT_WIDTH:-1920}; Hh=${SUNSHINE_CLIENT_HEIGHT:-1080}; F=${SUNSHINE_CLIENT_FPS:-60}
if [ "$1" = undo ]; then xrandr --output "$OUT" --mode 1920x1080 2>/dev/null || xrandr --output "$OUT" --mode 1920x1080_60 2>/dev/null; exit 0; fi
xrandr --output "$OUT" --mode "${W}x${Hh}" --rate "$F" 2>/dev/null && exit 0
xrandr --output "$OUT" --mode "${W}x${Hh}" 2>/dev/null && exit 0
if [ "$Hh" -le 800 ]; then xrandr --output "$OUT" --mode 1280x720 2>/dev/null || xrandr --output "$OUT" --mode 1280x720_60 2>/dev/null
else xrandr --output "$OUT" --mode 1920x1080 2>/dev/null || xrandr --output "$OUT" --mode 1920x1080_60 2>/dev/null; fi
exit 0
EOF
sudo chmod 0755 /usr/local/bin/gpu-box-res

# ---------------------------------------------------------------- 4. Sunshine
say "Sunshine"
if [ "$UPDATE" = 1 ] || ! command -v sunshine >/dev/null 2>&1; then
  URL="https://github.com/LizardByte/Sunshine/releases/latest/download/sunshine-ubuntu-$UBU-amd64.deb"
  note "installing $URL"
  curl -fL --retry 3 -o /tmp/sunshine.deb "$URL"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq /tmp/sunshine.deb; rm -f /tmp/sunshine.deb
fi
SBIN="$(readlink -f "$(command -v sunshine)")"
note "installed: $(dpkg-query -W -f='${Version}' sunshine 2>/dev/null || echo '?') ($SBIN)"
# KMS capture needs CAP_SYS_ADMIN on the binary; virtual input needs uinput
getcap "$SBIN" 2>/dev/null | grep -q cap_sys_admin || sudo setcap cap_sys_admin+p "$SBIN"
echo uinput | sudo tee /etc/modules-load.d/gpu-box-uinput.conf >/dev/null; sudo modprobe uinput 2>/dev/null || true
id -nG "$U" | grep -qw input || { sudo usermod -aG input "$U"; need_reboot "input group (controllers)"; }
mkdir -p "$CONF_DIR"; C="$CONF_DIR/sunshine.conf"; touch "$C"
setk() { if grep -q "^$1 *=" "$C"; then sed -i "s|^$1 *=.*|$1 = $2|" "$C"; else echo "$1 = $2" >> "$C"; fi; }
setk sunshine_name "$(hostname)"
setk encoder nvenc
setk capture "$CAPTURE"
setk nvenc_preset 1                  # P1: fastest, lowest latency
setk nvenc_twopass quarter_res       # cheap first pass: better quality on fast motion at the same bitrate
setk origin_web_ui_allowed wan       # the firewall (or the private network) decides who reaches 47990
setk global_prep_cmd '[{"do":"/usr/local/bin/gpu-box-res do","undo":"/usr/local/bin/gpu-box-res undo"}]'
# web UI login (needed for pairing): made once, kept in ~/.config/sunshine/gpu-box-admin (mode 600)
if [ ! -s "$CONF_DIR/gpu-box-admin" ]; then
  P="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
  sunshine --creds admin "$P" >/dev/null 2>&1 || "$SBIN" "$C" --creds admin "$P" >/dev/null 2>&1 || true
  printf 'admin\n%s\n' "$P" > "$CONF_DIR/gpu-box-admin"; chmod 600 "$CONF_DIR/gpu-box-admin"
  note "web UI login: admin / (in $CONF_DIR/gpu-box-admin)"
fi
# pairing from the terminal: gpu-box-pin 1234 [name]  (the PIN Moonlight shows)
sudo tee /usr/local/bin/gpu-box-pin >/dev/null <<'EOF'
#!/bin/sh
# (gpu-box) gpu-box-pin <PIN> [client name]: accept a Moonlight pairing PIN, from SSH
[ -n "$1" ] || { echo "usage: gpu-box-pin <PIN> [name]"; exit 2; }
A="$HOME/.config/sunshine/gpu-box-admin"; USR=$(sed -n 1p "$A"); PW=$(sed -n 2p "$A")
B="https://localhost:47990"
T=$(curl -sk -u "$USR:$PW" "$B/api/csrf-token" 2>/dev/null | sed -n 's/.*"csrf_token" *: *"\([^"]*\)".*/\1/p')
R=$(curl -sk -u "$USR:$PW" ${T:+-H "X-CSRF-Token: $T"} -H 'Content-Type: application/json' -X POST "$B/api/pin" \
     -d "{\"pin\":\"$1\",\"name\":\"${2:-moonlight}\"}")
echo "$R" | grep -q '"status" *: *\(true\|"true"\)' && echo "Paired: ${2:-moonlight}" || { echo "Not accepted: $R"; exit 1; }
EOF
sudo chmod 0755 /usr/local/bin/gpu-box-pin
# apps: a plain desktop and Steam Big Picture (others you add in the web UI are kept)
python3 - "$CONF_DIR/apps.json" "$STEAM" <<'EOF'
import json, sys, os
p, steam = sys.argv[1], sys.argv[2] == "1"
try: d = json.load(open(p))
except Exception: d = {}
d.setdefault("env", {"PATH": "$(PATH):$(HOME)/.local/bin"})
apps = [a for a in d.get("apps", []) if a.get("name") not in ("Desktop", "Steam Big Picture")]
mine = [{"name": "Desktop", "image-path": "desktop.png"}]
if steam:
    mine.append({"name": "Steam Big Picture", "image-path": "steam.png", "detached": ["setsid steam steam://open/bigpicture"],
                 "prep-cmd": [{"do": "", "undo": "setsid steam steam://close/bigpicture"}], "auto-detach": "true", "wait-all": "true"})
d["apps"] = mine + apps
tmp = p + ".part"; json.dump(d, open(tmp, "w"), indent=2); os.replace(tmp, p)
EOF
# start with the desktop session (autostart), never twice
systemctl --user disable --now sunshine.service app-dev.lizardbyte.app.Sunshine.service >/dev/null 2>&1 || true
printf '[Desktop Entry]\nType=Application\nName=Sunshine\nExec=%s\nX-GNOME-Autostart-enabled=true\n' "$SBIN" > "$H/.config/autostart/sunshine.desktop"
if pgrep -u "$U" -x sunshine >/dev/null; then
  pkill -u "$U" -x sunshine; sleep 1
  DISPLAY=:0 XAUTHORITY="$H/.Xauthority" setsid "$SBIN" >/dev/null 2>&1 < /dev/null & disown || true
  note "Sunshine restarted with the new settings"
fi

# ---------------------------------------------------------------- 5. Steam
if [ "$STEAM" = 1 ]; then
  say "Steam"
  if ! command -v steam >/dev/null 2>&1; then
    sudo dpkg --add-architecture i386
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq steam-installer 2>/dev/null \
      || { curl -fL -o /tmp/steam.deb https://cdn.akamai.steamstatic.com/client/installer/steam.deb && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq /tmp/steam.deb; rm -f /tmp/steam.deb; }
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libnvidia-gl-"$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | cut -d. -f1)":i386 >/dev/null 2>&1 || true
  fi
  note "installed. First run (sign-in, Steam's own update) happens on screen: stream the Desktop app once and open Steam"
fi

# ---------------------------------------------------------------- 6. firewall + Tailscale path
say "Network"
LANIF="$(ip -o route get 1.1.1.1 2>/dev/null | sed -n 's/.* dev \([^ ]*\).*/\1/p')"
TCP="47984,47989,47990,48010"; UDPR="47998:48010"
if command -v ufw >/dev/null && sudo ufw status | grep -q 'Status: active' || [ "$UFW_ON" = 1 ]; then
  command -v ufw >/dev/null || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw
  sudo ufw allow OpenSSH >/dev/null 2>&1 || sudo ufw allow 22/tcp >/dev/null
  for IF in tailscale0 ${LANIF:+$LANIF}; do
    sudo ufw allow in on "$IF" to any port "$TCP" proto tcp comment "Sunshine ($IF)" >/dev/null
    sudo ufw allow in on "$IF" to any port "$UDPR" proto udp comment "Sunshine ($IF)" >/dev/null
  done
  sudo ufw allow in on tailscale0 >/dev/null 2>&1 || true
  [ "$UFW_ON" = 1 ] && sudo ufw --force enable >/dev/null
  note "ufw: Sunshine open on tailscale0${LANIF:+ and $LANIF} only"
else
  note "ufw is off: nothing blocks Sunshine (the box only sits on the private desk network and Tailscale)"
fi
if [ -z "$TS" ] || ! echo "$TS" | grep -q '^Running'; then
  warn "Tailscale isn't up: sudo tailscale up --ssh (the iPhone and the Pi reach this box only through Tailscale)"
else
  UDPOK="$(tailscale netcheck 2>/dev/null | sed -n 's/.*\* UDP: *//p' | head -1)"
  [ "$UDPOK" = true ] && note "Tailscale UDP through the Beelink: OK (direct connections possible)" \
    || warn "Tailscale reports no UDP through the Beelink: streams will go through a relay (laggy). On the Beelink: sudo iptables -L FORWARD -v (allow forwarding for the desk network) and check its NAT masquerades UDP"
fi

# ---------------------------------------------------------------- summary
say "Check"
printf '   %-34s %s\n' "nvidia-smi" "${DRV:-after reboot}"
printf '   %-34s %s\n' "capture" "$CAPTURE$([ "$CAPTURE" = x11 ] && echo ' (add a dummy plug, rerun for kms)')"
printf '   %-34s %s\n' "Sunshine autostart" "$H/.config/autostart/sunshine.desktop"
printf '   %-34s %s\n' "pair a client" "gpu-box-pin <PIN> <name>"
printf '   %-34s %s\n' "Tailscale name" "${TS:+$(echo "$TS" | awk '{print $2" ("$3")"}')}"
if [ ${#REBOOT[@]} -gt 0 ]; then
  printf '\n\033[1;31m   REBOOT NEEDED (%s): sudo reboot, then run this script again to confirm.\033[0m\n' "$(IFS=,; echo "${REBOOT[*]}")"
else
  printf '\n   After a reboot, confirm with:  pgrep -a sunshine; ss -lntup | grep -E "4798|4799|4800|48010"; grep -i nvenc ~/.config/sunshine/sunshine.log | tail -3\n'
fi
