#!/usr/bin/env bash
# Nate Bloom Box: writes Batocera to a USB stick set up for the box's 5" screen, so Games on the home screen works.
#   1. Download Batocera for the Raspberry Pi 5 from https://batocera.org/download (a .img.gz file).
#   2. Plug the USB stick into the box (or any Linux computer) and run, over SSH:
#        bash make-game-stick.sh ~/batocera-bcm2712-*.img.gz /dev/sda
#      Everything on the stick is erased. Use 32 GB or more; games go on it too (its SHARE partition).
#   Options: --rotate 90|270 (default: the box's own setting), --dsi0 (the screen's ribbon is in port 0)
set -euo pipefail
IMG="" DEV="" ROT="" DSI=1
while [ $# -gt 0 ]; do
  case "$1" in
    --rotate) shift; ROT="${1:-}" ;;
    --dsi0) DSI=0 ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) if [ -z "$IMG" ]; then IMG="$1"; elif [ -z "$DEV" ]; then DEV="$1"; else echo "too many arguments" >&2; exit 2; fi ;;
  esac
  shift
done
[ -n "$IMG" ] && [ -n "$DEV" ] || { sed -n '2,8p' "$0"; exit 2; }
[ -f "$IMG" ] || { echo "no such file: $IMG" >&2; exit 2; }
[ -b "$DEV" ] || { echo "not a disk: $DEV" >&2; exit 2; }
[ -z "$ROT" ] && ROT="$(sed -n 's/^ROTATE=//p' /etc/nb-box.conf 2>/dev/null || true)"
[ -z "$ROT" ] && ROT=90
case "$ROT" in 90) R=1 ;; 270) R=3 ;; *) echo "--rotate takes 90 or 270" >&2; exit 2 ;; esac

# only a USB stick, never the card the box runs from
TRAN="$(lsblk -dno TRAN "$DEV" 2>/dev/null || true)"
[ "$TRAN" = usb ] || { echo "$DEV isn't a USB drive ($TRAN): stopping" >&2; exit 2; }
ROOTDEV="$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null || true)"
[ "/dev/$ROOTDEV" != "$DEV" ] || { echo "$DEV is the disk this system runs from: stopping" >&2; exit 2; }
lsblk -o NAME,SIZE,MODEL,LABEL "$DEV"
read -r -p "Erase everything on $DEV and write Batocera? Type yes: " OK
[ "$OK" = yes ] || { echo "Stopped."; exit 1; }

for p in $(lsblk -lno NAME "$DEV" | tail -n +2); do sudo umount "/dev/$p" 2>/dev/null || true; done
echo "Writing (a few minutes)…"
case "$IMG" in
  *.gz) gzip -dc "$IMG" | sudo dd of="$DEV" bs=4M conv=fsync status=progress ;;
  *.xz) xz -dc "$IMG" | sudo dd of="$DEV" bs=4M conv=fsync status=progress ;;
  *.img) sudo dd if="$IMG" of="$DEV" bs=4M conv=fsync status=progress ;;
  *) echo "expected .img.gz, .img.xz or .img" >&2; exit 2 ;;
esac
sync; sudo partprobe "$DEV" 2>/dev/null || true; sleep 2

# its boot partition (label BATOCERA): the 5" screen's overlay, full USB power, and the picture turned to landscape
BOOT="$(sudo blkid -L BATOCERA 2>/dev/null || true)"
case "$BOOT" in "$DEV"*) ;; *) BOOT="${DEV}1" ;; esac
M="$(mktemp -d)"; sudo mount "$BOOT" "$M"
OVL="dtoverlay=vc4-kms-dsi-ili9881-5inch"; [ "$DSI" = 0 ] && OVL="$OVL,dsi0"
CFG="$M/config.txt"
if [ -f "$CFG" ]; then
  sudo sed -i '/^# >>> nb-box/,/^# <<< nb-box/d' "$CFG"
  printf '# >>> nb-box (Nate Bloom Box: the 5" Touch Display 2)\n[all]\n%s\nusb_max_current_enable=1\n# <<< nb-box\n' "$OVL" | sudo tee -a "$CFG" >/dev/null
else echo "warning: no config.txt on the stick; the screen may stay dark (use HDMI)" >&2; fi
BC="$M/batocera-boot.conf"
if [ -f "$BC" ]; then
  sudo sed -i '/^#\?display\.rotate=/d' "$BC"; echo "display.rotate=$R" | sudo tee -a "$BC" >/dev/null
fi
sync; sudo umount "$M"; rmdir "$M"
echo
echo "Done. With the stick in, pick Games on the box's home screen (or turn the box on with it plugged in)."
echo "If the picture is upside down, run this again with --rotate $([ "$ROT" = 90 ] && echo 270 || echo 90)."
echo "To go back to Nate Bloom: quit Batocera (Start > Quit > Shut down), take the stick out, turn the box on."
