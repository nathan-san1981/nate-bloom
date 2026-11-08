# Nate Bloom

A synth, sequencer, sampler and small studio for the phone, tablet and computer:
<https://nathan-san1981.github.io/nate-bloom/> (the full app) and `/lite/` (the lighter one). The Android app
(`android/`) and the Linux app (`linux/`) add low-latency pads and plugins, USB MIDI, Link between the two apps and
Ableton Link; their releases are on the Releases page.

`/synths/` (or `?synths=1`) is **Nate Bloom Synths**: the synths alone on one screen, installed as its own app, for the
Galaxy Tab on the Yamaha P-225. Big sliders for the sound (tap or slide; ↺ back to default), each effect On or Off,
● Record (then Play, Save as MP3 or Delete), keys on screen when no keyboard is plugged in. When the Yamaha's USB port appears, every synth goes back to its default sound and chords and scale lock go
off. *Plays* picks Piano (the synth ignores the Yamaha), Synth (the Yamaha's own sound off, by MIDI Local
Control, sent again each time it's plugged in) or Piano + Synth; the piano's sound comes back when the page closes. The
Box (`?box=1`) never shows it. Code: `src/app/899l-synths.js`.

## Licence

Nate Bloom is free software under the GNU General Public License, version 3 or later (`LICENSE`). What it includes
from others, and under which licences, is in `NOTICE.md`.
