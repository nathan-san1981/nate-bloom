"""Changes to upstream OpenTTD so it builds as an Android app (an SDL2 shared library, libmain.so).
Usage: python3 apply.py <OpenTTD source dir>. Each change must match exactly once, so an upstream change is caught."""
import sys, os
root = sys.argv[1]

def patch(rel, a, b):
    p = os.path.join(root, rel)
    s = open(p, encoding="utf-8").read()
    if s.count(a) != 1:
        sys.exit(f"apply.py: {rel}: expected one match for {a[:70]!r}, found {s.count(a)}")
    open(p, "w", encoding="utf-8").write(s.replace(a, b))

# the game is a shared library that SDL's Java activity loads, not an executable
patch("CMakeLists.txt", "add_executable(openttd WIN32)\n",
      "if(ANDROID)\n    add_library(openttd SHARED)\nelse()\n    add_executable(openttd WIN32)\nendif()\n")
patch("CMakeLists.txt", 'set_target_properties(openttd PROPERTIES OUTPUT_NAME "${BINARY_NAME}")\n',
      'set_target_properties(openttd PROPERTIES OUTPUT_NAME "${BINARY_NAME}")\n'
      'if(ANDROID)\n    set_target_properties(openttd PROPERTIES OUTPUT_NAME "main")\n    target_link_libraries(openttd android log)\nendif()\n')
patch("CMakeLists.txt", "if(IPO_FOUND)\n", "if(IPO_FOUND AND NOT ANDROID)\n")
patch("CMakeLists.txt", "include(InstallAndPackage)\n", "if(NOT ANDROID)\n    include(InstallAndPackage)\nendif()\n")

# SDL calls SDL_main; the game's files live in the app's private storage
patch("src/os/unix/unix_main.cpp", '#include <time.h>\n',
      '#include <time.h>\n'
      '#if defined(__ANDROID__)\n#\tinclude <SDL.h>\n#\tinclude <unistd.h>\n#\tinclude <stdlib.h>\n#\tinclude <string>\n#endif\n')
patch("src/os/unix/unix_main.cpp", "int CDECL main(int argc, char *argv[])\n{\n",
      "int CDECL main(int argc, char *argv[])\n{\n"
      "#if defined(__ANDROID__)\n"
      "\t/* Unicorn Railways: everything (base sets, config, saves) is under the app's internal storage,\n"
      "\t * which the activity fills from the APK's assets before the game starts. */\n"
      "\tconst char *home = SDL_AndroidGetInternalStoragePath();\n"
      "\tif (home != nullptr) {\n"
      "\t\tsetenv(\"HOME\", home, 1);\n"
      "\t\tsetenv(\"XDG_DATA_HOME\", (std::string(home) + \"/data\").c_str(), 1);\n"
      "\t\tsetenv(\"XDG_CONFIG_HOME\", (std::string(home) + \"/config\").c_str(), 1);\n"
      "\t\tif (chdir(home) != 0) { /* the game still starts; it just finds no base set */ }\n"
      "\t}\n"
      "#endif\n")
# bionic has open/fdatasync but doesn't define _POSIX_C_SOURCE
patch("src/ini.cpp", "#if (defined(_POSIX_C_SOURCE) && _POSIX_C_SOURCE >= 199309L) || (defined(_XOPEN_SOURCE) && _XOPEN_SOURCE >= 500)\n",
      "#if (defined(_POSIX_C_SOURCE) && _POSIX_C_SOURCE >= 199309L) || (defined(_XOPEN_SOURCE) && _XOPEN_SOURCE >= 500) || defined(__ANDROID__)\n")
print("apply.py: OpenTTD patched for Android")
