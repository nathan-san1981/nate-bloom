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
| The CMU Pronouncing Dictionary, © 1993–2015 Carnegie Mellon University | packed into the web app (`index.html`, `lite/`) for Speech | BSD-2-Clause style, below |

The Apache-2.0 parts are why Nate Bloom is under version 3 of the GPL: Apache-2.0 code can go into a GPL-3.0 program,
not a GPL-2.0-only one. Ableton Link's "version 2 or later" allows version 3.

The source for every release of the apps is this repository at the release's commit, plus Ableton Link and SIMDe at
the versions the build workflows (`.github/workflows/android.yml`, `linux.yml`) fetch.

## The CMU Pronouncing Dictionary

Speech reads words with the CMU Pronouncing Dictionary (github.com/cmusphinx/cmudict), under this licence:

```
Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
   The contents of this file are deemed to be source code.

2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in
   the documentation and/or other materials provided with the
   distribution.

This work was supported in part by funding from the Defense Advanced
Research Projects Agency, the Office of Naval Research and the National
Science Foundation of the United States of America, and by member
companies of the Carnegie Mellon Sphinx Speech Consortium. We acknowledge
the contributions of many volunteers to the expansion and improvement of
this dictionary.

THIS SOFTWARE IS PROVIDED BY CARNEGIE MELLON UNIVERSITY ``AS IS'' AND
ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL CARNEGIE MELLON UNIVERSITY
NOR ITS EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

Speech's voices are Nate Bloom's own synthesis, after the machines they're named for and Plogue's Chipspeech; no code or recordings from Chipspeech are used.
