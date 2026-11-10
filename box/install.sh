#!/usr/bin/env bash
# Nate Bloom Box: turns a fresh Raspberry Pi OS Lite (64-bit) on a Raspberry Pi 5 into the box.
#   curl -fsSL https://raw.githubusercontent.com/nathan-san1981/nate-bloom/main/box/install.sh | bash
# Options (after "bash -s --" when piped):  --chromium   use the browser kiosk instead of the ARM64 app
#                                            --dsi0       the screen's ribbon is in the Pi's port 0 (default: port 1)
#                                            --rotate N   90 (default) or 270, whichever way the screen sits in the case
#                                            --no-reboot  don't reboot at the end
#                                            --4k-kernel  the 4 KB-page kernel (only if the app won't start on the Pi 5's default 16 KB one)
#                                            --no-listen  no Spotify Connect / AirPlay (Listen on the home screen)
#                                            --no-youtube no YouTube / YouTube Music casting in Listen
#                                            --no-stream  no Moonlight (Stream: PC games over Wi-Fi)
#                                            --no-media   no Kodi (Media)
#                                            --no-retro   no RetroArch (Retro: games without rebooting into the stick)
#                                            --no-games-boot  keep booting from the card first (Games needs USB first)
# Safe to run again: every file it writes is replaced, every config.txt line sits in one marked block.
set -euo pipefail

REPO="nathan-san1981/nate-bloom"
RAW="https://raw.githubusercontent.com/$REPO/main/box"
DEB_URL="https://github.com/$REPO/releases/download/pi-latest/NateBloom-pi-arm64.deb"
MODE=app DSI=1 ROTATE=90 REBOOT=1 K4=0 LISTEN=1 YOUTUBE=1 STREAM=1 MEDIA=1 RETRO=1 GAMESBOOT=1
while [ $# -gt 0 ]; do
  case "$1" in
    --chromium) MODE=chromium ;;
    --dsi0) DSI=0 ;;
    --rotate) shift; ROTATE="${1:-90}" ;;
    --no-reboot) REBOOT=0 ;;
    --4k-kernel) K4=1 ;;
    --no-listen) LISTEN=0 ;;
    --no-youtube) YOUTUBE=0 ;;
    --no-stream) STREAM=0 ;;
    --no-media) MEDIA=0 ;;
    --no-retro) RETRO=0 ;;
    --no-games-boot) GAMESBOOT=0 ;;
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
PKGS="exfatprogs ntfs-3g cage wlr-randr pipewire pipewire-pulse pipewire-alsa pipewire-bin wireplumber rtkit alsa-utils curl ca-certificates iw rfkill fonts-noto-core
      bluez libspa-0.2-bluetooth python3 python3-evdev python3-dbus python3-gi"
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
fetch nb-box-usb@.service /etc/systemd/system/nb-box-usb@.service   # (USB sticks for the DJ, read-only, under /media/nb-usb)
fetch 99-nb-box-usb.rules /etc/udev/rules.d/99-nb-box-usb.rules
sudo mkdir -p /media/nb-usb
START="$(sed -n 's/^START=//p' /etc/nb-box.conf 2>/dev/null || true)"   # (kept when this runs again)
KEEP="$(grep -E '^(STREAM_|KARAOKE)' /etc/nb-box.conf 2>/dev/null || true)"   # (stream-setup.sh's settings, kept too)
sudo tee /etc/nb-box.conf >/dev/null <<EOF
# Nate Bloom Box settings (Box… in the app changes ROTATE and SCALE; MODE is app or chromium;
# START is what opens at power-on: ask = the home screen, or bloom, keys, listen, stream;
# STREAM_* (box/stream-setup.sh): the GPU box, app and stream settings for power-on into a stream)
MODE=$MODE
ROTATE=$ROTATE
SCALE=auto
BOXUSER=$BOXUSER
START=${START:-ask}
EOF
[ -n "$KEEP" ] && echo "$KEEP" | sudo tee -a /etc/nb-box.conf >/dev/null

say "The home screen: Nate Bloom, Keys, Listen, Stream, Media, Games"
sudo mkdir -p /opt/nb-box/apps/keys
fetch apps/home.html /opt/nb-box/apps/home.html
fetch apps/listen.html /opt/nb-box/apps/listen.html
fetch apps/radio.html /opt/nb-box/apps/radio.html
fetch apps/sheets.html /opt/nb-box/apps/sheets.html
fetch apps/retro.html /opt/nb-box/apps/retro.html
fetch apps/jam.js /opt/nb-box/apps/jam.js
fetch apps/idle.js /opt/nb-box/apps/idle.js
fetch apps/keys/index.html /opt/nb-box/apps/keys/index.html
fetch listen-event.py /usr/local/lib/nb-box/listen-event.py 0755
fetch listen-airplay.py /usr/local/lib/nb-box/listen-airplay.py 0755
fetch bt-pair.py /usr/local/lib/nb-box/bt-pair.py 0755
fetch nb-box-power.py /usr/local/lib/nb-box/nb-box-power.py 0755
fetch nb-box-power.service /etc/systemd/system/nb-box-power.service
# Kodi, Moonlight and RetroArch run in a small labwc inside cage with an on-screen Home button over them (outside.sh)
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends labwc gir1.2-gtk-3.0 gir1.2-gtklayershell-0.1 \
  || warn "labwc didn't install: no on-screen Home button over Kodi, Moonlight and RetroArch (the power button still works)"
