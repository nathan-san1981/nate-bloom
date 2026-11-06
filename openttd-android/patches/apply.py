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
      '#if defined(__ANDROID__)\n#\tinclude <SDL.h>\n#\tinclude <unistd.h>\n#\tinclude <stdlib.h>\n#\tinclude <string>\n'
      '#\tinclude <pthread.h>\n#\tinclude <android/log.h>\n'
      '/* Android drops stdout/stderr; send the game\'s messages to the system log (tag OpenTTD). */\n'
      'static int _log_pipe[2];\n'
      'static void *LogPipeThread(void *)\n{\n'
      '\tchar buf[1024]; std::string line; ssize_t n;\n'
      '\twhile ((n = read(_log_pipe[0], buf, sizeof(buf))) > 0) {\n'
      '\t\tfor (ssize_t i = 0; i < n; i++) {\n'
      '\t\t\tif (buf[i] == \'\\n\') { __android_log_write(ANDROID_LOG_INFO, "OpenTTD", line.c_str()); line.clear(); } else line += buf[i];\n'
      '\t\t}\n\t}\n\treturn nullptr;\n}\n'
      'static void LogToLogcat()\n{\n'
      '\tif (pipe(_log_pipe) != 0) return;\n'
      '\tsetvbuf(stdout, nullptr, _IOLBF, 0); setvbuf(stderr, nullptr, _IONBF, 0);\n'
      '\tdup2(_log_pipe[1], 1); dup2(_log_pipe[1], 2);\n'
      '\tpthread_t t; pthread_create(&t, nullptr, LogPipeThread, nullptr); pthread_detach(t);\n}\n'
      '#endif\n')
patch("src/os/unix/unix_main.cpp", "int CDECL main(int argc, char *argv[])\n{\n",
      "int CDECL main(int argc, char *argv[])\n{\n"
      "#if defined(__ANDROID__)\n"
      "\t/* Unicorn Railways: everything (base sets, config, saves) is under the app's internal storage,\n"
      "\t * which the activity fills from the APK's assets before the game starts. */\n"
      "\tLogToLogcat();\n"
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
# the touch layer (patches/touch_android.inc) in the SDL2 video driver
touch = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "touch_android.inc"), encoding="utf-8").read()
patch("src/video/sdl2_v.cpp", '#include "../safeguards.h"\n',
      '#if defined(__ANDROID__)\n#\tinclude "../viewport_func.h"\n#\tinclude "../zoom_func.h"\n#\tinclude "../window_gui.h"\n'
      '#\tinclude "../tilehighlight_func.h"\n#\tinclude <vector>\n#\tinclude <algorithm>\n#\tinclude <cmath>\n#endif\n#include "../safeguards.h"\n')
patch("src/video/sdl2_v.cpp", "bool VideoDriver_SDL_Base::PollEvent()\n",
      "#if defined(__ANDROID__)\n" + touch + "#endif\n\nbool VideoDriver_SDL_Base::PollEvent()\n")
patch("src/video/sdl2_v.cpp", "\tif (!SDL_PollEvent(&ev)) return false;\n",
      "#if defined(__ANDROID__)\n\tTouchTick();\n\tif (!SDL_PollEvent(&ev)) return false;\n\tif (TouchEvent(ev, this->sdl_window)) return true;\n"
      "#else\n\tif (!SDL_PollEvent(&ev)) return false;\n#endif\n")
patch("src/video/sdl2_v.cpp", "\tif (SDL_InitSubSystem(SDL_INIT_VIDEO) < 0) return SDL_GetError();\n",
      "#if defined(__ANDROID__)\n\tSDL_SetHint(SDL_HINT_TOUCH_MOUSE_EVENTS, \"0\");\n\tSDL_SetHint(SDL_HINT_ANDROID_TRAP_BACK_BUTTON, \"1\");\n#endif\n"
      "\tif (SDL_InitSubSystem(SDL_INIT_VIDEO) < 0) return SDL_GetError();\n")

# ---- Unicorn Railways kid layer (patches/kid_gui.cpp), switched on by UNICORN_KID ----
import shutil
shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), "kid_gui.cpp"), os.path.join(root, "src", "kid_gui.cpp"))
patch("src/CMakeLists.txt", "    main_gui.cpp\n", "    main_gui.cpp\n    kid_gui.cpp\n")
patch("src/window_type.h", "\tWC_HELPWIN,\n\n\tWC_INVALID = 0xFFFF,", "\tWC_HELPWIN,\n\n\tWC_KID_TOOLBAR, ///< Unicorn Railways: the kid toolbar.\n\n\tWC_INVALID = 0xFFFF,")
patch("src/main_gui.cpp", "void ShowVitalWindows()\n{\n", "extern bool _kid_mode;\nvoid ShowKidToolbar();\nvoid ShowVitalWindows()\n{\n\tif (_kid_mode && _game_mode == GM_NORMAL) { ShowKidToolbar(); return; }\n")
patch("src/os/unix/unix_main.cpp", "\tLogToLogcat();\n", "\tLogToLogcat();\n\t{ extern bool _kid_mode; const char *k = getenv(\"UNICORN_KID\"); _kid_mode = k != nullptr && k[0] == '1'; }\n")
# the kid build has no main toolbar: windows that line up under it go to the top right instead
patch("src/window.cpp", "\tconst Window *w = FindWindowById(WC_MAIN_TOOLBAR, 0);\n\tassert(w != nullptr);\n",
      "\tconst Window *w = FindWindowById(WC_MAIN_TOOLBAR, 0);\n\tif (w == nullptr) return { _screen.width - window_width, 0 };\n")
patch("src/news_gui.cpp", "\t\tthis->status_height = FindWindowById(WC_STATUS_BAR, 0)->height;", "\t\t{ const Window *sb = FindWindowById(WC_STATUS_BAR, 0); this->status_height = sb != nullptr ? sb->height : 0; }")
# let Android's own crash reporter print a backtrace (OpenTTD's handler has none on Android)
patch("src/os/unix/unix_main.cpp", "\tCrashLog::InitialiseCrashLog();\n", "#if !defined(__ANDROID__)\n\tCrashLog::InitialiseCrashLog();\n#endif\n")
print("apply.py: OpenTTD patched for Android")
