# Nate Bloom inventory summary

Source: `/home/claude/night-bloom-site/index.html` (read-only). Rows in `inventory.csv`: **337** — 7 views, 45 sheet rows, the rest controls, keys and layouts. A row with two destinations (`A; B`) is counted under each in the second table.

## Rows per area

| area | rows |
|---|---|
| Main screen | 83 |
| Live | 38 |
| DJ | 27 |
| Beat Pads | 23 |
| Keys | 23 |
| Garage | 18 |
| Rhythm Creator | 18 |
| MiniLab | 14 |
| ☰ menu | 13 |
| K.O. II | 9 |
| Sheet: midiSheet | 9 |
| Android app | 8 |
| Tracks | 6 |
| Sheet: helpSheet | 5 |
| Pixelbook | 4 |
| Sheet: lkSheet | 2 |
| Sheet: melodies | 2 |
| Sheet: mixer | 2 |
| Sheet: wamSheet | 2 |
| Sheet: beats | 1 |
| Sheet: browser | 1 |
| Sheet: editor | 1 |
| Sheet: exitSheet | 1 |
| Sheet: exports | 1 |
| Sheet: fxLab | 1 |
| Sheet: gbSheet | 1 |
| Sheet: hisSheet | 1 |
| Sheet: installSheet | 1 |
| Sheet: layers | 1 |
| Sheet: lineSheet | 1 |
| Sheet: lkCode | 1 |
| Sheet: lvPick | 1 |
| Sheet: menuSheet | 1 |
| Sheet: miniMap | 1 |
| Sheet: miniStrip | 1 |
| Sheet: motion | 1 |
| Sheet: mySounds | 1 |
| Sheet: nameSheet | 1 |
| Sheet: nowPop | 1 |
| Sheet: playSheet | 1 |
| Sheet: projects | 1 |
| Sheet: qkSheet | 1 |
| Sheet: reportSheet | 1 |
| Sheet: scaleSheet | 1 |
| Sheet: secPick | 1 |
| Sheet: smartSheet | 1 |
| Sheet: song | 1 |
| Sheet: tabMenu | 1 |
| Sheet: wlSheet | 1 |
| Sheet: wvDock | 1 |

## Rows per new_home (space, first destination)

| new_home | rows |
|---|---|
| Build | 156 |
| Set up | 79 |
| Play | 62 |
| Strip | 30 |
| Dropped | 8 |
| ? | 1 |
| Pixelbook | 1 |

## Rows per new_home (space · section, zone or tab)

| new_home | rows |
|---|---|
| Build · Sounds | 35 |
| Build · Beats | 26 |
| Build · DJ | 23 |
| Set up · MIDI | 22 |
| Play · right-thumb | 19 |
| Set up · Help | 18 |
| Build · Tracks | 16 |
| Play · bottom bar | 15 |
| Build · Samples | 14 |
| Build · Rhythm | 13 |
| Build · transport | 13 |
| Set up · Projects | 13 |
| Play · pads | 12 |
| Build · Songs | 11 |
| Set up · Sound check | 9 |
| Dropped | 8 |
| Strip | 8 |
| Play · sound cards | 7 |
| Set up · App | 7 |
| Set up · Pixelbook | 7 |
| Build · browser drawer | 6 |
| Play · macro knobs | 6 |
| Play · sound picker | 6 |
| Build · mixer drawer | 5 |
| Set up · Gear | 5 |
| Strip · space switcher | 5 |
| Play · keys fallback | 4 |
| Strip · tempo | 4 |
| Strip · undo | 4 |
| Find | 2 |
| Play | 2 |
| Strip · Log | 2 |
| Strip · notifications | 2 |
| ? | 1 |
| Build · Beats / Rhythm tabs | 1 |
| Build · Beats → Samples | 1 |
| Build · Beats → Tracks | 1 |
| Build · DJ → Tracks | 1 |
| Build · Sounds (Keys) / Beats (Seq) / Songs (Notes) | 1 |
| Build · Sounds / Samples / Beats tabs | 1 |
| Build · all editors | 1 |
| Pixelbook · Band / Director / Mixer | 1 |
| Play · lock | 1 |
| Play · popups | 1 |
| Set up · Gear + MIDI clock + Sound check | 1 |
| Strip (undo) + Set up · Projects | 1 |
| Strip · MiniLab | 1 |
| Strip · MiniLab dot | 1 |
| Strip · MiniLab dot → Play macro knobs | 1 |
| Strip · dropout counter | 1 |
| Strip · dropout counter / Log | 1 |
| Strip · headphone route / limiter | 1 |
| Strip · space switcher + Build tabs | 1 |
| Strip · space switcher + Set up | 1 |
| Strip · tempo / bar:beat | 1 |

## Rows marked `?`

- Main screen · button · `jumpPlay` · ▼ Pads — ? (only if Play/Build keys can scroll off screen)

## Rows marked Dropped (each names the duplicate)