sudo install -d /usr/local/lib/nb-box/labwc
fetch outside.sh /usr/local/lib/nb-box/outside.sh 0755
fetch home-button.py /usr/local/lib/nb-box/home-button.py
fetch labwc/rc.xml /usr/local/lib/nb-box/labwc/rc.xml
# /run/nb-box: the app and session.sh pass "open Stream / Media" and the power button's "home" through it
echo "d /run/nb-box 0775 $BOXUSER $BOXUSER -" | sudo tee /etc/tmpfiles.d/nb-box.conf >/dev/null
sudo systemd-tmpfiles --create /etc/tmpfiles.d/nb-box.conf
# the power button: press = home screen, hold 2 s = shut down (nb-box-power.py); logind leaves it alone
sudo mkdir -p /etc/systemd/logind.conf.d
printf '[Login]\nHandlePowerKey=ignore\nHandlePowerKeyLongPress=ignore\n' | sudo tee /etc/systemd/logind.conf.d/nb-box.conf >/dev/null

if [ "$LISTEN" = 1 ]; then
  say "Listen: Spotify Connect (raspotify's librespot) and AirPlay (shairport-sync)"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq shairport-sync avahi-daemon || warn "shairport-sync didn't install: AirPlay is off"
  if ! command -v librespot >/dev/null 2>&1; then
    curl -fsSL https://dtcooper.github.io/raspotify/install.sh | sh || warn "raspotify didn't install: Spotify Connect is off"
  fi
  # the app runs both as the box's user while Listen is open; their own system services stay off
  for u in raspotify.service shairport-sync.service; do sudo systemctl disable --now "$u" >/dev/null 2>&1 || true; done
  sudo systemctl enable --now avahi-daemon.service >/dev/null 2>&1 || true
  if [ "$YOUTUBE" = 1 ]; then
    # YouTube / YouTube Music: the box answers the Cast button and plays with mpv + yt-dlp. yt-dlp is the standalone
    # build in a folder the box's user owns, so the receiver can keep it current itself (yt-dlp -U, once a day)
    say "Listen: YouTube and YouTube Music casting (mpv + yt-dlp)"
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mpv || warn "mpv didn't install: YouTube casting is off"
    sudo mkdir -p /opt/nb-box/ytdlp && sudo chown "$BOXUSER:$BOXUSER" /opt/nb-box/ytdlp
    curl -fsSL -o /opt/nb-box/ytdlp/yt-dlp.part https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64 \
      && chmod 0755 /opt/nb-box/ytdlp/yt-dlp.part && mv /opt/nb-box/ytdlp/yt-dlp.part /opt/nb-box/ytdlp/yt-dlp \
      || warn "yt-dlp didn't download: YouTube casting is off"
  fi
fi
# Radio (mpv) and Sheets (poppler draws the PDF pages); their folders belong to the box's user
say "Radio and Sheets"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mpv poppler-utils || warn "mpv/poppler didn't install: Radio or Sheets may be off"
mkdir -p "$HOME/Sheets"
if [ "$RETRO" = 1 ]; then
  say "Retro: RetroArch and the cores Debian ships (NES, SNES, Game Boy, GBA, Genesis, DS, PlayStation, N64)"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq retroarch retroarch-assets || warn "retroarch didn't install: Retro is off"
  for c in libretro-nestopia libretro-snes9x libretro-bsnes-mercury-balanced libretro-gambatte libretro-mgba libretro-genesisplusgx libretro-desmume libretro-beetle-psx libretro-mupen64plus-next libretro-mupen64plus; do
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$c" >/dev/null 2>&1 || true
  done
  for d in nes snes gb gba genesis sms nds psx n64 psp arcade; do mkdir -p "$HOME/ROMs/$d"; done
  # RetroArch: fullscreen, no menu on exit, the Xbox controller's Guide button or Select+Start quits back to the home screen
  mkdir -p "$HOME/.config/retroarch"
  RA="$HOME/.config/retroarch/retroarch.cfg"; touch "$RA"
  for kv in 'video_fullscreen = "true"' 'video_driver = "gl"' 'audio_driver = "pulse"' 'menu_driver = "ozone"' 'input_autodetect_enable = "true"' \
            'input_menu_toggle_gamepad_combo = "2"' 'input_quit_gamepad_combo = "4"' 'quit_on_close_content = "1"' 'savestate_auto_save = "true"' 'savestate_auto_load = "true"' 'pause_nonactive = "false"'; do
    k=${kv%% =*}; grep -q "^$k = " "$RA" && sed -i "s|^$k = .*|$kv|" "$RA" || echo "$kv" >> "$RA"
  done
