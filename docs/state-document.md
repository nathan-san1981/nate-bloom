# The state document (schema 1)

One JSON object describes the whole instrument. The tablet owns it; everything else reads it and asks for changes.
`window.NBState` in the page is the API (stage 0 of the rebuild, build 154).

## Shape

| Section | Holds | Read from today |
| --- | --- | --- |
| `rig` | `build` (the page's build number, 159+), `minilab`, `ko2`, `pixelbook` (booleans), `computerKeys`, `sync` (lead · follow · off), `out` (where the sound goes), `devices` (audio devices Android or the browser list), `volume` `{music, max}` (Android app 1.0.8+), `buffer` (fast · safe …), `latencyMs`, `android`, `app` (the Android app's version), `purist` | Gear, the MIDI layer, the Android bridge's `diag` |
| `transport` | `tempo`, `playing` `{seq, rc, bp}`, `target` (what ▶ plays), `live`, `key` `{root, scale}`, `octave`, `rec` (seconds recording, or null) | the sequencer, the Rhythm Creator, Beat Pads, Live |
| `stack` | `layers[]` `{name, arp}`, `sound` `{name, sub}` | the sounds that play together |
| `mixer` | `[{group, name, sub, level, dflt, pos, text, muted, solo}]` in the Mixer's order; `pos` is the slider 0–100, `text` the dB reading (stage 3) | `mixChannels()`, 158's mute / solo memory |
| `fx` | `on` | the FX switch (the ` key) |
| `knobs` | the MiniLab page: `name`, `k[8]`, `f[4]` as `[name, text, value]` | Live's knob pages |
| `pads` | `name` (the pad set), `n[]` (pad names) | Live's pad sets |
| `keys` | `hold`, `held[]` (note names), `arp` `{on, oct}` | Hold, the arp |
| `setlist` | `cur`, `n`, `name`, `next`, `pending` (switching on the next bar), `songs[] {name, bpm}` | the set list |
| `jam` | `loops[]`, `band` | Jam |
| `health` | `dropouts` (last minute), `buffer`, `latencyMs`, `notes[]` (what the tablet's view says is wrong) | the dropout counter, Gear |
| `perms` | `levels`, `scenes`, `sound`: `always` · `between-songs` · `ask` · `never` | Set up → Pixelbook (stage 1); stored as `nb-perms` |

Every document carries `schema: 1`, `ver` (bumps on any change) and `secs` (one version per section). A section's version changes only when its contents change.

## API

- `NBState.get()` → the document (re-read at most every 100 ms).
- `NBState.refresh()` → re-read now.
- `NBState.subscribe(fn)` → `fn(doc, changedSections)` once now and on every change (polled 4× a second while anyone listens); returns the unsubscribe function.
- `NBState.intent({ path, value, index?, base? })` → `{ ok, msg, ver, value? }`. With `base` (the section version the sender saw), an intent on a section that changed since is refused with `value` = the section as it stands now. The tablet wins every conflict.
- `NBState.perms()` → the permissions object.

Intents in stage 0: `fx.on` (value: boolean) · `transport.tempo` (50–180) · `mixer.level` (index, value 0–2) · `setlist.go` (index) and `setlist.next` · `perms` (value: partial object).

Intents since stage 3 (158): `mixer.pos` (index, value 0–100: the slider) · `mixer.mute` and `mixer.solo` (index, value: boolean; the mixer has levels only, so these remember and restore) · `setlist.prev` · `setlist.save` (what plays now into the current song) · `setlist.add` (value: a name; from what plays now) · `stack.replace` and `stack.add` (value: a library entry id; a preset of an engine that already plays sets that engine) · `stack.drop` (value: a layer's name, or index) · `library.fav` (value: id, on?: boolean; the tablet's own ★ list). A song saved since 158 carries `mix` (`[[channel, level]]`) and recalls it with the scene.

Permissions gate them: `levels` (`mixer.*`), `scenes` (`setlist.*`), `sound` (`stack.*`); `always` · `between-songs` (refused while anything plays) · `ask` (a bar on the tablet, Accept or No, 20 s; the intent answers "asked on the tablet") · `never`. Set up → Pixelbook holds them; the defaults are always, always, between-songs.

## Over the link (stage 3)

While the Pixelbook is linked the tablet sends `doc` messages: `{ ver, secs, patch: { section: contents, … }, whole? }`, one at most every 120 ms with the sections that changed, and the whole document on `hi`, on `pull { kind: "doc" }` and when the link comes up. The Pixelbook sends `intent { id, path, value?, index?, base? }` and gets `ack { id, intent, ok, msg, ver, value? }`; `pull { kind: "library" }` answers with `data { kind: "library", cats, favs, list[] {id, name, sub, cat} }`, and a favourite toggled sends `data { kind: "favs", favs }`. Nothing on the tablet waits for the Pixelbook: an intent that arrives late or never changes nothing.

Every applied intent is logged (`state` in the Log) and the last 40 go into reports as `stateLog`; every report carries the document as `stateDoc`.

## Next

- Stage 1: the strip reads `rig`, `transport` and `health`; Set up → Pixelbook edits `perms`; Find lists the intents as actions.
- Stage 3 (done in 158): the link carries the document as patches beside today's `st` / `data` messages (the Monitor, Hands, Editor still read those), and the Pixelbook's Mixer, Library and Director send intents.
- Later: the Monitor and the Editor read the document too, and `st` goes.