- Main screen · `perfBtn` · ⤢ Play view → Dropped (duplicate of Play keys fallback)
- Main screen · `carryBar` · Still playing → Dropped (duplicate of Playing ▾ / Play cards)
- Tracks · `tracks` · Tracks (legacy) → Dropped (duplicate of Build · Tracks, the Garage timeline)
- Tracks · `trkHome / trkPlay / trkRec / trkTime` · ⏮ ▶ ● time → Dropped (duplicate of Garage transport)
- Tracks · `trkAdd / trkImport / trkSplit / trkDup / trkDel / trkAutoAdd` · + Track · Import · Split · Copy · Delete · + Automation → Dropped (duplicate of Garage region menu + laneAdd)
- Tracks · `trkUndo / trkRedo / trkSnap / trkZoomOut / trkZoomIn / trkWithBeat / trkBounce / trkExport` · ↶ ↷ Snap Zoom + Beat Bounce Export WAV → Dropped (duplicate of Garage zoom, Export sheet, Bounce to a track)
- Tracks · `trkGain / trkNorm` · Clip gain · Normalize → Dropped (duplicate of Garage Gain & fades)
- Tracks · `trkMin / trkMini` · Play along · mini bar → Dropped (duplicate of gbMini)

## Sheets and panels found that are not in the orientation list

- smartSheet (DJ Smart mix plan)
- wamSheet (Plugins) + wamGui (plugin GUI dock)
- menuSheet (the ☰ Menu tiles)
- playSheet (How the keys play: Chord · Scale · Blend, opened by the playOpts chip)
- #editor (class editor only: the sample editor)
- #browser (class browser: the Sounds browser with search, categories, favourites)
- wvDock (Natewave wavetable editor dock)
- miniMap + miniTab (MiniLab 3 map drawer at the right edge)
- miniStrip (MiniLab strip across the top on tablets)
- nowPop (Playing ▾ cards: Only this / Edit / ■ Stop)
- lkCode (Link pairing code dialog)
- rcPop (Rhythm Creator step options popup)
- gbRmenu (Garage region menu)
- Live popups beyond Gear / Jam / FX / set list / capture: Arp ⋯, Sounds, Keys (?), CPU & sound buffer, Recordings ▾, Sample
- Garage sub-sheets all rendered into gbSheet: Song settings, Track, Mixer, Smart Controls, My Songs, Export, Drum loops, Gain & fades, How the Garage works
- Gear popup parked on the main screen (☰ → Gear reuses Live's lvPick with a backdrop, rev 153)

### Views and bars not in the list

- gbMini (Garage play-along mini bar)
- trkMini (Tracks mini bar; hidden by CSS)
- start (Tap to start sound overlay)
- Morph/Motion row (built in JS, line 22918) and Analog bar (anBar) inside the Sound panel

## Corrections and findings

- Live's container is `#liveView`, not `#lv` (created in JS at line 28912). Its popups all share one element, `#lvPick`.
- Static `class="editor sheet"` elements: 34 (orientation said 35). `#layers` and `#editor` have class `editor` without `sheet`, so 36 editor cards in all; `gbSheet` has `editor sheet gb-sheet`.
- The Tracks view (`#tracks`) is legacy: CSS line 2348 hides `#betaTracksBtn` and `#trkMini` (`display:none !important`), and `migrateTracks()` (line 26201) moved its data into a Garage song called Tracks. It is only reachable through a Playing ▾ card if something still plays there. Its rows are marked Dropped (duplicate of the Garage).
- 15 synth engines in code (saw, analog, vital, juno, tyrell, choir, zeb, bells, fm, mono, sync, hoover, pluck, wave, speech); the Help text still says 13.
- 32 keydown listeners: 9 are shortcut maps (main screen 12286, Live 29849, DJ 30481, Beat Pads 18765, Garage 25825, Tracks 10542, undo 27546, backquote FX 31349, Esc layer stack 16659); the rest are focus-local (arrow keys on knobs, pads, Natewave, Live knob surfaces; Enter in text inputs; Esc on the MiniLab map, strip editor and plugin dock).
- ITEMS (line 17063) has 12 tiles. `gearBtn` is a hidden proxy button created at line 31424; `liveBtn` is created at line 29196. Tiles are skipped when their source button is hidden (Link outside the apps, Install once installed).
- The phone bottom tab bar is the same `#modes` group as the header, fixed to the bottom by CSS at line 1386.
- Help topic groups (15, line 27275) and the DJ / Beat Pads / Rhythm / Garage help sheets are a ready-made index for Find.
- Every full screen has a `[data-stopall]` ■ All button and a Log button (hdrLog, rcLog, bpLog, gbLog, lvLog, djLog) sharing one red dropout dot; the Strip must keep both.
- 'Keep 90s' lives in three places today: keepBtn (transport), djKeep (DJ ⋯) and Live's Sample 'What you just heard'; one Build transport control can cover all three.
- Live's `lvRec` button is now ● Loop (records into Beat Pads when ▶ plays Pads); the audio recorder is `lvTake` (● Rec) with `lvTakes` (▾ recordings list). Both must survive in Play's bottom bar.


## Checked off (build 161, stage 5)

Every row's new home exists on the page or on Stage: **336 done**, 1 n/a (a conditional row that turned out not to be needed), 0 open. Two columns were added to `inventory.csv`: `status` and `checked` (where the row is reached now). What "done" means here: the control still exists and its home is built — Build's seven tabs host today's screens whole (the synth editor, Beat Pads, the Rhythm Creator, the sampler, Song mode, the Garage and Tracks, DJ), so a control that lived on one of those screens is reached through the tab. The old header, the mode buttons, the tool row and the ☰ menu are parked out of sight rather than deleted, so nothing that still works by tapping them has broken; deleting them for size is the remaining clean-up.