fi
# zram: compressed swap, so a memory spike slows things down instead of ending them (two heavy apps never run at once;
# this is the safety net under one app plus the music)
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq zram-tools >/dev/null 2>&1 && {
  printf 'ALGO=zstd\nPERCENT=50\nPRIORITY=100\n' | sudo tee /etc/default/zramswap >/dev/null
  sudo systemctl enable --now zramswap.service >/dev/null 2>&1 || sudo systemctl restart zramswap.service >/dev/null 2>&1 || true
} || warn "zram-tools didn't install (no compressed swap)"
if [ "$STREAM" = 1 ]; then
  say "Stream: Moonlight (games from your PC over Wi-Fi)"
  if ! command -v moonlight-qt >/dev/null 2>&1; then
    curl -1sLf 'https://dl.cloudsmith.io/public/moonlight-game-streaming/moonlight-qt/setup.deb.sh' | sudo distro=raspbian codename="${VERSION_CODENAME:-bookworm}" bash \
      && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq moonlight-qt || warn "Moonlight didn't install: Stream is off"
  fi
fi
if [ "$MEDIA" = 1 ]; then
  say "Media: Kodi"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq kodi kodi-peripheral-joystick || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq kodi || warn "Kodi didn't install: Media is off"
fi
if [ "$GAMESBOOT" = 1 ] && command -v rpi-eeprom-config >/dev/null 2>&1; then
  say "Games: boot USB first, then the card (a Batocera stick plugged in at power-on starts games)"
  CUR="$(sudo rpi-eeprom-config 2>/dev/null || true)"
  if ! echo "$CUR" | grep -q '^BOOT_ORDER=0xf614$'; then
    { echo "$CUR" | grep -v '^BOOT_ORDER='; echo "BOOT_ORDER=0xf614"; } > /tmp/nb-box-eeprom.conf
    sudo rpi-eeprom-config --apply /tmp/nb-box-eeprom.conf >/dev/null && echo "    boot order: USB, card, NVMe (takes effect after the reboot)" || warn "couldn't change the boot order: Games will need --no-games-boot's steps"
    rm -f /tmp/nb-box-eeprom.conf
  fi
fi

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
getent group bluetooth >/dev/null && sudo usermod -aG bluetooth "$BOXUSER" || true

say "The screen (Touch Display 2, 5\") and USB power"
CFG=/boot/firmware/config.txt; [ -f "$CFG" ] || CFG=/boot/config.txt
sudo cp -n "$CFG" "$CFG.before-nb-box" 2>/dev/null || true
sudo sed -i '/^# >>> nb-box/,/^# <<< nb-box/d' "$CFG"
sudo sed -i 's/^dtoverlay=vc4-kms-v3d,noaudio$/dtoverlay=vc4-kms-v3d/' "$CFG"   # (HDMI sound on: a TV or monitor can play; a USB output still wins whenever it is plugged in)
OVL="dtoverlay=vc4-kms-dsi-ili9881-5inch"; [ "$DSI" = 0 ] && OVL="$OVL,dsi0"   # (landscape is done in session.sh, so touch turns with it)
sudo tee -a "$CFG" >/dev/null <<EOF
# >>> nb-box (Nate Bloom Box: written by box/install.sh, replaced when it runs again)
[all]
$OVL
usb_max_current_enable=1
disable_splash=1
$([ "$K4" = 1 ] && echo "kernel=kernel8.img")
# <<< nb-box
EOF
# kernel command line: USB devices never autosuspend (no lost first note or click from the headphone adapter or the
# controller waking up), interrupts in threads so the audio threads can outrank them
CMD=/boot/firmware/cmdline.txt; [ -f "$CMD" ] || CMD=/boot/cmdline.txt
sudo cp -n "$CMD" "$CMD.before-nb-box" 2>/dev/null || true
for opt in usbcore.autosuspend=-1 threadirqs; do grep -qw -- "$opt" "$CMD" || sudo sed -i "1 s/\$/ $opt/" "$CMD"; done

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
sudo udevadm control --reload-rules 2>/dev/null || true
sudo systemctl enable nb-box-cpu.service nb-box.service nb-box-power.service bluetooth.service >/dev/null
sudo systemctl set-default graphical.target >/dev/null
sudo systemctl disable getty@tty1.service >/dev/null 2>&1 || true

say "Done ($MODE mode). Plug in the MiniLab and the headphone cable."
echo "    Home screen at power-on. Games: write Batocera to a USB stick with box/make-game-stick.sh."
if [ "$REBOOT" = 1 ]; then echo "Rebooting in 5 seconds (Ctrl+C to stay)…"; sleep 5; sudo reboot; else echo "Reboot when ready: sudo reboot"; fi
