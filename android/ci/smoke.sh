#!/bin/bash
# Runs inside the emulator job: install the APK on a tablet-shaped emulator (2560x1600, like the Tab S10 FE+),
# start it, drive it through the WebView debugger, and keep a log and screenshots for the ci-logs branch.
set -x
OUT=${1:-/tmp/smoke}
APK=${2:-android/app/build/outputs/apk/release/app-release.apk}
mkdir -p "$OUT"
adb wait-for-device
adb shell wm size 2560x1600
adb shell wm density 320
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1
adb install -r -g "$APK" > "$OUT/install.txt" 2>&1
cat "$OUT/install.txt"
adb logcat -c
adb shell am start -n com.natebloom.app/.MainActivity
sleep 25
SOCK=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1)
echo "devtools socket: $SOCK"
adb forward tcp:9222 "localabstract:$SOCK"
python3 android/ci/cdp_smoke.py "$OUT" > "$OUT/checks.txt" 2>&1
cat "$OUT/checks.txt"
adb shell ls -l "/sdcard/Download/Nate Bloom/" > "$OUT/downloads.txt" 2>&1
cat "$OUT/downloads.txt"
adb logcat -d -s NateBloom:V NateBloomFast:V chromium:V AndroidRuntime:E > "$OUT/logcat.txt"
tail -40 "$OUT/logcat.txt"
exit 0
