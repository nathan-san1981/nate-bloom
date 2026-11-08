# Nate Bloom source tree

The page is kept here in parts; `python3 build.py [outdir]` (repo root, default `dist/`) puts them together into
`index.html` (the site), `lite/` (Lite: `index.html`, `manifest.webmanifest`, `sw.js`, `sim.html`) and
`pocket-synth.html` (the Claude artifact). `python3 check.py` builds into a temp dir and compares every output byte for
byte with the published copies (exit 1 on any difference). `python3 src/tools/where.py TEXT` says which part holds a
piece of text and on which line. Standard library only, about a second.

## Rules

- `page/` is concatenated in filename order. Everything else gets in through include directives, expanded recursively:
  `<!--@include PATH-->`, `//@include PATH`, `/*@include PATH*/` (PATH relative to `src/`; a directory includes all
  its files in name order). A directive alone on its line replaces the whole line, so the included file carries its own
  final line break; a directive inside a line replaces only itself (the one-line `<script>…</script>` data blocks, whose
  files have no final line break).
- Variant blocks: a line that is exactly `//@site-only` (`<!--@site-only-->`, `/*@site-only*/`) starts a block that
  only the site and Lite get; `//@art-only` (…) one that only the artifact gets; `//@end` (`<!--@end-->`, `/*@end*/`)
  closes it. Marker lines are dropped from every output; blocks do not nest; leading whitespace is tolerated. A line
  that differs between the two is a site-only block followed by an art-only block.
- Lite is the finished site page with the substitutions in `tools/make_lite.py` applied (each must match exactly once).
- The artifact is written without a final line break; everything else about it is in the markers.
- A part boundary never splits a string, template literal or comment. New app code goes in a new `app/NNN-….js`
  (a new live step: between `650-…` and `900-minilab-close.js`, which closes the MiniLab/Live block).
- Byte discipline: read and write as UTF-8 with `newline=""`; nothing rewrites line endings or trailing whitespace.
- The shell is the interface (161). The old header, modes, tool row and ☰ menu are parked, not deleted, and nothing on
  the page brings them back: `localStorage` `nb-shell=old` (read by `shWant` in `660`) is the test suite's hook only,
  set by the older tests to drive the parked chrome. The `?shell=old` URL hatch of 161 went in 166; don't add another.

## Parts, in output order

### page/
| part | bytes | holds |
| --- | ---: | --- |
| `010-head.html` | 49,970 | `<!doctype>` … `<title>` as a site-only block (metas, manifest, icons, the small reset `<style>`), the artifact's one-line minified head + `claude:viewport-fit-sides` meta as an art-only block, then the font links and the opening `<style>` |
| `020-style.css` | 266,364 | the whole stylesheet; `[hidden]` rule art-only, `.rec` / `.pending` rules site-only |
| `030-body-open.html` | 93 | `</style>`, then `</head><body>` (site) or a blank line (artifact), and the flight recorder's `<script>` |
| `040-flight-recorder.js` | 3,004 | the flight recorder for the Report button (taps, settings, errors, slow frames, key repeat guard) |
| `050-body.html` | 132,362 | `</script>` + all body markup: toasts, header, tabs, scope, knobs, panels, sheets, DJ, Rhythm Creator, Beat Pads, Garage, Live…; `recBtn` and the `pending` take div site-only |
| `060-data-scripts.html` | 205 | the three data scripts: `NB_KITS` (site-only, `data/kits.js`), `NB_STUDIO` (`data/studio.js`), the `lameSrc` text/plain script (`data/lame.txt`) |
| `070-app.html` | 40 | `<script>` + `<!--@include app/-->` + `</script>`: the application |
| `080-tail.html` | 93 | `</body></html>`: one blank line + two lines (site), two blank lines + one line (artifact) |

### data/ (big payloads, exact bytes)
| part | bytes | holds |
| --- | ---: | --- |
| `kits.js` | 1,775,177 | `window.NB_KITS = {…};` sampled drum kits as base64 MP3 (site + Lite only) |
| `studio.js` | 2,066,455 | `window.NB_STUDIO = {…};` the Studio kit recordings (base64) |
| `lame.txt` | 156,043 | lamejs, the MP3 encoder, kept as text/plain and run in a worker |
| `rc-f808.js` | 217,008 | `const RC_F808 = […];` Michael Fischer's TR-808 samples (included from `app/230`) |
| `sp-dict.js` | 886,702 | the CMU Pronouncing Dictionary licence comment + `const SP_DICT_B64 = "…";` (included from `app/430`) |

