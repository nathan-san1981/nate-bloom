#!/bin/bash
# Inside the emulator job. Usage: smoke.sh <out dir> <apk> <package> <WxH> <density>
#   kid:  a Fire 7-shaped screen (1024x600, 160 dpi)     full: a Galaxy Tab S10 FE+-shaped screen (2560x1600, 320 dpi)
# Title screen, then a new game started straight onto a map, driven by touch: drag the map, press-and-hold for a
# right click, Back. (Pinch needs two fingers, which adb can't send.) Screenshots and the log are kept.
set -x
OUT=$1; APK=$2; PKG=$3; SIZE=${4:-1024x600}; DPI=${5:-160}
W=${SIZE%x*}; H=${SIZE#*x}; ACT=$PKG/com.unicornclock.railways.RailwaysActivity
mkdir -p "$OUT"
adb wait-for-device
for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ] && break; sleep 2; done
sleep 5; adb shell wm size $SIZE; adb shell wm density $DPI
adb shell settings put system accelerometer_rotation 0 || true
# Android's one-time "Viewing full screen" tip would cover the game and eat the first touches
adb shell settings put secure immersive_mode_confirmations confirmed || true
adb install -r -g "$APK" > "$OUT/install.txt" 2>&1; cat "$OUT/install.txt"
shot() { timeout 60 adb exec-out screencap -p > "$OUT/shot-$1.png"; }
alive() { echo "$1 pid=$(timeout 20 adb shell pidof $PKG | tr -d '\r')" | tee -a "$OUT/checks.txt"; }
adb logcat -c
timeout 30 adb shell am start -n $ACT 2>&1 | tee "$OUT/start.txt"
sleep 15; shot title; alive title
timeout 60 adb shell dumpsys window | grep -E "mCurrentFocus|InsetsSource|navigationBars" | head -8 > "$OUT/window.txt"
if [ "$PKG" = "com.unicornclock.railways" ]; then
  # Unicorn Railways opens straight into her world with the picture toolbar (2 columns of 88x80 buttons, top left)
  sleep 20; shot kid-world; alive kid-world
  # Road: drag a road across the middle
  timeout 60 adb shell input tap 58 54; sleep 2; shot kid-roadtool; alive kid-roadtool
  timeout 60 adb shell input swipe 400 300 800 300 1500; sleep 2; shot kid-road
  # Bus stop at both ends of it
  timeout 60 adb shell input tap 58 152; sleep 1
  timeout 60 adb shell input tap 420 300; sleep 1; timeout 60 adb shell input tap 780 300; sleep 2; shot kid-stops
  # New bus!
  timeout 60 adb shell input tap 58 250; sleep 4; shot kid-bus
  timeout 60 adb shell input tap 164 348; sleep 25; shot kid-bus-moving; alive kid-bus
  # Home: saves her world and goes back
  timeout 60 adb shell input tap 112 516; sleep 6; alive kid-home
  timeout 30 adb shell am start -n $ACT; sleep 20; shot kid-reopened; alive kid-reopened
  timeout 60 adb shell run-as $PKG ls -la files/data/openttd/save > "$OUT/saves.txt" 2>&1 || true
fi
timeout 30 adb shell am force-stop $PKG; sleep 3
timeout 30 adb shell am start -n $ACT --es ottd_args "-g" 2>&1 | tee -a "$OUT/start.txt"
sleep 25; shot game; alive game
# one finger drags the map (from the middle, a third of the screen to the left and up)
timeout 60 adb shell input swipe $((W/2)) $((H/2)) $((W/6)) $((H/3)) 700; sleep 2; shot drag
# a tap on the map (no tool picked: shows nothing harmful), then press-and-hold on the first toolbar button (tooltip)
timeout 60 adb shell input tap $((W/2)) $((H/2)); sleep 1
timeout 60 adb shell input swipe $((W/2)) $((H*2/100)) $((W/2)) $((H*2/100)) 900; sleep 1; shot hold
timeout 60 adb shell input keyevent BACK; sleep 2; shot back; alive back
timeout 60 adb shell dumpsys meminfo $PKG | grep -E "TOTAL|Native Heap" > "$OUT/meminfo.txt" 2>&1
timeout 60 adb logcat -d > "$OUT/logcat-full.txt"
grep -iE "UnicornRailways|SDL|openttd|AndroidRuntime|FATAL|crash|signal| DEBUG |backtrace|#[0-9][0-9] pc" "$OUT/logcat-full.txt" | tail -600 > "$OUT/logcat.txt"
gzip -f "$OUT/logcat-full.txt"
cat "$OUT/checks.txt" "$OUT/meminfo.txt" "$OUT/window.txt"
exit 0
