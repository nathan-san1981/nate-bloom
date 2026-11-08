#!/usr/bin/env bash
# Nate Bloom Box: game streaming from the GPU box (Sunshine) with Moonlight. Run on the Pi over SSH, as the box's user,
# after box/install.sh. Safe to run again.
#
#   bash stream-setup.sh                         Tailscale + Moonlight, settings for the 5" screen, pair with the GPU box
#   bash stream-setup.sh --boot-into-stream      also start straight into the stream at power-on (instead of the home screen)
#   bash stream-setup.sh --home-screen           back to the home screen at power-on
# Options: --host NAME      the GPU box's Tailscale name (default gpu-box)
#          --app NAME       what to start (default "Steam Big Picture"; "Desktop" for the plain desktop)
#          --bitrate KBPS   default 12000 (720p60 HEVC on 5 GHz Wi-Fi; 8000 if it stutters, 15000 if it's clean)
#          --host-ssh USER@HOST   pair without typing: sends the PIN to the GPU box over SSH (Tailscale SSH or a key)
set -euo pipefail
HOST=gpu-box APP="Steam Big Picture" BITRATE=12000 BOOT="" HOSTSSH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --host) shift; HOST="$1" ;; --app) shift; APP="$1" ;; --bitrate) shift; BITRATE="$1" ;;
    --boot-into-stream) BOOT=stream ;; --home-screen) BOOT=ask ;; --host-ssh) shift; HOSTSSH="$1" ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
[ "$(id -u)" -ne 0 ] || { echo "Run as the box's user, not root." >&2; exit 1; }
case "$BITRATE" in ''|*[!0-9]*) echo "--bitrate takes a number (kbps)" >&2; exit 2 ;; esac
CONF=/etc/nb-box.conf
say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    ! %s\033[0m\n' "$*"; }
[ -f "$CONF" ] || warn "no $CONF: this isn't set up as a Nate Bloom Box yet (box/install.sh); carrying on with Moonlight only"
. /etc/os-release

say "Tailscale (the GPU box sits on the private desk network: Tailscale is the way in)"
if ! command -v tailscale >/dev/null 2>&1; then curl -fsSL https://tailscale.com/install.sh | sh; fi
if ! tailscale status >/dev/null 2>&1; then
  echo "    Sign in: open the link below on your iPhone (same Tailscale account)."
  sudo tailscale up --hostname=nate-bloom-box --ssh
fi
echo "    this box: $(tailscale ip -4 2>/dev/null | head -1)"

say "Moonlight"
if ! command -v moonlight-qt >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/moonlight-game-streaming/moonlight-qt/setup.deb.sh' | sudo distro=raspbian codename="${VERSION_CODENAME:-bookworm}" bash
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq moonlight-qt
fi
echo "    $(dpkg-query -W -f='moonlight-qt ${Version}' moonlight-qt 2>/dev/null)"

say "The GPU box ($HOST)"
P="$(tailscale ping -c 3 --timeout 3s "$HOST" 2>&1 | tail -1 || true)"
case "$P" in
  *"via DERP"*) warn "reachable only through a Tailscale relay ($P): expect lag. On the GPU box: bash gpu-box-setup.sh --check (UDP through the Beelink)" ;;
  *pong*) echo "    direct: $P" ;;
  *) warn "can't reach $HOST over Tailscale ($P). Is the GPU box on and in the same tailnet? (tailscale status)" ;;
esac
if curl -s -m 4 "http://$HOST:47989/serverinfo" | grep -q '<hostname>'; then echo "    Sunshine answers on $HOST:47989"
else warn "Sunshine isn't answering on $HOST:47989 (not running yet, or the GPU box needs its reboot)"; fi

say "Settings for the 5\" screen"
if [ -f "$CONF" ]; then
  setc() { if grep -q "^$1=" "$CONF"; then sudo sed -i "s|^$1=.*|$1=$2|" "$CONF"; else echo "$1=$2" | sudo tee -a "$CONF" >/dev/null; fi; }
  setc STREAM_HOST "$HOST"
  setc STREAM_APP "\"$APP\""
  setc STREAM_RES 1280x720
  setc STREAM_FPS 60
  setc STREAM_BITRATE "$BITRATE"
  setc STREAM_CODEC HEVC          # the Pi 5 decodes HEVC in hardware (H.264 would be decoded by the CPU)
  [ -n "$BOOT" ] && setc START "$BOOT"
  echo "    1280x720 at 60 fps, HEVC, $((BITRATE / 1000)) Mbps; starts '$APP' on $HOST"
  echo "    at power-on: $(sed -n 's/^START=//p' "$CONF")   (ask = home screen; stream = straight into the game)"
fi

say "Pairing"
if QT_QPA_PLATFORM=offscreen moonlight-qt list "$HOST" >/dev/null 2>&1; then echo "    already paired with $HOST"
else
  PIN=$(printf '%04d' $(( $(od -An -N2 -tu2 /dev/urandom) % 10000 )))
  echo "    PIN $PIN"
  QT_QPA_PLATFORM=offscreen moonlight-qt pair "$HOST" --pin "$PIN" >/tmp/nb-pair.log 2>&1 &
  PAIRPID=$!
  if [ -n "$HOSTSSH" ]; then sleep 3; ssh -o ConnectTimeout=8 "$HOSTSSH" "gpu-box-pin $PIN nate-bloom-box" || warn "couldn't send the PIN over SSH"
  else echo "    On the GPU box (ShellFish):   gpu-box-pin $PIN nate-bloom-box"; fi
  for _ in $(seq 1 90); do kill -0 "$PAIRPID" 2>/dev/null || break; sleep 1; done
  kill "$PAIRPID" 2>/dev/null || true
  if QT_QPA_PLATFORM=offscreen moonlight-qt list "$HOST" >/dev/null 2>&1; then echo "    paired"
  else warn "not paired from the command line ($(tail -1 /tmp/nb-pair.log)). Pair on the screen instead: home screen > Stream > $HOST, then gpu-box-pin <PIN shown> on the GPU box"; fi
fi

say "Done"
cat <<EOF
    Home screen > Stream opens Moonlight (pick a computer and an app).
    Quit a stream: hold Start + Select + LB + RB on the controller (or press the box's power button: back to the home screen).
    Xbox controller: wired works as is; Bluetooth (One S or later) pairs in home screen > Settings.
EOF
