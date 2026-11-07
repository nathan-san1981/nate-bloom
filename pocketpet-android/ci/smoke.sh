#!/bin/bash
# S10 FE+-shaped emulator (2560x1600): install, start, pick a pet by touch, check it runs and saves, keep screenshots.
set -x
OUT=$1; APK=$2; PKG=org.natebloom.pocketpet
mkdir -p "$OUT"
adb wait-for-device
for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ] && break; sleep 2; done
sleep 5; adb shell wm size 2560x1600; adb shell wm density 320
adb shell settings put system accelerometer_rotation 0 || true
adb shell settings put secure immersive_mode_confirmations confirmed || true
timeout 300 adb install -r -g "$APK" > "$OUT/install.txt" 2>&1; cat "$OUT/install.txt"
shot() { timeout 60 adb exec-out screencap -p > "$OUT/shot-$1.png"; }
alive() { echo "$1 pid=$(timeout 20 adb shell pidof $PKG | tr -d '\r')" | tee -a "$OUT/checks.txt"; }
adb logcat -c
timeout 30 adb shell am start -n $PKG/.MainActivity
sleep 8; shot pick; alive pick
# Unicorn tile (top-left of the grid), first name, Get my egg
timeout 30 adb shell input tap 234 424; sleep 2; shot name
timeout 30 adb shell input tap 340 304; sleep 2; shot shell
timeout 30 adb shell input tap 1280 1456; sleep 3; shot egg; alive egg
sleep 70; shot hatched
timeout 30 adb shell am force-stop $PKG; sleep 2
timeout 30 adb shell am start -n $PKG/.MainActivity; sleep 6; shot reopened; alive reopened
timeout 60 adb logcat -d > "$OUT/logcat-full.txt"
grep -iE "pocketpet|chromium|console|AndroidRuntime|FATAL" "$OUT/logcat-full.txt" | tail -200 > "$OUT/logcat.txt"; gzip -f "$OUT/logcat-full.txt"
cat "$OUT/checks.txt"
exit 0
