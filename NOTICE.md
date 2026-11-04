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
| CLAP, the plugin format's headers, free-audio | fetched at build time into `linux/native/third_party/clap` (github.com/free-audio/clap); the Linux app's plugin host | MIT |
| VST 3 interfaces, © Steinberg Media Technologies GmbH | fetched at build time into `linux/native/third_party/vst3/pluginterfaces` (github.com/steinbergmedia/vst3_pluginterfaces); the Linux app's plugin host. VST is a registered trademark of Steinberg Media Technologies GmbH | MIT |
| LV2, the plugin format's headers, and lilv's header, © David Robillard and others | fetched at build time into `linux/native/third_party/lv2` and `lilv` (github.com/lv2/lv2, github.com/lv2/lilv); the Linux app's plugin host opens the system's lilv library when it runs | ISC |
| miniaudio, David Reid | `linux/native/miniaudio.h` | Public domain (Unlicense) or MIT-0 |
| Electron (Chromium, Node.js) | the Linux app | MIT, and Chromium's own licences |
| AndroidX, Kotlin standard library | the Android app | Apache-2.0 |
| Faust libraries (reverbs, physical models, filters) | in Nate Bloom's own plugins, `wam/natebloom/` | per library: MIT-style (STK-4.3), LGPL with exception, and others, as declared in each `.dsp` |
| Sequencer Party plugins, Tom Burns | `wam/burns-audio/` | MIT |
| Plaits (the macro oscillator) and stmlib, © Emilie Gillet (Mutable Instruments) | compiled into `wam/natebloom/twist/dsp.wasm` (Twist); the Rhythm Creator's Analog drum models are after its drum engines | MIT |
| Ultramaster KR-106's engine, © Karl LaRocca (Kayrock) | compiled into `wam/natebloom/juno106/dsp.wasm` (Juno 106), with its 256 factory patches; its IR3109 filter, BBD chorus and resamplers also in Unicorn Dream, Fuzz Bass and the Juno Chorus effect (headers in `wam/natebloom/portsrc/kr106/`) | GPL-3.0 |
| jc303's diode ladder filter (after Will Pirkle's AN-6), © midilab | compiled into `wam/natebloom/fuzz_bass/dsp.wasm` (Fuzz Bass); source in `wam/natebloom/portsrc/fuzz_bass/` | GPL-3.0 |
| Dexed's DX7 engine: msfa, © 2012 Google Inc. and © 2016-2025 Pascal Gauthier (Apache-2.0); EngineMkI, © Pascal Gauthier (GPL-3.0) | compiled into `wam/natebloom/pop89/dsp.wasm` (Pop 89); source in `wam/natebloom/portsrc/dx7/` | Apache-2.0 / GPL-3.0 |
| Galactic3, © Chris Johnson (Airwindows) | compiled into `wam/natebloom/galactic/dsp.wasm` (Galactic) and Unicorn Dream's reverb | MIT |
| TapeDelay2, ToTape6 and DeRez2, © Chris Johnson (Airwindows) | compiled into Tape Echo, Tape and Lo-Fi (`wam/natebloom/tapeecho`, `tape`, `lofi`); source in `wam/natebloom/portsrc/` | MIT |
| Wimmics community plugins and the WAM SDK | `wam/wimmics/` | per plugin, as declared in its source (several GPL-3.0 and GPL-2.0-or-later, some MIT, STK-4.3, LGPL, CC0/BSL); the SDK is MIT |
| Studio instrument recordings | `inst/v1/` | see `inst/v1/CREDITS.txt` (CC BY 3.0 and CC0 1.0) |
| The CMU Pronouncing Dictionary, © 1993–2015 Carnegie Mellon University | packed into the web app (`index.html`, `lite/`) for Speech | BSD-2-Clause style, below |

The Apache-2.0 parts are why Nate Bloom is under version 3 of the GPL: Apache-2.0 code can go into a GPL-3.0 program,
not a GPL-2.0-only one. Ableton Link's "version 2 or later" allows version 3.

The source for every release of the apps is this repository at the release's commit, plus Ableton Link, SIMDe and the
CLAP and VST 3 headers at the versions the build workflows (`.github/workflows/android.yml`, `linux.yml`) fetch.

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
