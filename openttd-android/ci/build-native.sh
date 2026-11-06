#!/bin/bash
# Builds SDL2 and OpenTTD for one Android ABI. Usage: build-native.sh <abi> <work dir> <out jniLibs dir>
# Expects $ANDROID_NDK_HOME, OpenTTD source at <work>/openttd (patched), SDL at <work>/sdl, host tools at <work>/host.
set -euo pipefail
ABI=$1; W=$2; OUT=$3
TC=$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake
PFX=$W/prefix-$ABI
COMMON=(-G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=$TC -DANDROID_ABI=$ABI -DANDROID_PLATFORM=android-24 -DANDROID_STL=c++_static)
cmake -S $W/sdl -B $W/b-sdl-$ABI "${COMMON[@]}" -DCMAKE_INSTALL_PREFIX=$PFX -DSDL_SHARED=ON -DSDL_STATIC=OFF -DSDL_TEST=OFF
cmake --build $W/b-sdl-$ABI
cmake --install $W/b-sdl-$ABI
cmake -S $W/openttd -B $W/b-ottd-$ABI "${COMMON[@]}" \
  -DHOST_BINARY_DIR=$W/host \
  -DCMAKE_FIND_ROOT_PATH=$PFX -DCMAKE_PREFIX_PATH=$PFX -DSDL2_DIR=$PFX/lib/cmake/SDL2 \
  -DCMAKE_DISABLE_FIND_PACKAGE_CURL=ON -DCMAKE_DISABLE_FIND_PACKAGE_Allegro=ON -DCMAKE_DISABLE_FIND_PACKAGE_Freetype=ON \
  -DCMAKE_DISABLE_FIND_PACKAGE_Fluidsynth=ON -DCMAKE_DISABLE_FIND_PACKAGE_Harfbuzz=ON -DCMAKE_DISABLE_FIND_PACKAGE_ICU=ON \
  -DCMAKE_DISABLE_FIND_PACKAGE_OpusFile=ON -DCMAKE_DISABLE_FIND_PACKAGE_OpenGL=ON -DCMAKE_DISABLE_FIND_PACKAGE_Grfcodec=ON \
  -DCMAKE_DISABLE_FIND_PACKAGE_unofficial-breakpad=ON
cmake --build $W/b-ottd-$ABI --target openttd
mkdir -p $OUT/$ABI
cp $PFX/lib/libSDL2.so $OUT/$ABI/
cp $W/b-ottd-$ABI/libmain.so $OUT/$ABI/
$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip --strip-unneeded $OUT/$ABI/*.so
ls -la $OUT/$ABI
