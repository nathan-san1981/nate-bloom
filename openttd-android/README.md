# Unicorn Railways (OpenTTD for Fire tablets)

OpenTTD built for Android (Fire OS 7/8) on SDL2, with the free OpenGFX and OpenSFX base sets inside the APK.

- `patches/apply.py` — the changes to upstream OpenTTD: built as SDL's `libmain.so`, files kept in the app's own storage.
- `ci/build-native.sh` — SDL2 + OpenTTD for one ABI with the NDK (arm64-v8a, armeabi-v7a, x86_64 for the emulator).
- `app/` — the Android app: SDL's Java activity plus `RailwaysActivity`, which unpacks the game files on first start.
- `.github/workflows/openttd-android.yml` — builds, tests on Android 9 and 11 emulators at 1024x600, and pushes logs and
  screenshots to the `railways-ci` branch. A commit message with `[release]` also publishes the APK.

OpenTTD is GPL v2 (https://www.openttd.org); OpenGFX and OpenSFX are GPL v2 / CC BY-SA. SDL2 is zlib-licensed.