### app/ (one IIFE, `(() => { "use strict"; … })();`)
| part | bytes | holds |
| --- | ---: | --- |
| `000-iife-open.js` | 26 | `(() => {` `"use strict";` |
| `010-engines-state-audio.js` | 18,886 | ENGINES + knob definitions, State (defaults, storage), Audio graph (context, master chain, effects) |
| `012-lazy-data.js` | 1,365 | 162: where the on-demand data lives (`NB_SND`), the Studio kit's fetch and warm-up |
| `020-samples-808-voices.js` | 27,086 | Samples (slots, decode, peaks), the 808, Voices (makeVoice, polyphony, MAX_VOICES) |
| `030-chords-knobs-keyboard.js` | 30,708 | Chords, Knobs (drawing, drag), Keyboard (keys, touch, computer keys) |
| `040-sequencer-voice-recorder.js` | 21,780 | Sequencer (grid, clock), tab/mode wiring; Voice recorder (hold to record) — site-only |
| `050-slices-pads-editor-instruments.js` | 53,790 | shared helpers, slicing, Pads, Sample editor, loadable instruments (SoundFont/SFZ/DecentSampler/multi-WAV), tabs + panel switching + startup |
| `060-sound-library.js` | 57,639 | Sound library: CATALOG, loading, sound bar, preview, browser, Library engine panel |
| `070-wheels-layers-808-beats.js` | 44,929 | pitch-bend / vibrato wheels; library layers & key zones (strips, Layers sheet, panel); 808 beats + per-sound pitch/length/volume |
| `080-arp-mixer-notation.js` | 51,110 | Arpeggiator + Arp panel; Mixer; Notation pad (spelling, drawing, editing, playback), piano roll, third view |
| `090-grid-also-playing-fxlab-fm.js` | 32,405 | Lighted note grid; every control on; "Also playing" strip; former Beta: FX Lab, FM engine, UI |
| `100-tracks.js` | 40,531 | Tracks multitrack editor: storage, model, rendering, touch editing, clips, import, playback, overdub, mixdown |
| `110-melodies-held-section-picker.js` | 25,852 | Melodies picker; Held notes; Section picker for long files |
| `120-batch1-motion-projects-sounds.js` | 27,782 | octave-up shifter, Motion (LFOs, XY pad), Freeze/Shimmer, file helpers, Projects, My sounds |
| `130-batch2-generative-chance-song.js` | 14,779 | Generative melodies (Evolve), sequencer chance and rolls, Song mode |
| `140-batch3-midi-exports-install.js` | 23,900 | store-only zip, Exports (stems, MIDI file, K.O. II pads), MIDI in/out + clock, Install as an app |
| `150-blend-drum-machines.js` | 15,518 | Blend; drum machines (808/909/CR-78), beats with rolls, grouping, style filter |
| `160-mixer-polish-demo-effects.js` | 35,533 | Mixer meter + Tracks volume; Polish batch (limiter, scale lock, tap tempo, undo, shortcuts, help); Demo phrases + docked FX Lab; Stop flushes tails; effects on/off; tablet keyboard; Drummer |
| `170-more-synths-classics-tabs.js` | 43,189 | four more synth engines, Classic Synths (30 sounds), Your tabs, long-press menu, Stacking engines |
| `180-dj.js` | 55,830 | DJ: two decks, beat-grid sync (dial + auto), 8-pad grab bank, waveforms (djTpl) |
| `190-per-sound-fx-auto-dj.js` | 46,722 | Per-sound effects; Auto DJ (queue, mix styles, mix tempo, beat) |
| `200-keylock-capture-mp3-phrases.js` | 32,671 | DJ key lock (STRETCH_SRC worklet), Capture last 90 s (CAP_SRC), MP3 export worker, phrase-aware mixing |
| `210-jam-input-sampler-tools.js` | 40,037 | Jam (loops + band); sample from an input (STR_SRC); progress strip; sampler tools (Tempo/Match/Fit/Length/Pitch, Loop); DJ next-deck choice |
| `220-report-fx-chain-resource-diet.js` | 28,272 | recording banner; Report zip; one place wires a sound's FX chain; resource diet; FX on picked sounds; vocal-separation cleanup; frame clock; Motion stage bypass; clean previews |
| `230-rhythm-creator.js` | 81,960 | Rhythm Creator: sounds list (+ `data/rc-f808.js`), pattern, bus, synthesized voices, sample voices, Analog worklet, hits, clock, pattern tools, screen |
| `240-ui-ux-round.js` | 33,679 | haptics, isolate gates, arp parts, Now playing, Back handling, undo toast, RC touch editing, Play view, feature row |
| `250-dj-cues-sync-ui-round2.js` | 32,379 | DJ start-together / Cue / hot cues; DJ sync to the other deck; RC Auto BPM; UI round 2; red global Stop; DJ key shift; DJ song structure |
| `260-dj-smart-mix.js` | 52,912 | DJ Smart mix (analysis, phrase matching, transitions) |
| `270-mashups-mouse-exit-rc-drums.js` | 32,362 | DJ → Tracks mashups; mouse wheel; fit on short windows; Exit; what-you-play row; RC real drums (Studio kit, feel, room, kit swap) |
| `280-fxlab-sections-hold-strip.js` | 23,010 | per-source mixer levels; RC time signatures, Fill, DJ sync readout; FX Lab section bar; live line; Hold On/Off, Arp On, Still playing strip |
| `290-beat-pads.js` | 40,899 | Beat Pads: 16×4 banks, sound out, quantize/swing, clock, recording, touch/keys, screen, loop strip, controls, chop |
| `300-beat-pads-2.js` | 19,948 | Beat Pads 2: sequences + song, 16 Levels, controls, offline render, MIDI in/clock out, MIDI sheet slider |
| `310-analog-core-backups.js` | 26,239 | analog core (NB_VCF_SRC worklet, drift, timing guard); storage status, backups, reminder; live stems (NB_STEMS_SRC); fuller MIDI file |
| `320-studio-fx-modulation.js` | 36,439 | Studio effects (NB_VERB_SRC reverbs, tempo echo, kick duck, FX tab row, mixer EQ); MIDI learn; per-note modulation; Tracks automation |
| `330-studio-instruments-android.js` | 81,071 | Studio instruments (NB_INST multisamples, downloads); Android app fast pads bridge; Play together buttons; Beat Pads key labels and kits |
| `340-plugins-wam.js` | 70,847 | Plugins: Web Audio Modules host, browser, parameters, routing |
| `350-master-record-scope-start.js` | 13,737 | Record the master output + export; Scope (rec waveform branch site-only; `setPlayback` guard differs); Start / unlock |
| `360-natewave-engine.js` | 57,279 | Natewave: WV_SRC processor source, wavetables, the processor per context, playing |
| `370-natewave-editor.js` | 58,422 | Natewave: editor, layout, wavetable picture, choosing, own wavetables from samples, bundled sounds, Mutate, macro faders |
| `380-morph.js` | 17,671 | Morph pad (four snapshots), Mutate with undo, eight macros |
| `390-chord-morph-sound-out-link.js` | 39,863 | Chord Morph; Sound out (output device); Link (tablet + computer, Wi-Fi); Ableton Link |
| `400-playing-together.js` | 33,779 | Playing together: every kind of sound at once |
| `410-garage-1.js` | 78,386 | Garage (opens its block): kinds, songs, time, sounds, audio tracks, drums, notes, transport, recording, mic takes, screen, Musical Typing, choose instrument, touch instruments, Autoplay |
| `420-garage-2.js` | 99,333 | Garage: Tracks timeline, piano roll, sheets, bar, the Garage tab, `__gb` exports (closes its block) |
| `430-speech.js` | 47,725 | Speech (opens its block): alphabet, dictionary (`data/sp-dict.js`), SP_WK processor source, words → phonemes, phonemes → sound targets |
| `440-speech-voices.js` | 23,790 | Speech voices: thirteen machines after Chipspeech (closes the Speech block) |
| `450-simpler-undo-sound-survives.js` | 39,334 | Simpler 124 / 125 / 126(131) top bars; Undo and redo across the app; sound that survives app switches and headphone changes (`visibilitychange` line differs) |
| `460-minilab.js` | 66,344 | MiniLab 3 (opens the MiniLab/Live block): controls, screens, targets, knobs, faders, big knob, layouts, MIDI in, readout, map, pad lights, MIDI sheet |
| `470-minilab-strip.js` | 23,161 | the strip across the top: pad jobs, drawing, touch, reassigning, its MIDI-sheet setting |
| `480-live.js` | 39,559 | Live screen: knob/fader roles, pad sets, MiniLab on Live, screen, top bar, effects, reassign, open/close; `window.__live` |
| `490-live-136-stage.js` | 28,101 | 136: lock, screen awake, level + limiter light, Gear, set list, Capture; `__live2` |
| `500-live-137-left-hand.js` | 16,857 | 137: left-hand column, Sounds panel, Hold, Arp, pad split; `__live3` |
| `510-live-138-shift-keyboard.js` | 18,509 | 138: Shift layers, computer keyboard runs Live; `__live4` |
| `520-live-139-log.js` | 9,095 | 139: Live's Log (per-second timeline, TL); `__live5` |
| `530-live-140-now-playing.js` | 10,998 | 140: Now playing column; `__live6` |
| `540-live-141-cpu.js` | 7,773 | 141: CPU readout; `__live7` |
| `550-live-142-recorder.js` | 15,752 | 142: Live's recorder (REC_SRC worklet, IndexedDB, WAV/MP3 takes); `__live8` |
| `560-live-143-stage-ready.js` | 22,088 | 143: sampling in Live, DJ lock / keys / crossfader; `__live9` |
| `570-live-144-arp-hold.js` | 6,943 | 144: Arp follows the layers, Hold lets go, dropout counting; `__live10` |
| `580-live-145-sound-buffer.js` | 2,512 | 145: sound buffer Fast / Steady; `__live11` |
| `590-live-147-jam.js` | 16,619 | 147: Jam in Live; `__live12` |
| `600-live-148-link.js` | 35,105 | 148: Nate Bloom link (MQTT 3.1.1 client, WebRTC, pairing, Stage); `__live13` |
| `610-live-149-log-everywhere.js` | 3,622 | 149: Log on every screen; `__live14` |
| `620-live-150-audio-devices.js` | 3,376 | 150: audio device list for reports, K.O. II card; `__live15` |
| `630-live-151-fx-key.js` | 1,316 | 151: the ` key toggles every effect; `__live16` |
| `640-live-152-midi-rescan.js` | 3,115 | 152: MIDI devices that arrive later, Rescan; `__live17` |
| `650-live-153-gear-menu.js` | 7,492 | 153: Gear in the ☰ menu, tablet diagnostics; `__live18` |
| `660-live-154-state-shell.js` | — | 154 (stage 0): the state document `NBState` and the new-shell switch (`shWant`: the shell is on; `nb-shell=old` in storage is the test suite's hook for the parked chrome, see below); `__live19` |
| `670-stage1-setup-strip-find.js` | 32,215 | 155 (stage 1): Set up (seven sections, today's sheets parked inside), Find, the strip; `__live20` |
| `680-stage2-play.js` | 17,628 | 157 (stage 2): Play, the performance surface over Live's own parts; `__live21` |
| `690-stage3-sync.js` | 14,072 | 158 (stage 3): the document over the link as patches, the console's intents (mixer pos / mute / solo, set list, the Library), permissions with the Accept bar, songs that carry their levels; `__live22` |
| `700-stuck-notes-159.js` | 4,659 | 159: the net under lost note-offs: Stop all forces every voice off, a watchdog for MIDI notes nothing could still hold, the log; `__live23` |
| `710-xy-level-159.js` | 3,225 | 159: the Pixelbook's XY pad holds the level (a rider after the soft clipper, from the analyser); `__live24` |
| `720-xy-modes-159.js` | 4,692 | 159: the XY pad's modes (which two controls it moves), chosen from the Pixelbook, kept on the tablet; `__live25` |
| `730-stage4-audio.js` | 2,924 | 160 (stage 4): the audio line to the Pixelbook (the output after the limiter as a stereo Opus track on the link's direct line, on request); `__live26` |
| `740-stage5-build.js` | — | 161 (stage 5): Build, the seven screens as tabs under the strip with one transport, the browser and the mixer as drawers; the old chrome parked; `__live27` |
| `750-minilab-octave-transport.js` | — | 165: the MiniLab's Oct − / Oct + followed from the notes its keys send (the keyboard sends nothing for them); Shift + pads 13–16 from its DAW port drive ▶ ■ ●; `__live28` |
| `760-minilab-screen.js` | — | 166: the MiniLab's screen shows where you are (two seconds after the last readout: the sound the keys play, the set-list song with "> next" or the tempo and key; repainted only when the text changes), and "Light up the MiniLab (pads, screen)" in the MIDI sheet's MiniLab section, one tap for the Lights box; `__live29` |
| `770-elephant.js` | — | 166: Elephant, the sampler's fourth mode (right of Grain): the slot's sample plays as Play plays it with a shape sized to its length riding on it (pitch glide up, two formants opening, a saw-wave growl that grows with the climb, a tanh drive, a dive at the end); knobs Glide · Wah · Growl · Drive · Length (×1 = the sample's, so Fit puts the dive on its end) · dB (−24…+12); the pad under the sample bar moves Wah and Growl live (the knobs follow); Shape… is a sheet like the sample editor's: the waveform with the shape over it (drag the amber end), the pad, sliders, Preview, Fit, Reset. The voice hooks into makeSampleVoice (020) so the per-sound level and FX routing apply. `window.__live30`. |
| (167) | — | 167: the strip and the Build bar sit below the phone's status bar (`--sat`, the top safe-area inset, added to every fixed offset under the strip; 020-style.css); Twist (`wam/natebloom/twist`: Plaits as an eight-voice plugin instrument) and Galactic (`wam/natebloom/galactic`: Airwindows' Galactic3 as a plugin reverb) through the C++ port path (`wam/natebloom/lib/nbport.js`), whose effect input is now wired (every ported effect used to pass silence — Glitch Starter among them); the plugin panel shows a long menu as a picker. |
| `780-elephant-fx.js` | — | 168: Elephant as a general effect in the FX Lab (after Shimmer): the elephant's voice on the master, set off by every note at that note's pitch (a chord once, at its lowest), the mix vocoded onto it; Glide · Wah · Growl · Blend · Drive · Length (seconds) · Level; `window.__live31`. The sampler's mode (770) stays. |
| (168) | — | 168: the Juno engine after the Juno-106 and the KR-106 (020/010/030: a DCO mix knob — saw, saw+pulse, pulse, pulse+sub, sub+noise — the chorus as the 106's buttons Off · I · II · I+II, the HPF switch); Duet 80 1.3 (`wam/natebloom/duet80`): Tape, Echo and Reverb after the chorus, the algorithms after JS80P's. |
| `899i-box.js` | — | (box, site-only) the Nate Bloom Box (`?box=1`, `box/`): Play at start, the box's status chips in Play's top bar (temperature, low power, headphone output, Wi-Fi) from `window.NBBox` (the Linux app's preload with `--box`), Box… (text size, screen turn, Wi-Fi, update, restart, reboot, hold to shut down); ⌂ Home (the box's home screen, `box/apps/home.html`, when `NBBox.apps()` says it's installed); `html.nb-box` styles in 020 hide Play's on-screen keys; `window.__box` |
| `899k-box-osk.js` | — | (box, site-only) an on-screen keyboard for text fields in box mode (`.nbosk`); steps aside for 10 minutes once real keys are typed; Done fires `change`; `window.__nbosk`. In box mode 899i also loads `/box/jam.js` (the Jam-along chip and level sheet) and sets `window.__nbAppMidi`; 140's `onMidi` asks `window.__midiTap(e)` first, so jam.js can take the level fader while its sheet is open |
| `899j-play-big-knob.js` | — | the big knob in Play/Live: turn picks the sound (browse), Shift + turn the knob page, click ★ favorites the sound playing, Shift + click ● Rec; the sound's name large in the middle while turning (`.pk-flash` in 020); `window.__pk` |
| `900-minilab-close.js` | 261 | `__mod.nbCC`, `window.__ml` exports, `}` closing the MiniLab/Live block |
| `990-iife-close.js` | 105 | wake lock request; `})();` |

### lite/ and tools/
| part | bytes | holds |
| --- | ---: | --- |
| `lite/sim.html` | 8,712 | the virtual Chromebook page, copied into `lite/` as is |
| `tools/make_lite.py` | — | the Lite substitutions (`make_lite()`), manifest and service worker text; also a CLI |
| `tools/sim_head.js` | 9,308 | the simulator head script Lite inlines after `window.NB_LITE = true` |
| `tools/where.py` | — | find which part holds a piece of text |


## The data that isn't in the page (162)

The site page carries an index of the kits (names, notes), a list of the Studio kit's sounds and an empty dictionary constant; the sounds themselves and the speech dictionary are files the build writes into `<outdir>/snd/` (`kit-<slug>.json` for each kit, `studio-kit.json`, `sp-dict.b64`) and the repo keeps in `snd/`. The page fetches each the first time it's needed (the Studio kit warms up on its own after the page settles) and the service worker keeps it for offline. `build.py` makes the index files from `data/kits.js`, `data/studio.js` and `data/sp-dict.js` as virtual includes (`data/kits-index.js`, `data/studio-index.js`, `data/sp-dict-lazy.js`); the artifact, one file by nature, includes the real ones (`@art-only`). The site page went from 7.8 MB to 3.1 MB.
