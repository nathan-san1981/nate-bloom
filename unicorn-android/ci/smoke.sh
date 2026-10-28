#!/bin/bash
# Runs inside the emulator job: a Fire 7-shaped emulator (1024x600, landscape), install the app, drive the clock
# through the WebView debugger, and keep logs + screenshots for the unicorn-ci branch.
set -x
OUT=${1:-/tmp/uc-smoke}
APK=${2:-unicorn-android/app/build/outputs/apk/release/app-release.apk}
PKG=com.unicornclock.app
mkdir -p "$OUT"
adb wait-for-device
for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ] && break; sleep 2; done
adb shell wm size 1024x600
adb shell wm density 160
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1
adb shell settings put global window_animation_scale 0
adb install -r -g "$APK" > "$OUT/install.txt" 2>&1
cat "$OUT/install.txt"
adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow
adb logcat -c
adb shell am start -n $PKG/.MainActivity
sleep 25
python3 unicorn-android/ci/cdp_clock.py "$OUT" > "$OUT/checks.txt" 2>&1
cat "$OUT/checks.txt"
adb logcat -d -s UnicornClock:V chromium:W AndroidRuntime:E TextToSpeech:V > "$OUT/logcat.txt"
tail -60 "$OUT/logcat.txt"
exit 0
