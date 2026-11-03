#!/bin/bash
# (177) CI: VST3 and CLAP plugins in the installed app (see plug_check.py). The test plugins (plugtest/) are built into
# ~/.clap and ~/.vst3; Surge XT (GPL-3, from its releases) is installed if it can be fetched, as a real plugin with a
# real window. Never fails the build.
set -x
OUT=${1:-/tmp/nb-plug}; mkdir -p "$OUT"
BIN=$(command -v nate-bloom || echo "/opt/Nate Bloom/nate-bloom")
H=linux/native/third_party
mkdir -p ~/.clap ~/.vst3/nbtest.vst3/Contents/x86_64-linux
g++ -std=c++17 -O2 -fPIC -shared -I$H/clap/include linux/ci/plugtest/testclap.cc -o ~/.clap/nbtest.clap -lX11 > "$OUT/build_test.txt" 2>&1
g++ -std=c++17 -O2 -fPIC -shared -I$H/vst3 linux/ci/plugtest/testvst3.cc $H/vst3/pluginterfaces/base/funknown.cpp -o ~/.vst3/nbtest.vst3/Contents/x86_64-linux/nbtest.so -lX11 >> "$OUT/build_test.txt" 2>&1
ls -la ~/.clap ~/.vst3/nbtest.vst3/Contents/x86_64-linux >> "$OUT/build_test.txt" 2>&1
TRY="NB Test Sine,NB Test VSine"
U=$(gh api repos/surge-synthesizer/releases-xt/releases/latest --jq '.assets[] | select(.name | test("linux-x(86_)?64.*\\.deb$")) | .browser_download_url' 2>/dev/null | head -1)
if [ -n "$U" ] && curl -sSL -o /tmp/surge.deb "$U" && sudo apt-get install -y /tmp/surge.deb > "$OUT/surge_install.txt" 2>&1; then
  TRY="$TRY,Surge XT#CLAP,Surge XT#VST3"; echo "Surge XT: $U" >> "$OUT/surge_install.txt"
else echo "no Surge XT ($U)" >> "$OUT/surge_install.txt"; fi
ls /usr/lib/vst3 /usr/lib/clap >> "$OUT/surge_install.txt" 2>&1
sudo apt-get install -y imagemagick x11-apps > /dev/null 2>&1
pip install -q playwright
pkill -f "^/opt/Nate Bloom/nate-bloom" 2>/dev/null; sleep 2
rm -f "$HOME/.config/Nate Bloom/window.json"; rm -rf "$HOME/.config/Nate Bloom/site"
Xvfb :57 -screen 0 1600x1000x24 -nolisten tcp > "$OUT/xvfb.txt" 2>&1 & XV=$!
sleep 2; export DISPLAY=:57
NB_NO_UPDATE=1 NB_FASTPADS_NULL=1 NB_DEBUG=1 "$BIN" --no-sandbox --remote-debugging-port=9336 > "$OUT/app.txt" 2>&1 &
sleep 10
timeout 400 python3 linux/ci/plug_check.py 9336 "$OUT" "$TRY" > "$OUT/checks.txt" 2>&1
cat "$OUT/checks.txt"
pkill -f "^/opt/Nate Bloom/nate-bloom" 2>/dev/null; sleep 1; kill $XV 2>/dev/null
cp /tmp/nb-plugtest-*.log "$OUT/" 2>/dev/null
grep -iv "dbus" "$OUT/app.txt" | tail -30
exit 0
