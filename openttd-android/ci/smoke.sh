#!/bin/bash
# Inside the emulator job: a Fire 7-shaped screen (1024x600), install, start, check the game is running and drawing,
# tap the title screen, keep screenshots and the log.
set -x
OUT=${1:-/tmp/ur-test}; APK=$2; PKG=com.unicornclock.railways
mkdir -p "$OUT"
adb wait-for-device
for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ] && break; sleep 2; done
sleep 5; adb shell wm size 1024x600; adb shell wm density 160
adb shell settings put system accelerometer_rotation 0 || true
adb install -r -g "$APK" > "$OUT/install.txt" 2>&1; cat "$OUT/install.txt"
adb logcat -c
timeout 30 adb shell am start -n $PKG/.RailwaysActivity 2>&1 | tee "$OUT/start.txt"
for t in 10 30 60; do
  sleep $([ $t = 10 ] && echo 10 || echo 20)
  adb exec-out screencap -p > "$OUT/shot-${t}s.png"
  echo "${t}s pid=$(adb shell pidof $PKG | tr -d '\r')" | tee -a "$OUT/checks.txt"
done
# tap New Game on the title menu, then the world-generation window's Generate button (bottom right of the window)
adb shell input tap 511 141; sleep 4; adb exec-out screencap -p > "$OUT/shot-tap1.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
adb shell input tap 511 433; sleep 25; adb exec-out screencap -p > "$OUT/shot-tap2.png"
echo "after taps pid=$(adb shell pidof $PKG | tr -d '\r')" | tee -a "$OUT/checks.txt"
adb shell dumpsys meminfo $PKG | grep -E "TOTAL|Native Heap|Graphics" > "$OUT/meminfo.txt" 2>&1
adb shell run-as $PKG ls -laR files > "$OUT/files.txt" 2>&1
adb shell run-as $PKG cat files/config/openttd/openttd.cfg > "$OUT/openttd.cfg" 2>&1
adb logcat -d > "$OUT/logcat-full.txt"
grep -iE "UnicornRailways|SDL|openttd|dbg:|libmain|DEBUG|AndroidRuntime|FATAL|crash|signal" "$OUT/logcat-full.txt" | tail -400 > "$OUT/logcat.txt"
gzip -f "$OUT/logcat-full.txt"
cat "$OUT/checks.txt" "$OUT/meminfo.txt"; tail -80 "$OUT/logcat.txt"
exit 0
