#!/bin/bash
# Usage: smoke.sh <out> <apk>. Install Family Games, tap the button, confirm each install, check both games got installed.
set -x
OUT=$1; APK=$2; PKG=org.natebloom.familygames
mkdir -p "$OUT"
adb wait-for-device
for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ] && break; sleep 2; done
sleep 5; adb shell wm size 2560x1600; adb shell wm density 320
adb shell settings put global hide_error_dialogs 1 || true
shot() { timeout 60 adb exec-out screencap -p > "$OUT/shot-$1.png"; }
# tap the on-screen element whose text matches $1 (from the UI dump)
taptext() {
  timeout 30 adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  b=$(timeout 30 adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep -i "text=\"$1\"" | head -1 | sed -n 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]".*/\1 \2 \3 \4/p')
  [ -z "$b" ] && { echo "no '$1' on screen"; return 1; }
  set -- $b; timeout 20 adb shell input tap $(( ($1+$3)/2 )) $(( ($2+$4)/2 )); echo tapped
}
timeout 300 adb install -r "$APK" > "$OUT/install.txt" 2>&1; cat "$OUT/install.txt"
timeout 30 adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1; sleep 5; shot start
# first tap: asks for "Allow from this source"
taptext "Install the games"; sleep 4; shot allow
taptext "Allow from this source" || timeout 20 adb shell appops set $PKG REQUEST_INSTALL_PACKAGES allow
sleep 2; timeout 20 adb shell input keyevent BACK; sleep 3
taptext "Install the games"; sleep 2
for k in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 10; shot step$k
  taptext "Install" || taptext "INSTALL" || true
  timeout 20 adb shell pm list packages | grep -q org.natebloom.openttd && break
done
sleep 5; shot done
P=$(timeout 20 adb shell pm list packages | tr -d '\r' | grep -E "pocketpet|openttd")
echo "installed: $P" | tee "$OUT/checks.txt"
echo "$P" | grep -q pocketpet && echo "$P" | grep -q openttd || { echo "FAIL: not both installed"; exit 1; }
exit 0
