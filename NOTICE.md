# Licenses

**Nate Bloom** — the web app (`index.html`, `lite/`), Nate Bloom's own plugins (`wam/natebloom/`), the native code
(`native/`) and the Android and Linux apps (`android/`, `linux/`) — is free software: you can redistribute it and/or
modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either
version 3 of the License, or (at your option) any later version. See `LICENSE`.

Copyright © 2026 Nathan (github.com/nathan-san1981).

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

The other projects in this repository (`unicorn-*`, `brogue/`) are separate and aren't covered by this notice;
Brogue keeps its own licence (`brogue/LICENSE.txt`).

## What the apps include from others

| Part | Where | Licence |
|---|---|---|
| Ableton Link 4.1.1, © Ableton AG | fetched at build time into `native/ablink/link` (github.com/Ableton/link) | GPL-2.0-or-later |
| asio (standalone), Christopher M. Kohlhoff | with Ableton Link | Boost Software License 1.0 |
| wasm2c runtime (WABT), the WebAssembly Community Group | `native/nbsynth/wasm-rt*` | Apache-2.0 |
| SIMD Everywhere (SIMDe) | fetched at build time into `native/nbsynth/simde` | MIT |
| miniaudio, David Reid | `linux/native/miniaudio.h` | Public domain (Unlicense) or MIT-0 |
| Electron (Chromium, Node.js) | the Linux app | MIT, and Chromium's own licences |
| AndroidX, Kotlin standard library | the Android app | Apache-2.0 |
| Faust libraries (reverbs, physical models, filters) | in Nate Bloom's own plugins, `wam/natebloom/` | per library: MIT-style (STK-4.3), LGPL with exception, and others, as declared in each `.dsp` |
| Sequencer Party plugins, Tom Burns | `wam/burns-audio/` | MIT |
| Wimmics community plugins and the WAM SDK | `wam/wimmics/` | per plugin, as declared in its source (several GPL-3.0 and GPL-2.0-or-later, some MIT, STK-4.3, LGPL, CC0/BSL); the SDK is MIT |
| Studio instrument recordings | `inst/v1/` | see `inst/v1/CREDITS.txt` (CC BY 3.0 and CC0 1.0) |

The Apache-2.0 parts are why Nate Bloom is under version 3 of the GPL: Apache-2.0 code can go into a GPL-3.0 program,
not a GPL-2.0-only one. Ableton Link's "version 2 or later" allows version 3.

The source for every release of the apps is this repository at the release's commit, plus Ableton Link and SIMDe at
the versions the build workflows (`.github/workflows/android.yml`, `linux.yml`) fetch.
